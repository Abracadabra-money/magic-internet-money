/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { CauldronV3, DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, ISwapperGeneric, ProxyOracle, YearnVaultMock } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { ParametersPerChain as yvDAIParameters } from "../deploy/yvDAI";

// Top holders at the given fork block
const MIM_WHALE = "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5";
const FORKBLOCK = 14571461;

// In order:
// 0: name
// 1: hardhat deployment script name
// 2: underlying token address
// 2: underlying token whale 
// 3: oracle price - Beware that its value is based on the value at FORKBLOCK
const cases = [
  ["yvDAI", "yvDAI", "0x6B175474E89094C44Da98b954EedeAC495271d0F", "0x918cf3abf9cdecfe78168c5b4f7793821f18c43a", "972518355574135649", yvDAIParameters[ChainId.Mainnet]]
];

forEach(cases).describe(
  "%s Cauldron",
  async (
    _name,
    deploymentName,
    underlyingToken,
    underlyingTokenWhale,
    oracleExpectedPrice,
    parameters,
  ) => {
    let snapshotId;
    let MIM: ERC20Mock;
    let YearnVault: YearnVaultMock;
    let YearnVaultAsErc20: ERC20Mock;
    let UnderlyingToken: ERC20Mock;
    let Cauldron: CauldronV3;
    let ProxyOracle: IOracle;
    let Swapper: ISwapperGeneric;
    let LevSwapper: ILevSwapperGeneric;
    let DegenBox: DegenBox;
    let mimShare: BigNumber;
    let collateralShare: BigNumber;
    let deployerSigner;
    let yvTokenPriceInMim;

    before(async () => {
      await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
              blockNumber: FORKBLOCK,
            },
          },
        ],
      });

      hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
      await deployments.fixture([deploymentName]);
      const { deployer } = await getNamedAccounts();
      deployerSigner = await ethers.getSigner(deployer);

      Cauldron = await ethers.getContractAt<CauldronV3>("CauldronV3", (await ethers.getContract(parameters.cauldronDeploymentName)).address);
      ProxyOracle = await ethers.getContractAt<IOracle>("IOracle", "0x39DBa7955cEE12578B7548dF7eBf88F835d51bE1");
      DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
      MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
      YearnVault = await ethers.getContractAt<YearnVaultMock>("YearnVaultMock", parameters.collateral);
      YearnVaultAsErc20 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", parameters.collateral);
      UnderlyingToken = await ethers.getContractAt<ERC20Mock>("ERC20Mock", underlyingToken);

      Swapper = await ethers.getContract<ISwapperGeneric>(parameters.swapperName);
      LevSwapper = await ethers.getContract<ILevSwapperGeneric>(parameters.levSwapperName);

      await impersonate(MIM_WHALE);
      await impersonate(underlyingTokenWhale);

      const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
      const underlyingTokenWhaleSigner = await ethers.getSigner(underlyingTokenWhale);

      // Mint yearn vault tokens
      const underlyingTokenAmount = await UnderlyingToken.balanceOf(underlyingTokenWhale);
      await UnderlyingToken.connect(underlyingTokenWhaleSigner).approve(YearnVault.address, underlyingTokenAmount);

      console.log(`Depositing ${underlyingTokenAmount} token inside yearn vault ${YearnVault.address}...`)
      await YearnVault.connect(underlyingTokenWhaleSigner).deposit(underlyingTokenAmount, underlyingTokenWhale);
      const yearnTokenAmount = await YearnVaultAsErc20.balanceOf(underlyingTokenWhale);
      console.log(`Got ${yearnTokenAmount} yvToken back`)

      // Deposit yearn vault token in DegenBox for the liquidation swapper
      collateralShare = await DegenBox.toShare(YearnVault.address, yearnTokenAmount, true);
      await YearnVaultAsErc20.connect(underlyingTokenWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(underlyingTokenWhaleSigner).deposit(YearnVault.address, underlyingTokenWhale, Swapper.address, 0, collateralShare);

      // Deposit 5M MIM in DegenBox for LevSwapper
      mimShare = await DegenBox.toShare(MIM.address, getBigNumber(5_000_000), true);
      await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, LevSwapper.address, 0, mimShare);

      const spot = await ProxyOracle.peekSpot(parameters.oracleData);
      yvTokenPriceInMim = 1 / parseFloat(ethers.utils.formatEther(spot));
      console.log(`1 yvToken = ${yvTokenPriceInMim} MIM`);
      console.log("spot: ", spot.toString());
      expect(spot).to.be.eq(oracleExpectedPrice);

      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the collateral and deposit MIM back to degenbox", async () => {
      const { alice } = await getNamedAccounts();

      const yvTokenAmount = await DegenBox.toAmount(YearnVault.address, collateralShare, false);
      const totalLiquidationPrice = yvTokenPriceInMim * parseFloat(ethers.utils.formatEther(yvTokenAmount));

      console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of yvToken...`);
      const amountCollateralBefore = (await DegenBox.totals(YearnVault.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      await Swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

      const amountCollateralAfter = (await DegenBox.totals(YearnVault.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      console.log(`Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`);

      expect(amountMimAfter).to.be.gt(amountMimBefore);
      expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
    });

    it("should swap MIM for collateral and deposit back to degenbox", async () => {
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
        console.log(` > From ${parseFloat(ethers.utils.formatEther(shareAmount)).toLocaleString()} MIM shares`);

        const amountCollateralBefore = (await DegenBox.totals(YearnVault.address)).elastic;
        const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

        const estimateGas = await LevSwapper.estimateGas.swap(alice, 0, shareAmount);
        await LevSwapper.swap(alice, 0, shareAmount);

        const amountCollateralAfter = (await DegenBox.totals(YearnVault.address)).elastic;
        const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

        const amountOut = parseFloat(ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore)));
        console.log(`Got ${amountOut.toLocaleString()} YearnVault Token from Leverage Swapper ($${(yvTokenPriceInMim * amountOut).toLocaleString()})`);
        console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

        expect(amountMimAfter).to.be.lt(amountMimBefore);
        expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

        await network.provider.send("evm_revert", [snapshotId]);
      }
    });
  }
);
