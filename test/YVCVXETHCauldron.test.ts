/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { CauldronV2, DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, ISwapperGeneric, YearnVaultMock } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { ParametersPerChain } from "../deploy/yvCVXETHV";

// Top holders at the given fork block
const MIM_WHALE = "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5";
const FORKBLOCK = 14258111;

const CURVE_TOKEN_WHALE = "0x38ee5f5a39c01cb43473992c12936ba1219711ab"; 
const CURVE_TOKEN = "0x3A283D9c08E8b55966afb64C515f5143cf907611";
const ORACLE_EXPECTED_PRICE = "2127532160056478";

const parameters = ParametersPerChain[ChainId.Mainnet];

describe(
  "yvCVXETH Cauldron",
  async () => {
    let snapshotId;
    let MIM: ERC20Mock;
    let YearnVault: YearnVaultMock;
    let YearnVaultAsErc20: ERC20Mock;
    let CurveToken: ERC20Mock;
    let Cauldron: CauldronV2;
    let ProxyOracle: IOracle;
    let Swapper: ISwapperGeneric;
    let LevSwapper: ILevSwapperGeneric;
    let DegenBox: DegenBox;
    let mimShare: BigNumber;
    let collateralShare: BigNumber;
    let deployerSigner;
    let yvTokenPrice;

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
      await deployments.fixture(["yvCVXETH"]);
      const { deployer } = await getNamedAccounts();
      deployerSigner = await ethers.getSigner(deployer);

      Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract(parameters.cauldronDeploymentName)).address);
      ProxyOracle = await ethers.getContract<IOracle>(parameters.proxyOracleDeploymentName);
      DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
      MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
      YearnVault = await ethers.getContractAt<YearnVaultMock>("YearnVaultMock", parameters.collateral);
      YearnVaultAsErc20 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", parameters.collateral);
      CurveToken = await ethers.getContractAt<ERC20Mock>("ERC20Mock", CURVE_TOKEN);

      Swapper = await ethers.getContract<ISwapperGeneric>(parameters.swapperName);
      LevSwapper = await ethers.getContract<ILevSwapperGeneric>(parameters.levSwapperName);

      await impersonate(MIM_WHALE);
      await impersonate(CURVE_TOKEN_WHALE);

      const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
      const curveTokenWhaleSigner = await ethers.getSigner(CURVE_TOKEN_WHALE);

      // Mint yearn vault tokens
      const curveTokenAmount = await CurveToken.balanceOf(CURVE_TOKEN_WHALE);
      await CurveToken.connect(curveTokenWhaleSigner).approve(YearnVault.address, curveTokenAmount);
      await YearnVault.connect(curveTokenWhaleSigner).deposit(curveTokenAmount, CURVE_TOKEN_WHALE);
      const yearnTokenAmount = await YearnVaultAsErc20.balanceOf(CURVE_TOKEN_WHALE);
      
      // Deposit yearn vault token in DegenBox for the liquidation swapper
      collateralShare = await DegenBox.toShare(YearnVault.address, yearnTokenAmount, true);
      await YearnVaultAsErc20.connect(curveTokenWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(curveTokenWhaleSigner).deposit(YearnVault.address, CURVE_TOKEN_WHALE, Swapper.address, 0, collateralShare);

      // Deposit 5M MIM in DegenBox for LevSwapper
      mimShare = await DegenBox.toShare(MIM.address, getBigNumber(5_000_000), true);
      await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, LevSwapper.address, 0, mimShare);

      const spot = await ProxyOracle.peekSpot("0x");
      yvTokenPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
      console.log(`1 yvToken = $${yvTokenPrice} usd`);
      console.log("spot: ", spot.toString());
      expect(spot).to.be.eq(ORACLE_EXPECTED_PRICE);

      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the collateral and deposit MIM back to degenbox", async () => {
      const { alice } = await getNamedAccounts();

      const yvTokenAmount = await DegenBox.toAmount(YearnVault.address, collateralShare, false);
      const totalLiquidationPrice = yvTokenPrice * parseFloat(ethers.utils.formatEther(yvTokenAmount));

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
        console.log(`Got ${amountOut.toLocaleString()} YearnVault Token from Leverage Swapper ($${(yvTokenPrice * amountOut).toLocaleString()})`);
        console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

        expect(amountMimAfter).to.be.lt(amountMimBefore);
        expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

        await network.provider.send("evm_revert", [snapshotId]);
      }
    });
  }
);
