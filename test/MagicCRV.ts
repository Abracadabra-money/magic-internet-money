import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { advanceTime, ChainId, duration, getBigNumber, impersonate } from "../utilities";
import { CauldronV2CheckpointV2, CurveVoter, DegenBox, ERC20Mock, IBentoBoxV1, IFeeDistributor, MagicCRV } from "../typechain";
import { ISmartWalletWhitelist } from "../typechain/ISmartWalletWhitelist";
import { BigNumber } from "ethers";

const CrvWhale = "0x7a16ff8270133f063aab6c9977183d9e72835428";
const Crv3Whale = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";
const CurveSmartWalletWhitelist = "0xca719728Ef172d0961768581fdF35CB116e0B7a4";
const CurveDao = "0x40907540d8a6C65c637785e8f8B742ae6b0b9968";

const SCALE = BigNumber.from("1000000000000000000"); // 1e18

describe("MagicCRV", async () => {
  let snapshotId;
  let CurveVoter: CurveVoter;
  let MagicCRV: MagicCRV;
  let CRV: ERC20Mock;
  let CRV3: ERC20Mock;
  let FeeDistibutor: IFeeDistributor;
  let CauldronMC: CauldronV2CheckpointV2;
  let Cauldron: CauldronV2CheckpointV2;
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
    await deployments.fixture(["MagicCRV", "DegenBoxCauldronV2CheckpointV2", "MagicCRVCauldron"]);
    const { deployer, alice } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    crvWhaleSigner = await ethers.getSigner(CrvWhale);
    crv3WhaleSigner = await ethers.getSigner(Crv3Whale);

    CRV = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xD533a949740bb3306d119CC777fa900bA034cd52");
    CRV3 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490");
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

    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
    Cauldron = await ethers.getContract<CauldronV2CheckpointV2>("MagicCRVCauldron");
    CauldronMC = await ethers.getContract<CauldronV2CheckpointV2>("DegenBoxCauldronV2CheckpointV2");

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
    await expect(CurveVoter.connect(bob).voteForGaugeWeights("0xb0f5d00e5916c8b8981e99191A1458704B587b2b", 420)).to.be.revertedWith(
      "Used too much power"
    );

    await CurveVoter.setAllowedVoter(alice.address, false);
    await expect(CurveVoter.connect(alice).voteForMaxMIMGaugeWeights()).to.be.revertedWith("NotAllowedVoter()");
  });

  it("should not be possible to claim and deposit when shutdown and allow withdrawals", async () => {
    const [, alice] = await ethers.getSigners();
    await MagicCRV.connect(alice).claim();
    await MagicCRV.connect(alice).deposit(1);

    await expect(MagicCRV.withdraw(CRV3.address, alice.address, 1)).to.be.revertedWith("CannotWithdraw()");

    await MagicCRV.setShutdown(true);

    await expect(MagicCRV.connect(alice).claim()).to.be.revertedWith("Shutdown()");
    await expect(MagicCRV.connect(alice).deposit(1)).to.be.revertedWith("Shutdown()");

    await CRV3.connect(crv3WhaleSigner).transfer(MagicCRV.address, 1);
    await MagicCRV.withdraw(CRV3.address, alice.address, 1);
  });

  describe("Cauldron Claiming", async () => {
    const setup = async (signer, initialAmount) => {
      // transfer crv from 3crv whale
      await CRV.connect(crvWhaleSigner).transfer(signer.address, initialAmount);

      await CRV.connect(signer).approve(MagicCRV.address, ethers.constants.MaxUint256);
      await MagicCRV.connect(signer).deposit(await CRV.balanceOf(signer.address));
      await MagicCRV.connect(signer).approve(DegenBox.address, ethers.constants.MaxUint256);

      await DegenBox.connect(signer).setMasterContractApproval(
        signer.address,
        CauldronMC.address,
        true,
        0,
        ethers.constants.HashZero,
        ethers.constants.HashZero
      );
    };

    const addRewards = async (amount) => {
      await CRV3.connect(crv3WhaleSigner).transfer(MagicCRV.address, amount);
    };

    const addCollateral = async (signer, amount, cauldron = Cauldron) => {
      const share = await DegenBox.toShare(MagicCRV.address, amount, false);
      await DegenBox.connect(signer).deposit(MagicCRV.address, signer.address, signer.address, 0, share);
      await cauldron.connect(signer).addCollateral(signer.address, false, share);
    };

    const removeCollateral = async (signer, amount, cauldron = Cauldron) => {
      const share = await DegenBox.toShare(MagicCRV.address, amount, false);
      await cauldron.connect(signer).removeCollateral(signer.address, share);
    };

    const expectRewards = async (signer, amount, marginOfError = 1e4) => {
      const crv3BalanceBefore = await CRV3.balanceOf(signer.address);
      await MagicCRV.connect(signer).claim();
      const crv3BalanceAfter = await CRV3.balanceOf(signer.address);

      expect(crv3BalanceAfter.sub(crv3BalanceBefore)).to.be.closeTo(amount, marginOfError);
    };

    it("should be possible to claim reward when deposited into a cauldron", async () => {
      const [, , bob, carol] = await ethers.getSigners();

      // == bob ==
      // wallet: 10_000
      // cauldron: 0
      // == carol ==
      // wallet: 5_000
      // cauldron: 0
      // --
      // total supply: 15_000
      await setup(bob, getBigNumber(10_000));
      await setup(carol, getBigNumber(5_000));

      await expectRewards(bob, getBigNumber(0));
      await expectRewards(carol, getBigNumber(0));

      await addRewards(getBigNumber(100));

      // bob: 100 * (10_000 / 15_000)
      await expectRewards(bob, getBigNumber(10_000).mul(getBigNumber(100)).div(getBigNumber(15_000)));
      // carol: 100 * (5_000 / 15_000)
      await expectRewards(carol, getBigNumber(5_000).mul(getBigNumber(100)).div(getBigNumber(15_000)));

      // shouldn't claim twice
      await expectRewards(bob, getBigNumber(0));
      await expectRewards(carol, getBigNumber(0));

      // == bob ==
      // wallet: 5_000
      // cauldron: 5_000
      // == carol ==
      // wallet: 4_000
      // cauldron: 1_000
      await addCollateral(bob, getBigNumber(5_000));
      await addCollateral(carol, getBigNumber(1_000));

      await addRewards(getBigNumber(4321));

      // bob: 4321 * (5_000 in wallet + 5_000 in cauldron / 15_000)
      await expectRewards(bob, getBigNumber(10_000).mul(getBigNumber(4321)).div(getBigNumber(15_000)));
      // carol: 4321 * (2_500 in wallet + 2_5000 in cauldron / 15_000)
      await expectRewards(carol, getBigNumber(5_000).mul(getBigNumber(4321)).div(getBigNumber(15_000)));

      // shouldn't claim anything more
      await expectRewards(bob, getBigNumber(0));
      await expectRewards(carol, getBigNumber(0));

      // == bob ==
      // wallet: 5_000
      // cauldron: 2_500
      // bentobox: 2_500 (not farming)
      // == carol ==
      // wallet: 4_000
      // cauldron: 500
      // bentobox: 500 (not farming)
      // removing collateral moves the tokens to the bentobox
      await removeCollateral(bob, getBigNumber(2_500));
      await removeCollateral(carol, getBigNumber(500));

      // the two previous `removeCollateral` amount shouldn't be farming this reward
      await addRewards(getBigNumber(234));

      // bob: 234 * (5_000 in wallet + 2_500 in cauldron / 15_000)
      await expectRewards(bob, getBigNumber(7_500).mul(getBigNumber(234)).div(getBigNumber(15_000)));
      // carol: 234 * (4_000 in wallet + 500 in cauldron / 15_000)
      await expectRewards(carol, getBigNumber(4_500).mul(getBigNumber(234)).div(getBigNumber(15_000)));

      // shouldn't claim anything more
      await expectRewards(bob, getBigNumber(0));
      await expectRewards(carol, getBigNumber(0));
    });

    it.only("should allow the previous account to claim its due after a transfer and new recipient only on the previous amount", async () => {
      const [, , bob, carol] = await ethers.getSigners();
      await setup(bob, getBigNumber(10_000));
      await setup(carol, getBigNumber(1_000));

      await addCollateral(bob, getBigNumber(5_000));

      // == bob ==
      // wallet: 5_000
      // cauldron: 5_000
      // == carol ==
      // wallet: 1_000
      // cauldron: 0
      await addRewards(getBigNumber(500));

      // move 5_000 from bob -> carol.
      // Because the rewards are updated before the balance changes:
      // - bob should be able to claim on the whole 10_000
      // - alice only on 1_000.
      await MagicCRV.connect(bob).transfer(carol.address, getBigNumber(5_000));
      await expectRewards(bob, getBigNumber(10_000).mul(getBigNumber(500)).div(getBigNumber(11_000)));
      await expectRewards(carol, getBigNumber(1_000).mul(getBigNumber(500)).div(getBigNumber(11_000)));

      // == bob ==
      // wallet: 0
      // cauldron: 5_000
      // == carol ==
      // wallet: 6_000
      // cauldron: 0
      await addRewards(getBigNumber(500));
      await expectRewards(bob, getBigNumber(5_000).mul(getBigNumber(500)).div(getBigNumber(11_000)));
      await expectRewards(carol, getBigNumber(6_000).mul(getBigNumber(500)).div(getBigNumber(11_000)));

      // move back bob's 5_000 -> carol
      await MagicCRV.connect(carol).transfer(bob.address, getBigNumber(5_000));
      await expectRewards(bob, getBigNumber(0));
      await expectRewards(carol, getBigNumber(0));

      await addRewards(getBigNumber(500));
      await expectRewards(bob, getBigNumber(10_000).mul(getBigNumber(500)).div(getBigNumber(11_000)));
      await expectRewards(carol, getBigNumber(1_000).mul(getBigNumber(500)).div(getBigNumber(11_000)));
    });

    it("should claim the rewards when the reward index moved multiple times", async () => {});

    it("should claim rewards when adding collateral from bentobox amount deposited on behalf of a user", async () => {});

    it("should not be farming with liquidated amounts", async () => {});

    it("should not be farming with disposed amounts", async () => {});

    it("should work with multiple cauldrons accross different degenBoxes", async () => {
      const [, , bob, carol] = await ethers.getSigners();

      const deployMagicCRVCauldron = async (): Promise<CauldronV2CheckpointV2> => {
        const degenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
        let initData = ethers.utils.defaultAbiCoder.encode(
          ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
          // except for the collateral type, the cauldron parameters aren't relevant for the test
          [MagicCRV.address, ethers.constants.AddressZero, ethers.constants.HashZero, 0, 0, 0, 0]
        );

        const CauldronV2CheckpointV2MC = await ethers.getContract<CauldronV2CheckpointV2>("DegenBoxCauldronV2CheckpointV2");
        const tx = await (await degenBox.deploy(CauldronV2CheckpointV2MC.address, initData, false)).wait();
        const deployEvent = tx?.events?.[0];
        expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

        const cauldronAddress = deployEvent?.args?.cloneAddress;
        MagicCRV.addCauldron(cauldronAddress);
        return await ethers.getContractAt<CauldronV2CheckpointV2>("CauldronV2CheckpointV2", cauldronAddress);
      };

      const cauldron1 = Cauldron;
      const cauldron2 = await deployMagicCRVCauldron();
      const cauldron3 = await deployMagicCRVCauldron();

      // == bob ==
      // wallet: 58_000
      // == carol ==
      // wallet: 155_000
      // --
      // total supply: 213_000
      await setup(bob, getBigNumber(58_000));
      await setup(carol, getBigNumber(155_000));

      // == bob ==
      // wallet: 40_000
      // cauldron1: 5_000
      // cauldron2: 6_000
      // cauldron3: 7_000
      // == carol ==
      // wallet: 150_556
      // cauldron1: 1_111
      // cauldron2: 0
      // cauldron3: 3_333
      await addCollateral(bob, 5_000, cauldron1);
      await addCollateral(bob, 6_000, cauldron2);
      await addCollateral(bob, 7_000, cauldron3);
      await addCollateral(carol, 1_111, cauldron1);
      await addCollateral(carol, 3_333, cauldron3);

      await addRewards(getBigNumber(345_543));

      // bob: 345_543 * (40_000 in wallet + 5_000 in cauldron1 + 6_000 in cauldron2 + 7_000 in caulron3 / 213_000)
      await expectRewards(bob, getBigNumber(58_000).mul(getBigNumber(345_543)).div(getBigNumber(213_000)), 6e4);

      // carol: 345_543 * (150_556 in wallet + 1_111 in cauldron1 + 3_333 in caulron3 / 213_000)
      await expectRewards(carol, getBigNumber(155000).mul(getBigNumber(345_543)).div(getBigNumber(213_000)), 14e4);
    });
  });
});
