/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { CauldronV2, DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, ISwapperGeneric, YearnVaultMock } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";
import { ParametersPerChain as yvCVXETHVParameters } from "../deploy/yvCVXETH";
import { ParametersPerChain as yvMIM3CRVParameters } from "../deploy/yvMIM3CRV";

// Top holders at the given fork block
const MIM_WHALE = "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5";
const FORKBLOCK = 14258111;

// In order:
// 0: name
// 1: hardhat deployment script name
// 2: curve token address
// 2: curve token whale 
// 3: oracle price - Beware that its value is based on the value at FORKBLOCK
const cases = [
  ["yvMIM3CRV", "yvMIM3CRV", "0x5a6A4D54456819380173272A5E8E9B9904BdF41B", "0xbcd0e1cbd64e932a47f9dffcb3dbc3f0814c3e9f", "923323510514221085", yvMIM3CRVParameters[ChainId.Mainnet]],
  ["yvCVXETH", "yvCVXETH", "0x3A283D9c08E8b55966afb64C515f5143cf907611", "0x38ee5f5a39c01cb43473992c12936ba1219711ab", "2127532160056478", yvCVXETHVParameters[ChainId.Mainnet]],
];

forEach(cases).describe(
  "%s Cauldron",
  async (
    _name,
    deploymentName,
    curveToken,
    curveTokenWhale,
    oracleExpectedPrice,
    parameters,
  ) => {
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
      await deployments.fixture([deploymentName]);
      const { deployer } = await getNamedAccounts();
      deployerSigner = await ethers.getSigner(deployer);

      Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract(parameters.cauldronDeploymentName)).address);
      ProxyOracle = await ethers.getContract<IOracle>(parameters.proxyOracleDeploymentName);
      DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
      MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
      YearnVault = await ethers.getContractAt<YearnVaultMock>("YearnVaultMock", parameters.collateral);
      YearnVaultAsErc20 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", parameters.collateral);
      CurveToken = await ethers.getContractAt<ERC20Mock>("ERC20Mock", curveToken);

      Swapper = await ethers.getContract<ISwapperGeneric>(parameters.swapperName);
      LevSwapper = await ethers.getContract<ILevSwapperGeneric>(parameters.levSwapperName);

      await impersonate(MIM_WHALE);
      await impersonate(curveTokenWhale);

      const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
      const curveTokenWhaleSigner = await ethers.getSigner(curveTokenWhale);

      // Mint yearn vault tokens
      const curveTokenAmount = await CurveToken.balanceOf(curveTokenWhale);
      await CurveToken.connect(curveTokenWhaleSigner).approve(YearnVault.address, curveTokenAmount);

      console.log(`Depositing ${curveTokenAmount} token inside yearn vault...`)
      await YearnVault.connect(curveTokenWhaleSigner).deposit(curveTokenAmount, curveTokenWhale);
      const yearnTokenAmount = await YearnVaultAsErc20.balanceOf(curveTokenWhale);
      console.log(`Got ${yearnTokenAmount} yvToken back`)

      // Deposit yearn vault token in DegenBox for the liquidation swapper
      collateralShare = await DegenBox.toShare(YearnVault.address, yearnTokenAmount, true);
      await YearnVaultAsErc20.connect(curveTokenWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(curveTokenWhaleSigner).deposit(YearnVault.address, curveTokenWhale, Swapper.address, 0, collateralShare);

      // Deposit 5M MIM in DegenBox for LevSwapper
      mimShare = await DegenBox.toShare(MIM.address, getBigNumber(5_000_000), true);
      await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, LevSwapper.address, 0, mimShare);

      const spot = await ProxyOracle.peekSpot("0x");
      yvTokenPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
      console.log(`1 yvToken = $${yvTokenPrice} usd`);
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
