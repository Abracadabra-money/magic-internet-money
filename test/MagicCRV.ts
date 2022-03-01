import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { advanceTime, ChainId, duration, getBigNumber, impersonate } from "../utilities";
import { CurveVoter, IERC20, IFeeDistributor, MagicCRV } from "../typechain";
import { ISmartWalletWhitelist } from "../typechain/ISmartWalletWhitelist";

const CrvWhale = "0x7a16ff8270133f063aab6c9977183d9e72835428";
const Crv3Whale = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
const CurveSmartWalletWhitelist = "0xca719728Ef172d0961768581fdF35CB116e0B7a4";
const CurveDao = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";

describe("MagicCRV", async () => {
  let snapshotId;
  let CurveVoter: CurveVoter;
  let MagicCRV: MagicCRV;
  let CRV: IERC20;
  let CRV3: IERC20;
  let FeeDistibutor: IFeeDistributor;
  let deployerSigner;
  let curveDaoSigner;
  let crvWhaleSigner;
  let crv3WhaleSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 14296556,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
    await deployments.fixture(["MagicCRV"]);
    const { deployer, alice } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    crvWhaleSigner = await ethers.getSigner(CrvWhale);
    crv3WhaleSigner = await ethers.getSigner(Crv3Whale);

    CRV = await ethers.getContractAt<IERC20>("ERC20Mock", "0xD533a949740bb3306d119CC777fa900bA034cd52");
    CRV3 = await ethers.getContractAt<IERC20>("ERC20Mock", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490");
    FeeDistibutor = await ethers.getContractAt<IFeeDistributor>("IFeeDistributor", "0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc");

    await impersonate(CrvWhale);
    await impersonate(Crv3Whale);
    await CRV.connect(crvWhaleSigner).transfer(alice, (await CRV.balanceOf(CrvWhale)).div(2));

    CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");
    MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");

    const aliceSigner = await ethers.getSigner(alice);
    await CRV.connect(aliceSigner).approve(MagicCRV.address, ethers.constants.MaxUint256);

    // Authorize voter smart contract
    await impersonate(CurveDao);
    curveDaoSigner = await ethers.getSigner(CurveDao);
    const Whitelist = await ethers.getContractAt<ISmartWalletWhitelist>("ISmartWalletWhitelist", CurveSmartWalletWhitelist);
    await Whitelist.connect(curveDaoSigner).approveWallet(CurveVoter.address);
    expect(await Whitelist.check(CurveVoter.address)).to.be.true;

    const balance = await CRV.balanceOf(alice);
    await expect(MagicCRV.connect(aliceSigner).deposit(balance)).to.be.revertedWith("No existing lock found");

    await CRV.connect(crvWhaleSigner).transfer(CurveVoter.address, 1);
    await expect(CurveVoter.connect(aliceSigner).createMaxLock(1)).to.be.revertedWith("Ownable: caller is not the owner");

    // Create initial lock
    await CurveVoter.createMaxLock(1);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });
  
  it("should not be able to create another lock", async () => {
    await expect(CurveVoter.connect(deployerSigner).createMaxLock(1)).to.be.revertedWith("Withdraw old tokens first");
  });

  it("should deposit CRV and receive the same amount in magicCRV tokens", async () => {
    const [, alice] = await ethers.getSigners();

    const totalSupplyBefore = await MagicCRV.totalSupply();
    const crvBefore = await CRV.balanceOf(alice.address);
    const mCRVBefore = await MagicCRV.balanceOf(alice.address);

    await MagicCRV.connect(alice).deposit(crvBefore);
    const crvAfter = await CRV.balanceOf(alice.address);
    const mCRVAfter = await MagicCRV.balanceOf(alice.address);
    const totalSupplyAfter = await MagicCRV.totalSupply();

    expect(crvAfter).to.be.eq(0);
    expect(mCRVAfter.sub(mCRVBefore)).to.be.eq(crvBefore);
    expect(totalSupplyAfter.sub(totalSupplyBefore)).to.be.eq(crvBefore);
  });

  it("should claim 3crv rewards", async () => {
    const [, alice] = await ethers.getSigners();
    const crvBalance = await CRV.balanceOf(alice.address);
    const crv3Before = await CRV3.balanceOf(alice.address);

    await MagicCRV.connect(alice).deposit(crvBalance);
    await MagicCRV.connect(alice).claim();
    let crv3After = await CRV3.balanceOf(alice.address);
    expect(crv3After.sub(crv3Before)).to.be.eq(0);

    console.log("Advancing 3 weeks and generating 3crv rewards...");

    for (let i = 0; i < 3; i++) {
      await advanceTime(duration.weeks(1));
      await CRV3.connect(crv3WhaleSigner).transfer(FeeDistibutor.address, getBigNumber(100_000));
      await FeeDistibutor.connect(curveDaoSigner).checkpoint_token();
    }

    await MagicCRV.connect(alice).claim();
    crv3After = await CRV3.balanceOf(alice.address);
    expect(crv3After.sub(crv3Before)).to.be.gt(0);
  });

  it("should not be able to vote on gauge controller when not an allowed voter", async () => {
    const [, alice] = await ethers.getSigners();

    await expect(CurveVoter.connect(alice).voteForMaxMIMGaugeWeights()).to.be.revertedWith("NotAllowedVoter()");
  });

  it("should be able to vote on gauge controller", async () => {
    const [, alice, bob] = await ethers.getSigners();

    await CurveVoter.setAllowedVoter(alice.address, true);
    await CurveVoter.connect(alice).voteForMaxMIMGaugeWeights();
    await advanceTime(10 * 24 * 60 * 60); // 1 vote per 10 days

    await CurveVoter.connect(alice).voteForMaxMIMGaugeWeights();

    await expect(CurveVoter.connect(bob).voteForMaxMIMGaugeWeights()).to.be.revertedWith("NotAllowedVoter()");
    await CurveVoter.setAllowedVoter(bob.address, true);
    await expect(CurveVoter.connect(bob).voteForGaugeWeights("0xb0f5d00e5916c8b8981e99191A1458704B587b2b", 420)).to.be.revertedWith("Used too much power");

    await CurveVoter.setAllowedVoter(alice.address, false);
    await expect(CurveVoter.connect(alice).voteForMaxMIMGaugeWeights()).to.be.revertedWith("NotAllowedVoter()");
  });
});
