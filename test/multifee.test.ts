/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";

import { advanceTime, ChainId, getBigNumber, impersonate } from "../utilities";
import { IERC20, MagicInternetMoney, MultiFeeDistribution } from "../typechain";
import { time } from "console";

const maybe = process.env.ETHEREUM_RPC_URL || process.env.INFURA_API_KEY ? describe : describe.skip;

const joe = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
const joeOwner = "0xd6a4F121CA35509aF06A0Be99093d08462f53052";
const mimMinter = "0xB0731d50C681C45856BFc3f7539D5f61d4bE81D8";

maybe("MultiFeeDistribution", async () => {
  let snapshotId;
  let MultiFeeDistribution: MultiFeeDistribution;
  let MIM: MagicInternetMoney;
  let JOE: MagicInternetMoney;
  let joeOwnerSigner;
  let mimMinterSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 9709160,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());

    await deployments.fixture(["MultiFeeDistribution"]);
    const [deployer, alice, bob, carol] = await ethers.getSigners();

    MIM = await ethers.getContractAt<MagicInternetMoney>("MagicInternetMoney", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    JOE = await ethers.getContractAt<MagicInternetMoney>("MagicInternetMoney", joe);

    MultiFeeDistribution = await ethers.getContract<MultiFeeDistribution>("MultiFeeDistribution");

    // get some mim
    await impersonate(mimMinter);
    mimMinterSigner = await ethers.getSigner(mimMinter);
    await MIM.connect(mimMinterSigner).mint(alice.address, getBigNumber(10_000));
    await MIM.connect(mimMinterSigner).mint(bob.address, getBigNumber(20_000));
    await MIM.connect(mimMinterSigner).mint(carol.address, getBigNumber(30_000));

    await MIM.connect(alice).approve(MultiFeeDistribution.address, ethers.constants.MaxUint256);
    await MIM.connect(bob).approve(MultiFeeDistribution.address, ethers.constants.MaxUint256);
    await MIM.connect(carol).approve(MultiFeeDistribution.address, ethers.constants.MaxUint256);

    await impersonate(joeOwner);
    joeOwnerSigner = await ethers.getSigner(joeOwner);
    await JOE.connect(joeOwnerSigner).mint(deployer.address, getBigNumber(100_000));

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should add reward", async () => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const rewardsDuration = parseInt((await MultiFeeDistribution.rewardsDuration()).toString());
    await MultiFeeDistribution.connect(deployer).addReward(joe);

    const aliceJoeBalanceBefore = await JOE.balanceOf(alice.address);
    await MultiFeeDistribution.connect(alice).stake(getBigNumber(10_000));

    await advanceTime(rewardsDuration);
    await MultiFeeDistribution.connect(alice).getReward([JOE.address]);
    let aliceJoeBalanceAfter = await JOE.balanceOf(alice.address);
    expect(aliceJoeBalanceAfter.sub(aliceJoeBalanceBefore)).to.be.eq(0);

    // need to notify reward to get rewards started
    await JOE.connect(deployer).approve(MultiFeeDistribution.address, ethers.constants.MaxUint256);
    await MultiFeeDistribution.connect(deployer).notifyReward(JOE.address, getBigNumber(10));

    await advanceTime(rewardsDuration / 2);
    await MultiFeeDistribution.connect(alice).getReward([JOE.address]);
    aliceJoeBalanceAfter = await JOE.balanceOf(alice.address);
    expect(aliceJoeBalanceAfter.sub(aliceJoeBalanceBefore)).to.be.within(getBigNumber(10).div(2), getBigNumber(10).div(2).add(getBigNumber(1)));

    await MultiFeeDistribution.connect(deployer).notifyReward(JOE.address, getBigNumber(10)); 
    await advanceTime(rewardsDuration);

    const rewards = await MultiFeeDistribution.claimableRewards(alice.address);
    expect(rewards[0].amount).to.be.within(getBigNumber(15).sub(getBigNumber(1)), getBigNumber(15));

    await MultiFeeDistribution.connect(alice).getReward([JOE.address]);
    aliceJoeBalanceAfter = await JOE.balanceOf(alice.address);
    expect(aliceJoeBalanceAfter.sub(aliceJoeBalanceBefore)).to.be.within(getBigNumber(20).sub(getBigNumber(1)), getBigNumber(20));
  });

  it("should add reward and split in 2 users", async () => {
    const [deployer, alice, bob, carol] = await ethers.getSigners();
    const rewardsDuration = parseInt((await MultiFeeDistribution.rewardsDuration()).toString());
    await MultiFeeDistribution.connect(deployer).addReward(joe);

    const aliceJoeBalanceBefore = await JOE.balanceOf(alice.address);
    await MultiFeeDistribution.connect(alice).stake(getBigNumber(10_000));

    const bobJoeBalanceBefore = await JOE.balanceOf(alice.address);
    await MultiFeeDistribution.connect(bob).stake(getBigNumber(10_000));

    // need to notify reward to get rewards started
    await JOE.connect(deployer).approve(MultiFeeDistribution.address, ethers.constants.MaxUint256);
    await MultiFeeDistribution.connect(deployer).notifyReward(JOE.address, getBigNumber(10));

    await advanceTime(rewardsDuration);
    await MultiFeeDistribution.connect(alice).getReward([JOE.address]);
    const aliceJoeBalanceAfter = await JOE.balanceOf(alice.address);
    expect(aliceJoeBalanceAfter.sub(aliceJoeBalanceBefore)).to.be.within(getBigNumber(5).sub(getBigNumber(1)), getBigNumber(5));

    await MultiFeeDistribution.connect(bob).getReward([JOE.address]);
    const bobJoeBalanceAfter = await JOE.balanceOf(alice.address);
    expect(bobJoeBalanceAfter.sub(bobJoeBalanceBefore)).to.be.within(getBigNumber(5).sub(getBigNumber(1)), getBigNumber(5));
  });
});
