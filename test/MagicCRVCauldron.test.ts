/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import {
  CauldronV2,
  CurveVoter,
  DegenBox,
  ERC20Mock,
  ILevSwapperGeneric,
  IOracle,
  ISmartWalletWhitelist,
  ISwapperGeneric,
  MagicCRV,
  YearnVaultMock,
} from "../typechain";
import { expect } from "chai";
import { BigNumber } from "@ethersproject/bignumber";

// Top holders at the given fork block
const MIM_WHALE = "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5";
const CRV_WHALE = "0x7a16ff8270133f063aab6c9977183d9e72835428";
const CurveDao = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";
const CurveSmartWalletWhitelist = "0xca719728Ef172d0961768581fdF35CB116e0B7a4";

describe("MagicCRV Cauldron", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let Cauldron: CauldronV2;
  let MagicCRV: MagicCRV;
  let ProxyOracle: IOracle;
  let CRV: ERC20Mock;
  let Swapper: ISwapperGeneric;
  let LevSwapper: ILevSwapperGeneric;
  let DegenBox: DegenBox;
  let mimShare: BigNumber;
  let collateralShare: BigNumber;
  let crvWhaleSigner;
  let mimWhaleSigner;
  let magicCRVPrice;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 14296556,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
    await deployments.fixture(["MagicCRVCauldron"]);
    const { alice } = await getNamedAccounts();

    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("MagicCRVCauldron")).address);
    ProxyOracle = await ethers.getContract<IOracle>("MagicCRVProxyOracle");
    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
    MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");
    CRV = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xD533a949740bb3306d119CC777fa900bA034cd52");

    const spot = await ProxyOracle.peekSpot("0x");
    magicCRVPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
    console.log(`1 magicCRV = $${magicCRVPrice} usd`);
    console.log("spot: ", spot.toString());
    // 2.34$ per CRV since magicCRV ratio is 1:1 at this point
    expect(spot).to.be.eq("425792492651588003");

    Swapper = await ethers.getContract<ISwapperGeneric>(parameters.swapperName);
    LevSwapper = await ethers.getContract<ILevSwapperGeneric>(parameters.levSwapperName);

    await impersonate(MIM_WHALE);
    await impersonate(CRV_WHALE);

    crvWhaleSigner = await ethers.getSigner(CRV_WHALE);
    mimWhaleSigner = await ethers.getSigner(MIM_WHALE);

    // Authorize voter smart contract
    await impersonate(CurveDao);
    const CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");
    const curveDaoSigner = await ethers.getSigner(CurveDao);
    const Whitelist = await ethers.getContractAt<ISmartWalletWhitelist>("ISmartWalletWhitelist", CurveSmartWalletWhitelist);
    await Whitelist.connect(curveDaoSigner).approveWallet(CurveVoter.address);
    expect(await Whitelist.check(CurveVoter.address)).to.be.true;

    // Create initial lock
    await CRV.connect(crvWhaleSigner).transfer(CurveVoter.address, 1);
    await CurveVoter.createMaxLock(1);

    await CRV.connect(crvWhaleSigner).transfer(alice, (await CRV.balanceOf(CRV_WHALE)).div(2));

    await CRV.connect(crvWhaleSigner).approve(MagicCRV.address, ethers.constants.MaxUint256);
    await MagicCRV.connect(crvWhaleSigner).mint(await CRV.balanceOf(CRV_WHALE));
    const magicCRVAmount = await MagicCRV.balanceOf(CRV_WHALE);

    // Deposit yearn vault token in DegenBox for the liquidation swapper
    /*collateralShare = await DegenBox.toShare(MagicCRV.address, magicCRVAmount, true);
    await MagicCRV.connect(crvWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(crvWhaleSigner).deposit(MagicCRV.address, CRV_WHALE, Swapper.address, 0, collateralShare);

    // Deposit 5M MIM in DegenBox for LevSwapper
    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(5_000_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, LevSwapper.address, 0, mimShare);*/

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  xit("should liquidate the collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const yvTokenAmount = await DegenBox.toAmount(MagicCRV.address, collateralShare, false);
    const totalLiquidationPrice = magicCRVPrice * parseFloat(ethers.utils.formatEther(yvTokenAmount));

    console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of yvToken...`);
    const amountCollateralBefore = (await DegenBox.totals(MagicCRV.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await Swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

    const amountCollateralAfter = (await DegenBox.totals(MagicCRV.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(
      `Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`
    );

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
  });

  xit("should swap MIM for collateral and deposit back to degenbox", async () => {
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

      const amountCollateralBefore = (await DegenBox.totals(MagicCRV.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      const estimateGas = await LevSwapper.estimateGas.swap(alice, 0, shareAmount);
      await LevSwapper.swap(alice, 0, shareAmount);

      const amountCollateralAfter = (await DegenBox.totals(MagicCRV.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      const amountOut = parseFloat(ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore)));
      console.log(`Got ${amountOut.toLocaleString()} YearnVault Token from Leverage Swapper ($${(magicCRVPrice * amountOut).toLocaleString()})`);
      console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

      expect(amountMimAfter).to.be.lt(amountMimBefore);
      expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

      await network.provider.send("evm_revert", [snapshotId]);
    }
  });
});
