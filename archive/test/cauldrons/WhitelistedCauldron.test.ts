/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { advanceTime, ChainId, createMerkleTree, duration, getBigNumber, getWhitelistNode, impersonate } from "../utilities";
import {
  DegenBox,
  ERC20Mock,
  ISwapperGeneric,
  IWhitelister,
  OracleMock,
  ProxyOracle,
  USTSwapperMock,
  WhitelistedCauldronV3,
} from "../typechain";
import { expect } from "chai";
import { CauldronV3 } from "../typechain/CauldronV3";
import { Constants } from "./constants";
import { Signer } from "ethers";
import MerkleTree from "merkletreejs";

const ustWhale = "0xc7388D98Fa86B6639d71A0A6d410D5cDfc63A1d0";
const mimWhale = "0x78a9e536EBdA08b5b9EDbE5785C9D1D50fA3278C";

describe("WhitelistedCauldronV3", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let UST: ERC20Mock;
  let DegenBox: DegenBox;
  let CauldronV3MasterContract: CauldronV3;
  let Cauldron: WhitelistedCauldronV3;
  let OracleMock;
  let Whitelister: IWhitelister;
  let degenBoxOwnerSigner: Signer;
  let mimWhaleSigner: Signer;
  let merkleTree: MerkleTree;

  const deployCauldronProxy = async (interestRate = 0) => {
    const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
    const OPENING_CONVERSION = 1e5 / 100;

    const collateralization = 98 * 1e3; // 98% LTV
    const opening = 0 * OPENING_CONVERSION; // 0% initial
    const interest = parseInt(String(interestRate * INTEREST_CONVERSION));
    const liquidation = 8 * 1e3 + 1e5; // 8% fee

    OracleMock = await (await ethers.getContractFactory("OracleMock")).deploy();
    await OracleMock.set(getBigNumber(1));

    let initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
      [Constants.avalanche.ust, OracleMock.address, ethers.constants.AddressZero, interest, liquidation, collateralization, opening]
    );

    const tx = await (await DegenBox.deploy(CauldronV3MasterContract.address, initData, true)).wait();
    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    Cauldron = await ethers.getContractAt<WhitelistedCauldronV3>("WhitelistedCauldronV3", deployEvent?.args?.cloneAddress);
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
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 13716973,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());
    await deployments.fixture(["WhitelistedCauldron"]);

    const [, alice, bob, carol] = await ethers.getSigners();
    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", Constants.avalanche.degenBox);
    UST = await ethers.getContractAt<ERC20Mock>("ERC20Mock", Constants.avalanche.ust);
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", Constants.avalanche.mim);

    CauldronV3MasterContract = await ethers.getContract<CauldronV3>("WhitelistedCauldronV3Avalanche");

    merkleTree = createMerkleTree([
      [alice.address, getBigNumber(1337, 6).toString()],
      [bob.address, getBigNumber(7331,  6).toString()],
    ]);

    const deployedWhitelisted = await (await ethers.getContractFactory("Whitelister")).deploy(merkleTree.getHexRoot(), "ipfs://foobar");
    Whitelister = await ethers.getContractAt<IWhitelister>("Whitelister", deployedWhitelisted.address);

    // whitelist to degenbox
    const degenBoxOwner = await DegenBox.owner();
    await impersonate(degenBoxOwner);
    degenBoxOwnerSigner = await ethers.getSigner(degenBoxOwner);
    await DegenBox.connect(degenBoxOwnerSigner).whitelistMasterContract(CauldronV3MasterContract.address, true);

    await impersonate(ustWhale);
    const ustWhaleSigner = await ethers.getSigner(ustWhale);

    const ustAmount = (await UST.balanceOf(ustWhale)).div(4);
    await UST.connect(ustWhaleSigner).transfer(alice.address, ustAmount);
    await UST.connect(ustWhaleSigner).transfer(bob.address, ustAmount);
    await UST.connect(ustWhaleSigner).transfer(carol.address, ustAmount);

    await deployCauldronProxy();
    const exchangeRate = await Cauldron.exchangeRate();
    expect(exchangeRate).to.be.gt(0);

    await impersonate(mimWhale);
    mimWhaleSigner = await ethers.getSigner(mimWhale);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, mimWhale, mimWhale, getBigNumber(10_000_000), 0);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, mimWhale, Cauldron.address, getBigNumber(10_000_000), 0);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should be able to borrow any amount", async () => {
    const [, alice] = await ethers.getSigners();
    await addCollateral(Cauldron, alice, getBigNumber(500_000, 6));
    await expect(borrow(Cauldron, alice, getBigNumber(55555, 6))).to.not.be.reverted;
  });

  it("should not allow more than borrow limit", async () => {
    const [, alice, bob, carol] = await ethers.getSigners();

    await Cauldron.changeWhitelister(Whitelister.address);

    await addCollateral(Cauldron, alice, getBigNumber(500_000, 6));
    await addCollateral(Cauldron, bob, getBigNumber(500_000, 6));
    await addCollateral(Cauldron, carol, getBigNumber(500_000, 6));

    await expect(borrow(Cauldron, carol, getBigNumber(55555, 6))).to.be.revertedWith("Whitelisted borrow exceeded");

    const proof1Wrong: string[] = merkleTree.getHexProof(getWhitelistNode(alice.address, getBigNumber("1233", 6).toString()));
    const proof1Right: string[] = merkleTree.getHexProof(getWhitelistNode(alice.address, getBigNumber("1337", 6).toString()));

    // should not be able to borrow before Whitelister's setMaxBorrow is called with the proof
    await expect(borrow(Cauldron, alice, getBigNumber(1337, 6))).to.be.revertedWith("Whitelisted borrow exceeded");

    // should fail validating
    await expect(Whitelister.connect(alice).setMaxBorrow(alice.address, getBigNumber("1233", 6), proof1Wrong)).to.be.revertedWith("Whitelister: Invalid proof.");
    await expect(Whitelister.connect(alice).setMaxBorrow(alice.address, getBigNumber("1337", 6), proof1Wrong)).to.be.revertedWith("Whitelister: Invalid proof.");
    await expect(Whitelister.connect(alice).setMaxBorrow(alice.address, getBigNumber("1233", 6), proof1Right)).to.be.revertedWith("Whitelister: Invalid proof.");

    // should validate
    await Whitelister.connect(alice).setMaxBorrow(alice.address, getBigNumber("1337", 6), proof1Right);

    // should exceed
    await expect(borrow(Cauldron, alice, getBigNumber(1338, 6))).to.be.revertedWith("Whitelisted borrow exceeded");

    // should be able to borrow
    await expect(borrow(Cauldron, alice, getBigNumber(1337, 6))).to.not.be.reverted;

    const proof2: string[] = merkleTree.getHexProof(getWhitelistNode(bob.address, getBigNumber("7331", 6).toString()));
    await expect(borrow(Cauldron, bob, getBigNumber(7331, 6))).to.be.revertedWith("Whitelisted borrow exceeded");

    // it's valid that a user can validate for another one
    await Whitelister.connect(alice).setMaxBorrow(bob.address, getBigNumber("7331", 6), proof2)
    await expect(borrow(Cauldron, bob, getBigNumber(1000, 6))).to.not.be.reverted;
    await expect(borrow(Cauldron, bob, getBigNumber(6331, 6))).to.not.be.reverted;

    await expect(borrow(Cauldron, bob, getBigNumber(1, 6))).to.be.revertedWith("Whitelisted borrow exceeded");
  });
});
