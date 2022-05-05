import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { advanceTime, blockNumber, ChainId, duration, getBigNumber, impersonate, latest } from "../utilities";
import { CurveVoter, DegenBox, ERC20Mock, IFeeDistributor, MagicCRV, ISmartWalletWhitelist, RewardHarvester } from "../typechain";
import { BigNumber } from "ethers";

const CrvWhale = "0x7a16ff8270133f063aab6c9977183d9e72835428";
const Crv3Whale = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
const CurveSmartWalletWhitelist = "0xca719728Ef172d0961768581fdF35CB116e0B7a4";
const CurveDao = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";

describe("MagicCRV", async () => {
  let snapshotId;
  let CurveVoter: CurveVoter;
  let MagicCRV: MagicCRV;
  let CRV: ERC20Mock;
  let CRV3: ERC20Mock;
  let FeeDistributor: IFeeDistributor;
  let RewardHarvester: RewardHarvester;
  let DegenBox: DegenBox;
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
    const { deployer, alice, bob } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    crvWhaleSigner = await ethers.getSigner(CrvWhale);
    crv3WhaleSigner = await ethers.getSigner(Crv3Whale);

    CRV = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xD533a949740bb3306d119CC777fa900bA034cd52");
    CRV3 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490");
    FeeDistributor = await ethers.getContractAt<IFeeDistributor>("IFeeDistributor", "0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc");

    await impersonate(CrvWhale);
    await impersonate(Crv3Whale);
    await CRV.connect(crvWhaleSigner).transfer(alice, (await CRV.balanceOf(CrvWhale)).div(2));
    await CRV.connect(crvWhaleSigner).transfer(bob, getBigNumber(1_000));

    CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");
    MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");
    RewardHarvester = await ethers.getContract<RewardHarvester>("RewardHarvester");

    const aliceSigner = await ethers.getSigner(alice);
    const bobSigner = await ethers.getSigner(bob);

    await CRV.connect(aliceSigner).approve(MagicCRV.address, ethers.constants.MaxUint256);
    await CRV.connect(bobSigner).approve(MagicCRV.address, ethers.constants.MaxUint256);

    // Authorize voter smart contract
    await impersonate(CurveDao);
    curveDaoSigner = await ethers.getSigner(CurveDao);
    const Whitelist = await ethers.getContractAt<ISmartWalletWhitelist>("ISmartWalletWhitelist", CurveSmartWalletWhitelist);
    await Whitelist.connect(curveDaoSigner).approveWallet(CurveVoter.address);
    expect(await Whitelist.check(CurveVoter.address)).to.be.true;

    const balance = await CRV.balanceOf(alice);
    await expect(MagicCRV.connect(aliceSigner).mint(balance)).to.be.revertedWith("No existing lock found");
    await expect(CurveVoter.connect(aliceSigner).createMaxLock(1)).to.be.revertedWith("Ownable: caller is not the owner");

    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("Max Locking", async () => {
    beforeEach(async () => {
      const { deployer } = await getNamedAccounts();

      await CRV.connect(crvWhaleSigner).transfer(deployer, getBigNumber(999));
      await CRV.connect(deployerSigner).approve(CurveVoter.address, ethers.constants.MaxUint256);
      await CurveVoter.createMaxLock(1);
    });

    it("should not be able to create another lock", async () => {
      await expect(CurveVoter.connect(deployerSigner).createMaxLock(1)).to.be.revertedWith("Withdraw old tokens first");
    });

    it("should deposit CRV and receive the 1:1 ratio in magicCRV tokens", async () => {
      const [, alice] = await ethers.getSigners();

      const totalSupplyBefore = await MagicCRV.totalSupply();
      const crvBefore = await CRV.balanceOf(alice.address);
      const mCRVBefore = await MagicCRV.balanceOf(alice.address);

      await MagicCRV.connect(alice).mint(crvBefore);
      const crvAfter = await CRV.balanceOf(alice.address);
      const mCRVAfter = await MagicCRV.balanceOf(alice.address);
      const totalSupplyAfter = await MagicCRV.totalSupply();

      expect(crvAfter).to.be.eq(0);
      expect(mCRVAfter.sub(mCRVBefore)).to.be.eq(crvBefore);
      expect(totalSupplyAfter.sub(totalSupplyBefore)).to.be.eq(crvBefore);
    });

    it("should changing the share ratio when harvesting many 1 week", async () => {
      const [, alice, bob] = await ethers.getSigners();
      let totalCrvBeforeMinting = await CurveVoter.totalCRVTokens();

      let crvBalance = await CRV.balanceOf(alice.address);
      await MagicCRV.connect(alice).mint(crvBalance);
      let magicCrvBalance = await MagicCRV.balanceOf(alice.address);
      await RewardHarvester.harvest(0);

      let totalSupply = await MagicCRV.totalSupply();
      const totalCrv = await CurveVoter.totalCRVTokens();
      let ratio = totalCrv.div(totalSupply);
      expect(ratio).to.be.eq(1);
      expect(totalCrv.sub(totalCrvBeforeMinting)).to.be.eq(crvBalance);

      // give 1 week rewards
      await advanceTime(duration.weeks(2));
      await CRV3.connect(crv3WhaleSigner).transfer(FeeDistributor.address, getBigNumber(100_000));
      await FeeDistributor.connect(curveDaoSigner).checkpoint_token();
      await expect(RewardHarvester.harvest(getBigNumber(99_999))).to.be.revertedWith("InsufficientOutput()");

      // at this block with the locked amount, should swap to a minimum of 8_000 crv
      await RewardHarvester.harvest(getBigNumber(1_000));
      totalSupply = await MagicCRV.totalSupply();
      expect(totalSupply).to.be.eq(magicCrvBalance);

      const totalCrvAfter = await CurveVoter.totalCRVTokens();
      expect(totalCrvAfter).to.be.gt(totalCrv);

      crvBalance = await CRV.balanceOf(bob.address);
      await MagicCRV.connect(bob).mint(crvBalance);
      magicCrvBalance = await MagicCRV.balanceOf(bob.address);

      // Bob shouldn't receive 1:1 share
      expect(magicCrvBalance).to.be.eq(crvBalance.mul(totalSupply).div(totalCrvAfter));
    });

    it("should changing the share ratio when harvesting many weeks", async () => {
      const [, alice, bob] = await ethers.getSigners();
      let totalCrvBeforeMinting = await CurveVoter.totalCRVTokens();

      let crvBalance = await CRV.balanceOf(alice.address);
      await MagicCRV.connect(alice).mint(crvBalance);
      let magicCrvBalance = await MagicCRV.balanceOf(alice.address);
      await RewardHarvester.harvestAll(0);

      let totalSupply = await MagicCRV.totalSupply();
      const totalCrv = await CurveVoter.totalCRVTokens();
      let ratio = totalCrv.div(totalSupply);
      expect(ratio).to.be.eq(1);
      expect(totalCrv.sub(totalCrvBeforeMinting)).to.be.eq(crvBalance);

      for (let i = 0; i < 3; i++) {
        await advanceTime(duration.weeks(1));
        await CRV3.connect(crv3WhaleSigner).transfer(FeeDistributor.address, getBigNumber(100_000));
        await FeeDistributor.connect(curveDaoSigner).checkpoint_token();
      }

      await expect(RewardHarvester.harvestAll(getBigNumber(99_999))).to.be.revertedWith("InsufficientOutput()");

      // at this block with the locked amount, should swap to a minimum of 8_000 crv
      await RewardHarvester.harvestAll(getBigNumber(8_000));
      totalSupply = await MagicCRV.totalSupply();
      expect(totalSupply).to.be.eq(magicCrvBalance);

      const totalCrvAfter = await CurveVoter.totalCRVTokens();
      expect(totalCrvAfter).to.be.gt(totalCrv);

      crvBalance = await CRV.balanceOf(bob.address);
      await MagicCRV.connect(bob).mint(crvBalance);
      magicCrvBalance = await MagicCRV.balanceOf(bob.address);

      // Bob shouldn't receive 1:1 share
      expect(magicCrvBalance).to.be.eq(crvBalance.mul(totalSupply).div(totalCrvAfter));
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
      await expect(CurveVoter.connect(bob).voteForGaugeWeights("0xb0f5d00e5916c8b8981e99191A1458704B587b2b", 420)).to.be.revertedWith(
        "Used too much power"
      );

      await CurveVoter.setAllowedVoter(alice.address, false);
      await expect(CurveVoter.connect(alice).voteForMaxMIMGaugeWeights()).to.be.revertedWith("NotAllowedVoter()");
    });

    it("should extend the max lock", async () => {
      await expect(CurveVoter.increaseMaxLock()).to.be.revertedWith("Can only increase lock duration");
      await advanceTime(7 * 24 * 60 * 60); // 1 week
      await CurveVoter.increaseMaxLock();
      await expect(CurveVoter.increaseMaxLock()).to.be.revertedWith("Can only increase lock duration");
      await advanceTime(7 * 24 * 60 * 60); // 1 week
      await CurveVoter.increaseMaxLock();
    });
  });

  it("should allow arbitrary execution", async () => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    expect(await CRV.balanceOf(CurveVoter.address)).to.be.eq(0);

    await CRV.connect(crvWhaleSigner).transfer(deployer.address, getBigNumber(999));
    await CRV.connect(deployerSigner).approve(CurveVoter.address, ethers.constants.MaxUint256);

    const currentTimestamp = await latest()
    await CurveVoter.createLock(1, currentTimestamp.add(duration.days(7)));
    expect(await CRV.balanceOf(CurveVoter.address)).to.be.eq(0);

    await expect(CurveVoter.connect(deployerSigner).release()).to.be.revertedWith("The lock didn't expire");
    await advanceTime(duration.days(7).toNumber());
    await CurveVoter.release();

    expect(await CRV.balanceOf(CurveVoter.address)).to.be.eq(1);

    const data = CRV.interface.encodeFunctionData("transfer", [carol.address, BigNumber.from(1)]);
    expect(await CRV.balanceOf(carol.address)).to.be.eq(0);
    await expect(CurveVoter.execute(CRV.address, 0, data));
    expect(await CRV.balanceOf(carol.address)).to.be.eq(1);
  });

  it("should be able to withdraw", async () => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    expect(await CRV.balanceOf(CurveVoter.address)).to.be.eq(0);

    await CRV.connect(crvWhaleSigner).transfer(deployer.address, getBigNumber(999));
    await CRV.connect(deployerSigner).approve(CurveVoter.address, ethers.constants.MaxUint256);

    const currentTimestamp = await latest()
    await CurveVoter.createLock(1, currentTimestamp.add(duration.days(7)));
    expect(await CRV.balanceOf(CurveVoter.address)).to.be.eq(0);

    await expect(CurveVoter.connect(deployerSigner).release()).to.be.revertedWith("The lock didn't expire");
    await advanceTime(duration.days(7).toNumber());
    await CurveVoter.release();

    expect(await CRV.balanceOf(CurveVoter.address)).to.be.eq(1);

    expect(await CRV.balanceOf(carol.address)).to.be.eq(0);
    await expect(CurveVoter.withdraw(CRV.address, carol.address, 1));
    expect(await CRV.balanceOf(carol.address)).to.be.eq(1);
  });
});
