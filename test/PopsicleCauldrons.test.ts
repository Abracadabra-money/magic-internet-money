/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, CauldronV2, ERC20Mock, IERC20, IOracle } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { PopsicleUSDCWETHSwapper, PopsicleUSDCWETHLevSwapper, IPopsicle } from "../typechain";
import { ParametersPerChain } from "../deploy/PopsicleCauldrons";

// Top holders at the given fork block
const MIM_WHALE = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

const parameters = [
  //["USDC/WETH", "0xe78388b4ce79068e89bf8aa7f218ef6b9ab0e9d0", 5_000_000],
  ["WETH/USDT", "0x773d161310d07CaFC6f767Ca24f43e52163b9BE6", 2_000_000],
];

const cases = ParametersPerChain[ChainId.Mainnet].cauldrons.map((c, index) => [...parameters[index], ...Object.values(c)]);

forEach(cases).describe(
  "Popsicle %s Cauldron",
  async (_name, plpWhale, maxInputAmount, plpAddress, cauldronName, proxyOracleName, _oracleImplName, swapperName, levSwapperName) => {
    let snapshotId;
    let MIM: IERC20;
    let PLP: IPopsicle;
    let token0: ERC20Mock;
    let token1: ERC20Mock;
    let token0Symbol: string;
    let token1Symbol: string;
    let token0Decimals: number;
    let token1Decimals: number;

    let Cauldron: CauldronV2;
    let ProxyOracle: IOracle;
    let PLPSwapper: PopsicleUSDCWETHSwapper;
    let PLPLevSwapper: PopsicleUSDCWETHLevSwapper;
    let DegenBox: BentoBoxV1;
    let mimShare: BigNumber;
    let plpShare: BigNumber;
    let deployerSigner;

    before(async () => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
              blockNumber: 13804033,
            },
          },
        ],
      });

      hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
      await deployments.fixture(["PopsicleCauldrons"]);
      const { deployer } = await getNamedAccounts();
      deployerSigner = await ethers.getSigner(deployer);

      Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract(cauldronName)).address);
      ProxyOracle = await ethers.getContract<IOracle>(proxyOracleName);
      DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
      MIM = await ethers.getContractAt<IERC20>("ERC20Mock", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
      PLP = await ethers.getContractAt<IPopsicle>("IPopsicle", plpAddress);

      token0 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", await PLP.token0());
      token1 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", await PLP.token1());
      token0Symbol = await token0.symbol();
      token1Symbol = await token1.symbol();
      token0Decimals = await token0.decimals();
      token1Decimals = await token1.decimals();

      PLPSwapper = await ethers.getContract<PopsicleUSDCWETHSwapper>(swapperName);
      PLPLevSwapper = await ethers.getContract<PopsicleUSDCWETHLevSwapper>(levSwapperName);

      await impersonate(MIM_WHALE);
      await impersonate(plpWhale);

      const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
      const plpWhaleSigner = await ethers.getSigner(plpWhale);

      const plpAmount = await PLP.balanceOf(plpWhale);

      // Deposit plp in DegenBox for PopsicleUSDCWETHSwapper
      plpShare = await DegenBox.toShare(PLP.address, plpAmount, true);
      await PLP.connect(plpWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(plpWhaleSigner).deposit(PLP.address, plpWhale, PLPSwapper.address, 0, plpShare);

      // Deposit MIM in DegenBox for PLPLevSwapper
      mimShare = await DegenBox.toShare(MIM.address, getBigNumber(maxInputAmount), true);
      await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, PLPLevSwapper.address, 0, mimShare);

      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the PLP collateral and deposit MIM back to degenbox", async () => {
      const { alice } = await getNamedAccounts();

      const amountCollateralBefore = (await DegenBox.totals(PLP.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      await PLPSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, plpShare);

      const amountCollateralAfter = (await DegenBox.totals(PLP.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      console.log(`Got ${amountMimAfter.sub(amountMimBefore).toString()} MIM from Liquidation Swapper`);

      expect(amountMimAfter).to.be.gt(amountMimBefore);
      expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
    });

    it("should swap MIM for PLP and deposit back to degenbox", async () => {
      const mimShares = [
        mimShare,
        mimShare.div(5),
        mimShare.div(10),
        mimShare.div(20),
        mimShare.div(100),
        mimShare.div(1000),
        mimShare.div(10000),
      ];
      const { alice } = await getNamedAccounts();

      for (let i = 0; i < mimShares.length; i++) {
        const shareAmount = mimShares[i];
        console.log(` > From ${ethers.utils.formatEther(shareAmount)} MIM shares`);

        const amountCollateralBefore = (await DegenBox.totals(PLP.address)).elastic;
        const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

        const estimateGas = await PLPLevSwapper.estimateGas.swap(alice, 0, shareAmount);
        await PLPLevSwapper.swap(alice, 0, shareAmount);

        const amountCollateralAfter = (await DegenBox.totals(PLP.address)).elastic;
        const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

        console.log(`Got ${ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore))} PLP from Leverage Swapper`);

        console.log(
          "Remaining in the swapping contract:",
          ethers.utils.formatUnits(await token0.balanceOf(PLPLevSwapper.address), token0Decimals),
          `${token0Symbol}, `,
          ethers.utils.formatUnits(await token1.balanceOf(PLPLevSwapper.address), token1Decimals),
          `${token1Symbol}`
        );

        console.log("Gas Cost", estimateGas.toString());
        expect(amountMimAfter).to.be.lt(amountMimBefore);
        expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

        await network.provider.send("evm_revert", [snapshotId]);
      }
    });

    it("should have deployed the cauldron with the right parameters", async () => {
      expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);

      expect(await Cauldron.collateral()).to.eq(PLP.address);
      expect(await Cauldron.oracle()).to.eq(ProxyOracle.address);
      expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");
    });
  }
);
