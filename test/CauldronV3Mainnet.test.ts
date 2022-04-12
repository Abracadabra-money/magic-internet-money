/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { advanceTime, ChainId, duration, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ISwapperGeneric, ProxyOracle } from "../typechain";
import { expect } from "chai";
import { CauldronV3 } from "../typechain/CauldronV3";
import { Constants } from "./constants";
import { Signer } from "ethers";

const ustWhale = "0xf977814e90da44bfa03b6295a0616a897441acec";
const mimWhale = "0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5";

describe("CauldronV3", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let UST: ERC20Mock;
  let DegenBox: DegenBox;
  let CauldronV3MasterContract: CauldronV3;
  let Cauldron: CauldronV3;
  let OracleMock: OracleMock;
  let degenBoxOwnerSigner: Signer;
  let mimWhaleSigner: Signer;
  let USTSwapperMock: USTSwapperMock;

  const deployCauldronProxy = async () => {
    const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
    const OPENING_CONVERSION = 1e5 / 100;

    // 85% LTV .5% initial 3% Interest, 8% fee
    const collateralization = 85 * 1e3; // 85% LTV
    const opening = 0 * OPENING_CONVERSION; // 0% initial
    const interest = parseInt(String(3 * INTEREST_CONVERSION)); // 3% Interest
    const liquidation = 8 * 1e3 + 1e5; // 8% fee

    const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", Constants.mainnet.degenBox);

    OracleMock = await (await ethers.getContractFactory("OracleMock")).deploy();
    await OracleMock.set(getBigNumber(1));

    let initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
      [Constants.mainnet.ust, OracleMock.address, ethers.constants.AddressZero, interest, liquidation, collateralization, opening]
    );

    const tx = await (await DegenBox.deploy(CauldronV3MasterContract.address, initData, true)).wait();
    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    Cauldron = await ethers.getContractAt<CauldronV3>("CauldronV3", deployEvent?.args?.cloneAddress);
  };

  const addCollateral = async (cauldron, signer, amount) => {
    await DegenBox.connect(signer).setMasterContractApproval(
      signer.address,
      CauldronV3MasterContract.address,
      true,
      0,
      ethers.constants.HashZero,
      ethers.constants.HashZero
    );

    const share = await DegenBox.toShare(UST.address, amount, false);
    await UST.connect(signer).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(signer).deposit(UST.address, signer.address, signer.address, 0, share);
    await cauldron.connect(signer).addCollateral(signer.address, false, share);
  };

  const borrow = async (cauldron, signer, amount) => {
    await cauldron.connect(signer).borrow(signer.address, amount);
  };

  const removeCollateral = async (cauldron, signer, amount) => {
    const share = await DegenBox.toShare(UST.address, amount, false);
    await cauldron.connect(signer).removeCollateral(signer.address, share);
  };

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 14535616,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
    await deployments.fixture(["CauldronV3MasterContractMainnet"]);

    const [, alice, bob] = await ethers.getSigners();
    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", Constants.mainnet.degenBox);
    UST = await ethers.getContractAt<ERC20Mock>("ERC20Mock", Constants.mainnet.ust);
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", Constants.mainnet.mim);

    CauldronV3MasterContract = await ethers.getContract<CauldronV3>("CauldronV3MasterContractMainnet");

    // whitelist to degenbox
    const degenBoxOwner = await DegenBox.owner();
    await impersonate(degenBoxOwner);
    degenBoxOwnerSigner = await ethers.getSigner(degenBoxOwner);
    await DegenBox.connect(degenBoxOwnerSigner).whitelistMasterContract(CauldronV3MasterContract.address, true);

    await impersonate(ustWhale);
    const spellWhaleSigner = await ethers.getSigner(ustWhale);
    await UST.connect(spellWhaleSigner).transfer(alice.address, (await UST.balanceOf(ustWhale)).div(2));
    await UST.connect(spellWhaleSigner).transfer(bob.address, await UST.balanceOf(ustWhale));

    await deployCauldronProxy();
    const exchangeRate = await Cauldron.exchangeRate();
    expect(exchangeRate).to.be.gt(0);

    await impersonate(mimWhale);
    mimWhaleSigner = await ethers.getSigner(mimWhale);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, mimWhale, mimWhale, getBigNumber(10_000_000), 0);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, mimWhale, Cauldron.address, getBigNumber(10_000_000), 0);

    USTSwapperMock = await (await ethers.getContractFactory("USTSwapperMock")).deploy();
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should not allow more than borrow limit", async () => {
    const [deployer, alice, bob] = await ethers.getSigners();

    await addCollateral(Cauldron, alice, getBigNumber(5_000_000));
    await addCollateral(Cauldron, bob, getBigNumber(5_000_000));

    await borrow(Cauldron, alice, getBigNumber(100));
    await Cauldron.connect(deployer).changeBorrowLimit(getBigNumber(60), getBigNumber(50));
    await expect(borrow(Cauldron, alice, getBigNumber(51))).to.be.revertedWith("Borrow Limit reached");

    // alice already borrowed 50_000 before the new limit was applied.
    await expect(borrow(Cauldron, alice, getBigNumber(50))).to.be.revertedWith("Borrow Limit reached");

    await Cauldron.connect(deployer).changeBorrowLimit(getBigNumber(30_000), getBigNumber(20_000));

    await borrow(Cauldron, alice, getBigNumber(19_900));
    await expect(borrow(Cauldron, bob, getBigNumber(20_000))).to.be.revertedWith("Borrow Limit reached");
    await expect(borrow(Cauldron, bob, getBigNumber(10_001))).to.be.revertedWith("Borrow Limit reached");
    await borrow(Cauldron, bob, getBigNumber(9_999)); // 30k - 20k = ~10k

    await expect(borrow(Cauldron, bob, getBigNumber(40))).to.be.revertedWith("Borrow Limit reached");

    await Cauldron.connect(deployer).changeBorrowLimit(getBigNumber(99), getBigNumber(9999999));
    await Cauldron.connect(alice).repay(alice.address, false, getBigNumber(99));
    await Cauldron.connect(deployer).changeBorrowLimit(getBigNumber(99), getBigNumber(9999999));
    await expect(borrow(Cauldron, alice, getBigNumber(2))).to.be.revertedWith("Borrow Limit reached");
  });

  it("should not allow increasing interest rate more that 75%", async () => {
    const { INTEREST_PER_SECOND } = await Cauldron.accrueInfo();
    await expect(Cauldron.changeInterestRate(INTEREST_PER_SECOND.add(INTEREST_PER_SECOND.mul(75).div(100)))).to.be.revertedWith(
      "Interest rate increase > 75%"
    );
    const newInterestRate = INTEREST_PER_SECOND.add(INTEREST_PER_SECOND.mul(74).div(100));
    await Cauldron.changeInterestRate(newInterestRate);
    expect((await Cauldron.accrueInfo()).INTEREST_PER_SECOND).to.be.eq(newInterestRate);
  });

  it("should'nt allow decreasing interest rate more that 75%", async () => {
    const { INTEREST_PER_SECOND } = await Cauldron.accrueInfo();
    const newInterestRate = INTEREST_PER_SECOND.sub(INTEREST_PER_SECOND.mul(90).div(100));
    await Cauldron.changeInterestRate(newInterestRate);
    expect((await Cauldron.accrueInfo()).INTEREST_PER_SECOND).to.be.eq(newInterestRate);
  });

  it("should only allow changing the interest reate every 3 days", async () => {
    const { INTEREST_PER_SECOND } = await Cauldron.accrueInfo();
    await Cauldron.changeInterestRate(INTEREST_PER_SECOND.add(INTEREST_PER_SECOND.mul(1).div(100)));
    await expect(Cauldron.changeInterestRate(INTEREST_PER_SECOND.add(INTEREST_PER_SECOND.mul(1).div(100)))).to.be.revertedWith(
      "Update only every 3 days"
    );
    await advanceTime(duration.days(3));
    await Cauldron.changeInterestRate(INTEREST_PER_SECOND.add(INTEREST_PER_SECOND.mul(1).div(100)));
  });

  // To enable these 2 tests, copy back `archive/contracts/cauldrons/CauldronV2.sol` and immunefi folder from `archives/` to `contracts/`
  xit("should reproduce the immunefi issue", async () => {
    const [deployer] = await ethers.getSigners();
    const Exploit = await (await ethers.getContractFactory("ExploitCauldronStealMIM")).deploy();

    const FreshBentoBox = await (await ethers.getContractFactory("DegenBox")).deploy("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    const MasterContract = await (await ethers.getContractFactory("CauldronV2")).deploy(FreshBentoBox.address, Constants.mainnet.mim);
    await MasterContract.setFeeTo(deployer.address);
    await FreshBentoBox.whitelistMasterContract(MasterContract.address, true);

    await MIM.connect(mimWhaleSigner).transfer(Exploit.address, getBigNumber(1_000_000));
    await Exploit.setup(FreshBentoBox.address, MasterContract.address);

    await MIM.connect(mimWhaleSigner).transfer(Exploit.address, getBigNumber(100_000));
    await Exploit.start();
  });

  xit("should fix the immunefi issue", async () => {
    const [deployer] = await ethers.getSigners();
    const Exploit = await (await ethers.getContractFactory("ExploitCauldronStealMIM")).deploy();

    const FreshBentoBox = await (await ethers.getContractFactory("DegenBox")).deploy("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    const MasterContract = await (await ethers.getContractFactory("CauldronV3")).deploy(FreshBentoBox.address, Constants.mainnet.mim);
    await MasterContract.setFeeTo(deployer.address);
    await FreshBentoBox.whitelistMasterContract(MasterContract.address, true);

    await MIM.connect(mimWhaleSigner).transfer(Exploit.address, getBigNumber(1_000_000));
    await Exploit.setup(FreshBentoBox.address, MasterContract.address);

    await MIM.connect(mimWhaleSigner).transfer(Exploit.address, getBigNumber(100_000));

    // The attacker doesn't get back enough MIM from the liquidation to execute/continue the attack.
    /*
      Stack trace:

      Error: VM Exception while processing transaction: reverted with reason string 'BoringMath: Underflow'
        at DegenBox.allowed (contracts/DegenBox.sol:759)
        at DegenBox.sub (contracts/DegenBox.sol:183)
        at DegenBox.transfer (contracts/DegenBox.sol:937)
        at CauldronV3._addTokens (contracts/CauldronV3.sol:233)
        at CauldronV3.addCollateral (contracts/CauldronV3.sol:250)
        at <UnrecognizedContract>.<unknown> (0x9cc32e0d7a320eefc25a1fae015a800d5a8c8125)
        at ExploitCauldronStealMIM.continueAttack (contracts/immunefi/ExploitCauldronStealMIM.sol:221)
        at ExploitCauldronStealMIM.uniswapV2Call (contracts/immunefi/ExploitCauldronStealMIM.sol:144)
        at SushiSwapPairMock.swap (@sushiswap/core/contracts/uniswapv2/UniswapV2Pair.sol:185)
        at ExploitCauldronStealMIM.obtainFlashLoan (contracts/immunefi/ExploitCauldronStealMIM.sol:125)
        at ExploitCauldronStealMIM.uniswapV2Call (contracts/immunefi/ExploitCauldronStealMIM.sol:141)
        at SushiSwapPairMock.swap (@sushiswap/core/contracts/uniswapv2/UniswapV2Pair.sol:185)
        at ExploitCauldronStealMIM.obtainFlashLoan (contracts/immunefi/ExploitCauldronStealMIM.sol:125)
        at ExploitCauldronStealMIM.start (contracts/immunefi/ExploitCauldronStealMIM.sol:90)
    */
    await expect(Exploit.start()).to.be.revertedWith("BoringMath: Underflow");
  });
});
