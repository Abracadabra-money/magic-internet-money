/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, CauldronV2, IERC20, XJoeLevSwapper, XJoeSwapper } from "../typechain";
import { expect } from "chai";

const MIM_WHALE = "0x27C215c8b6e39f54C42aC04EB651211E9a566090";
const XJOE_WHALE = "0xf3537ac805e1ce18AA9F61A4b1DCD04F10a007E9";
const XJOE = "0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33";

describe("xJoe Cauldron", async () => {
  let snapshotId;
  let Cauldron: CauldronV2;
  let XJoe: IERC20;
  let MIM: IERC20;
  let XJoeSwapper: XJoeSwapper;
  let XJoeLevSwapper: XJoeLevSwapper;
  let BentoBox: BentoBoxV1;
  let mimShare;
  let xJoeShare;
  let deployerSigner;
  let aliceSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 6414640,
          },
        },
      ],
    });

    await deployments.fixture(["JoeBarCauldron"]);
    const { deployer, alice } = await getNamedAccounts();

    aliceSigner = await ethers.getSigner(alice);
    deployerSigner = await ethers.getSigner(deployer);

    // JoeBarCauldron deployment doesn't have the abi,
    // just use the address to get CauldronV2 from it instead.
    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("JoeBarCauldron")).address);
    XJoe = await ethers.getContractAt<IERC20>("ERC20", XJOE);
    BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x1fC83f75499b7620d53757f0b01E2ae626aAE530");
    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    XJoeSwapper = await ethers.getContract<XJoeSwapper>("XJoeSwapper");
    XJoeLevSwapper = await ethers.getContract<XJoeLevSwapper>("XJoeLevSwapper");

    await impersonate(XJOE_WHALE);
    await impersonate(MIM_WHALE);

    const xJoeWhaleSigner = await ethers.getSigner(XJOE_WHALE);
    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);

    // Deposit xJOE for Liquidation Swapper
    xJoeShare = await BentoBox.toShare(XJoe.address, getBigNumber(500_000), true);
    await XJoe.connect(xJoeWhaleSigner).approve(BentoBox.address, ethers.constants.MaxUint256);
    await BentoBox.connect(xJoeWhaleSigner).deposit(XJoe.address, XJOE_WHALE, XJoeSwapper.address, 0, xJoeShare);

    // Deposit MIM for Leverage Swapper
    mimShare = await BentoBox.toShare(MIM.address, getBigNumber(500_000), true);
    await MIM.connect(mimWhaleSigner).approve(BentoBox.address, ethers.constants.MaxUint256);
    await BentoBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, XJoeLevSwapper.address, 0, mimShare);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);
    console.log(Cauldron.address)
    expect(await Cauldron.collateral()).to.eq(XJOE);
    expect(await Cauldron.oracle()).to.eq("0x59B3D5dDf93A3782F7B7A4bE1214722fc6Fecd45");
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");

    const accrueInfo = await Cauldron.accrueInfo();
    expect(accrueInfo.INTEREST_PER_SECOND).to.eq("158440439");

    expect(await Cauldron.LIQUIDATION_MULTIPLIER()).to.eq("105000");
    expect(await Cauldron.COLLATERIZATION_RATE()).to.eq("85000");
    expect(await Cauldron.BORROW_OPENING_FEE()).to.eq("500");
  });

  it("should liquidate the xJOE collateral and deposit MIM back to bentobox", async () => {
    const { alice } = await getNamedAccounts();

    const amountXJoeBefore = (await BentoBox.totals(XJoe.address)).elastic;
    const amountMimBefore = (await BentoBox.totals(MIM.address)).elastic;

    await XJoeSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, xJoeShare);

    const amountXJoeAfter = (await BentoBox.totals(XJoe.address)).elastic;
    const amountMimAfter = (await BentoBox.totals(MIM.address)).elastic;

    //console.log(`Got ${(amountMimAfter.sub(amountMimBefore)).toString()} MIM from Liquidation Swapper`);

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountXJoeAfter).to.be.lt(amountXJoeBefore);
  });

  it("should swap MIM for xJOE and deposit back to bentobox", async () => {
    const { alice } = await getNamedAccounts();

    const amountXJoeBefore = (await BentoBox.totals(XJoe.address)).elastic;
    const amountMimBefore = (await BentoBox.totals(MIM.address)).elastic;

    await XJoeLevSwapper.swap(alice, 0, mimShare);

    const amountXJoeAfter = (await BentoBox.totals(XJoe.address)).elastic;
    const amountMimAfter = (await BentoBox.totals(MIM.address)).elastic;

    //console.log(`Got ${(amountXJoeAfter.sub(amountXJoeBefore)).toString()} USDC/AVAX from Leverage Swapper`);

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountXJoeAfter).to.be.gt(amountXJoeBefore);
  });
});
