import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";

const { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack, formatUnits, splitSignature } = ethers.utils;
const { MaxUint256, AddressZero, HashZero } = ethers.constants;
// This one was not defined..
const MaxUint128 = BigNumber.from(2).pow(128).sub(1);

const hashUtf8String = (s: string) => keccak256(toUtf8Bytes(s));

const zeroSign = (deadline) => ({ r: HashZero, s: HashZero, v: 0, deadline });

import { BigRational, advanceNextTime, duration, encodeParameters, expApprox, getBigNumber, impersonate } from "../utilities";
import { BentoBoxMock, ERC20Mock, ERC721Mock, LendingClubMock, NFTMarketMock, NFTBuyerSellerMock, WETH9Mock, NFTPair } from "../typechain";
import { describeSnapshot } from "./helpers";

const LoanStatus = {
  INITIAL: 0,
  REQUESTED: 1,
  OUTSTANDING: 2,
};

// Cook actions
const ACTION_GET_AMOUNT_DUE = 1;
const ACTION_GET_SHARES_DUE = 2;
const ACTION_REPAY = 3;
const ACTION_REMOVE_COLLATERAL = 4;

const ACTION_REQUEST_LOAN = 12;
const ACTION_LEND = 13;

// Function on BentoBox
const ACTION_BENTO_DEPOSIT = 20;
const ACTION_BENTO_WITHDRAW = 21;
const ACTION_BENTO_TRANSFER = 22;
const ACTION_BENTO_TRANSFER_MULTIPLE = 23;
const ACTION_BENTO_SETAPPROVAL = 24;

// Any external call (except to BentoBox)
const ACTION_CALL = 30;

// Signed requests
const ACTION_REQUEST_AND_BORROW = 40;
const ACTION_TAKE_COLLATERAL_AND_LEND = 41;

const USE_VALUE1 = -1;
const USE_VALUE2 = -2;

interface IDeployParams {
  collateral: string;
  asset: string;
}
interface IPartialDeployParams {
  collateral?: string;
  asset?: string;
}

interface ILoanParams {
  valuation: BigNumber;
  duration: number;
  annualInterestBPS: number;
}
interface IPartialLoanParams {
  valuation?: BigNumber;
  duration?: number;
  annualInterestBPS?: number;
}

interface ISignature {
  r: string;
  s: string;
  v: number;
  deadline: number;
}

const DOMAIN_SEPARATOR_HASH = hashUtf8String("EIP712Domain(uint256 chainId,address verifyingContract)");

const DAY = 24 * 3600;
const YEAR = 365 * DAY;
const nextYear = Math.floor(new Date().getTime() / 1000) + YEAR;
const nextDecade = Math.floor(new Date().getTime() / 1000) + YEAR * 10;

describe("NFT Pair", async () => {
  let chainId: BigNumberish;
  let apes: ERC721Mock;
  let guineas: ERC20Mock;
  let weth: WETH9Mock;
  let bentoBox: BentoBoxMock;
  let masterContract: NFTPair;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let apesMarket: NFTMarketMock;

  // Named token IDs for testing..
  let apeIds: {
    aliceOne: BigNumberish;
    aliceTwo: BigNumberish;
    bobOne: BigNumberish;
    bobTwo: BigNumberish;
    carolOne: BigNumberish;
    carolTwo: BigNumberish;
  };

  const deployContract = async <T extends Contract>(name, ...args) => {
    const contract = await ethers.getContractFactory(name).then((f) => f.deploy(...args));
    // Simpler way to "cast"? The above works as the result if we igore types..
    return ethers.getContractAt<T>(name, contract.address);
  };

  const deployPair = async (options: IPartialDeployParams = {}) => {
    const { collateral = apes.address, asset = guineas.address } = options;
    const deployTx = await bentoBox
      .deploy(masterContract.address, encodeParameters(["address", "address"], [collateral, asset]), false)
      .then((tx) => tx.wait());
    for (const e of deployTx.events || []) {
      if (e.eventSignature == "LogDeploy(address,bytes,address)") {
        return ethers.getContractAt<NFTPair>("NFTPair", e.args?.cloneAddress);
      }
    }
    throw new Error("Deploy event not found"); // (For the typechecker..)
  };

  const addToken = (pool, tokenId, params: IPartialLoanParams) =>
    pool.connect(alice).updateLoanParams(tokenId, {
      valuation: 0,
      duration: YEAR,
      openFeeBPS: 1000,
      annualInterestBPS: 2000,
      ...params,
    });

  // Specific to the mock implementation..
  const mintToken = async (mockContract, ownerAddress) => {
    const id = await mockContract.totalSupply();
    await mockContract.mint(ownerAddress);
    return id;
  };
  const mintApe = (ownerAddress) => mintToken(apes, ownerAddress);

  const signLendRequest = async (pair, wallet, { tokenId, anyTokenId, valuation, duration, annualInterestBPS, deadline }) => {
    const sigTypes = [
      { name: "contract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "anyTokenId", type: "bool" },
      { name: "valuation", type: "uint128" },
      { name: "duration", type: "uint64" },
      { name: "annualInterestBPS", type: "uint16" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ];
    const sigValues = {
      contract: pair.address,
      tokenId,
      anyTokenId,
      valuation,
      duration,
      annualInterestBPS,
      nonce: 0,
      deadline,
    };
    const sig = await wallet._signTypedData(
      // The stuff going into DOMAIN_SEPARATOR:
      { chainId, verifyingContract: masterContract.address },

      // sigHash
      { Lend: sigTypes },
      sigValues
    );
    return { deadline, ...splitSignature(sig) };
  };

  const signBorrowRequest = async (pair, wallet, { tokenId, valuation, duration, annualInterestBPS, deadline }) => {
    const sigTypes = [
      { name: "contract", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "valuation", type: "uint128" },
      { name: "duration", type: "uint64" },
      { name: "annualInterestBPS", type: "uint16" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ];
    // const sigArgs = sigTypes.map((t) => t.type + " " + t.name);
    // const sigHash = keccak256(
    //   toUtf8Bytes("Borrow(" + sigArgs.join(",") + ")")
    // );

    const sigValues = {
      contract: pair.address,
      tokenId,
      valuation,
      duration,
      annualInterestBPS,
      nonce: 0,
      deadline,
    };
    // const dataHash = keccak256(defaultAbiCoder.encode(
    //   ["bytes32 sigHash", ...sigArgs],
    //   Object.values({ sigHash, ...sigValues })
    // ));
    // const digest = keccak256(
    //   solidityPack(
    //     ["string", "bytes32", "bytes32"],
    //     ["\x19\x01", DOMAIN_SEPARATOR, dataHash]
    //   )
    // );

    // At this point we'd like to sign this digest, but signing arbitrary
    // data is made difficult in ethers.js to prevent abuse. So for now we
    // use a helper method that basically does everything we just did again:
    const sig = await wallet._signTypedData(
      // The stuff going into DOMAIN_SEPARATOR:
      { chainId, verifyingContract: masterContract.address },

      // sigHash
      { Borrow: sigTypes },
      sigValues
    );
    return { deadline, ...splitSignature(sig) };
  };

  before(async () => {
    chainId = (await ethers.provider.getNetwork()).chainId;
    weth = await deployContract("WETH9Mock");
    // The BentoBox complains if totalSupply = 0, and total supply is however
    // many ETH has been deposited:
    await weth.deposit({ value: getBigNumber(1) });

    bentoBox = await deployContract("BentoBoxMock", weth.address);
    masterContract = await deployContract("NFTPair", bentoBox.address);
    await bentoBox.whitelistMasterContract(masterContract.address, true);
    apes = await deployContract("ERC721Mock");
    guineas = await deployContract("ERC20Mock", MaxUint256);

    apesMarket = await deployContract("NFTMarketMock", apes.address, guineas.address);

    const addresses = await getNamedAccounts();
    deployer = await ethers.getSigner(addresses.deployer);
    alice = await ethers.getSigner(addresses.alice);
    bob = await ethers.getSigner(addresses.bob);
    carol = await ethers.getSigner(addresses.carol);

    const mc = masterContract.address;
    const hz = HashZero;
    for (const signer of [alice, bob, carol]) {
      const addr = signer.address;
      const bb = bentoBox.connect(signer);
      await bb.setMasterContractApproval(addr, mc, true, 0, hz, hz);

      await guineas.transfer(addr, getBigNumber(10_000));
      await guineas.connect(signer).approve(bentoBox.address, MaxUint256);
      await bb.deposit(guineas.address, addr, addr, getBigNumber(3000), 0);
    }
    await guineas.approve(bentoBox.address, MaxUint256);
    await bentoBox.addProfit(guineas.address, getBigNumber(11000));

    // Guineas: 9000 in, 11k profit => 9k shares is 20k guineas.
    // ---- alice:
    // Guineas:            7000.0
    // Guineas (BentoBox): 6666.666666666666666666 (3000.0 shares)

    apeIds = {
      aliceOne: await mintApe(alice.address),
      aliceTwo: await mintApe(alice.address),
      bobOne: await mintApe(bob.address),
      bobTwo: await mintApe(bob.address),
      carolOne: await mintApe(carol.address),
      carolTwo: await mintApe(carol.address),
    };
  });

  describeSnapshot("Deployment", () => {
    let pool: NFTPair;

    before(async () => {
      pool = await deployPair();
    });

    it("Should deploy with expected parameters", async () => {
      expect(await pool.asset()).to.equal(guineas.address);
      expect(await pool.collateral()).to.equal(apes.address);
    });

    it("Should reject bad settings", async () => {
      await expect(deployPair({ collateral: AddressZero })).to.be.revertedWith("NFTPair: bad pair");
    });

    it("Should refuse to initialize twice", async () => {
      await expect(pool.init(encodeParameters(["address", "address"], [apes.address, guineas.address]))).to.be.revertedWith(
        "NFTPair: already initialized"
      );
    });
  });

  describeSnapshot("Request Loan", () => {
    let tomorrow: number;
    let pair: NFTPair;

    before(async () => {
      tomorrow = Math.floor(new Date().getTime() / 1000) + 86400;

      pair = await deployPair();

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }
    });

    it("Should let anyone with an NFT request a loan against it", async () => {
      const params = {
        valuation: getBigNumber(10),
        duration: DAY,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, false))
        .to.emit(apes, "Transfer")
        .withArgs(alice.address, pair.address, apeIds.aliceOne)
        .to.emit(pair, "LogRequestLoan")
        .withArgs(alice.address, apeIds.aliceOne, params.valuation, params.duration, params.annualInterestBPS);
    });

    it("Should let anyone with an NFT request a loan (skim)", async () => {
      // The intended use case of skimming is one transaction; this is not that
      // situation. But since we are the only one interacting with the contract
      // the logic still works:
      const params = {
        valuation: getBigNumber(10),
        duration: DAY,
        annualInterestBPS: 2000,
      };
      await apes.connect(alice).transferFrom(alice.address, pair.address, apeIds.aliceOne);
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, true)).to.emit(pair, "LogRequestLoan");
    });

    it("Should fail to skim if token not present", async () => {
      const params = {
        valuation: getBigNumber(10),
        duration: DAY,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, true)).to.be.revertedWith("NFTPair: skim failed");
    });

    it("Should refuse second request. Important if skimming!", async () => {
      const params = {
        valuation: getBigNumber(10),
        duration: DAY,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, false)).to.emit(pair, "LogRequestLoan");
      await expect(pair.connect(bob).requestLoan(apeIds.aliceOne, params, bob.address, true)).to.be.revertedWith("NFTPair: loan exists");
    });

    it("Should refuse loan requests without collateral", async () => {
      const params = {
        valuation: getBigNumber(10),
        duration: DAY,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.bobOne, params, alice.address, false)).to.be.revertedWith("From not owner");
    });
  });

  describeSnapshot("Lend", async () => {
    let tomorrow: number;
    let params1: ILoanParams;
    let pair: NFTPair;

    before(async () => {
      pair = await deployPair();
      tomorrow = Math.floor(new Date().getTime() / 1000) + 86400;

      for (const signer of [alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      params1 = {
        valuation: getBigNumber(1000),
        duration: DAY,
        annualInterestBPS: 2000,
      };

      await pair.connect(alice).requestLoan(apeIds.aliceOne, params1, alice.address, false);

      await pair.connect(bob).requestLoan(apeIds.bobOne, params1, bob.address, false);

      // One on behalf of someone else:
      await pair.connect(bob).requestLoan(apeIds.bobTwo, params1, carol.address, false);
    });

    const getShares = ({ valuation }: ILoanParams) => {
      const total = valuation.mul(9).div(20);

      // The lender:
      // - Lends out the total
      // - Receives the open fee
      // - Pays the protocol fee (part of the open fee)
      // The borrower
      // - Receives the total
      // - Pays the open fee
      // The contract
      // - Keeps the protocol fee
      const openFee = total.div(100);
      const protocolFee = openFee.div(10);

      const borrowerIn = total.sub(openFee);
      const lenderOut = total.sub(openFee).add(protocolFee);
      return { openFee, protocolFee, borrowerIn, lenderOut };
    };

    it("Should allow anyone to lend", async () => {
      const { lenderOut, borrowerIn } = getShares(params1);

      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, false))
        .to.emit(pair, "LogLend")
        .withArgs(carol.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, carol.address, pair.address, lenderOut)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, alice.address, borrowerIn);

      const loan = await pair.tokenLoan(apeIds.aliceOne);
      expect(loan.lender).to.equal(carol.address);
      expect(loan.borrower).to.equal(alice.address);
      expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
    });

    it("Should allow anyone to lend (skim)", async () => {
      const { lenderOut } = getShares(params1);

      await bentoBox.connect(carol).transfer(guineas.address, carol.address, pair.address, lenderOut);
      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, true)).to.emit(pair, "LogLend");
    });

    it("Should revert if skim amount is too low", async () => {
      const { lenderOut } = getShares(params1);
      const oneLess = lenderOut.sub(1);

      await bentoBox.connect(carol).transfer(guineas.address, carol.address, pair.address, oneLess);
      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, true)).to.be.revertedWith("NFTPair: skim too much");
    });

    it("Should allow collateralizing a loan for someone else", async () => {
      const { lenderOut, borrowerIn } = getShares(params1);

      // Loan was requested by Bob, but money and option to repay go to Carol:
      await expect(pair.connect(alice).lend(apeIds.bobTwo, params1, false))
        .to.emit(pair, "LogLend")
        .withArgs(alice.address, apeIds.bobTwo)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pair.address, lenderOut)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, carol.address, borrowerIn);

      const loan = await pair.tokenLoan(apeIds.bobTwo);
      expect(loan.lender).to.equal(alice.address);
      expect(loan.borrower).to.equal(carol.address);
    });

    it("Should lend if expiration is earlier than expected", async () => {
      const later = { ...params1, duration: params1.duration + 1 };
      await expect(pair.connect(carol).lend(apeIds.aliceOne, later, false)).to.emit(pair, "LogLend");
    });

    it("Should lend if interest is higher than expected", async () => {
      const less = {
        ...params1,
        annualInterestBPS: params1.annualInterestBPS - 1,
      };
      await expect(pair.connect(carol).lend(apeIds.aliceOne, less, false)).to.emit(pair, "LogLend");
    });

    it("Should NOT lend if valuation is off", async () => {
      const tooHigh = { ...params1, valuation: params1.valuation.add(1) };
      const tooLow = { ...params1, valuation: params1.valuation.sub(1) };

      await expect(pair.connect(carol).lend(apeIds.aliceOne, tooHigh, false)).to.be.revertedWith("NFTPair: bad params");
      await expect(pair.connect(carol).lend(apeIds.aliceOne, tooLow, false)).to.be.revertedWith("NFTPair: bad params");
    });

    it("Should NOT lend if expiration is later than expected", async () => {
      const earlier = { ...params1, duration: params1.duration - 1 };
      await expect(pair.connect(carol).lend(apeIds.aliceOne, earlier, false)).to.be.revertedWith("NFTPair: bad params");
    });

    it("Should NOT lend if interest is lower than expected", async () => {
      const more = {
        ...params1,
        annualInterestBPS: params1.annualInterestBPS + 1,
      };
      await expect(pair.connect(carol).lend(apeIds.aliceOne, more, false)).to.be.revertedWith("NFTPair: bad params");
    });

    it("Should only lend against the same token once", async () => {
      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, false)).to.emit(pair, "LogLend");
      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, false)).to.be.revertedWith("NFTPair: not available");
    });

    it("Should only lend if a request was made with collateral", async () => {
      await expect(pair.connect(carol).lend(apeIds.aliceTwo, params1, false)).to.be.revertedWith("NFTPair: not available");
    });
  });

  describeSnapshot("Update Loan Params", () => {
    let tomorrow: number;
    let params1: ILoanParams;
    let pair: NFTPair;

    before(async () => {
      pair = await deployPair();
      tomorrow = Math.floor(new Date().getTime() / 1000) + 86400;

      for (const signer of [alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      params1 = {
        valuation: getBigNumber(1000),
        duration: DAY,
        annualInterestBPS: 2000,
      };

      await pair.connect(alice).requestLoan(apeIds.aliceOne, params1, alice.address, false);
    });

    it("Should allow borrowers any update to loan requests", async () => {
      const data: ILoanParams[] = [params1];
      const recordUpdate = (k, f) => {
        const params = data[data.length - 1];
        data.push({ ...params, [k]: f(params[k]) });
      };
      recordUpdate("valuation", (v) => v.add(10));
      recordUpdate("valuation", (v) => v.sub(20_000_000));
      recordUpdate("annualInterestBPS", (i) => i - 400);
      recordUpdate("annualInterestBPS", (i) => i + 300);
      recordUpdate("duration", (d) => d + 10_000);
      recordUpdate("duration", (d) => d - 9_876);

      for (const params of data) {
        await expect(pair.connect(alice).updateLoanParams(apeIds.aliceOne, params))
          .to.emit(pair, "LogUpdateLoanParams")
          .withArgs(apeIds.aliceOne, params.valuation, params.duration, params.annualInterestBPS);
      }
    });

    it("Should refuse updates to someone else's requests", async () => {
      const params2 = { ...params1, duration: params1.duration + 2 };
      await expect(pair.connect(bob).updateLoanParams(apeIds.aliceOne, params2)).to.be.revertedWith("NFTPair: not the borrower");
    });

    it("..even if you set the loan up for them", async () => {
      const params2 = { ...params1, duration: params1.duration + 2 };
      await pair.connect(bob).requestLoan(apeIds.bobOne, params1, alice.address, false);
      await expect(pair.connect(bob).updateLoanParams(apeIds.bobOne, params2)).to.be.revertedWith("NFTPair: not the borrower");
    });

    it("Should refuse updates to nonexisting loans", async () => {
      const params2 = { ...params1, duration: params1.duration + 2 };
      await expect(pair.connect(alice).updateLoanParams(apeIds.aliceTwo, params2)).to.be.revertedWith("NFTPair: no collateral");
    });

    it("Should refuse non-lender updates to outstanding loans", async () => {
      const params2 = { ...params1, duration: params1.duration - 2 };
      await expect(pair.connect(alice).updateLoanParams(apeIds.aliceOne, params2)).to.emit(pair, "LogUpdateLoanParams");

      await pair.connect(carol).lend(apeIds.aliceOne, params2, false);

      // Borrower:
      await expect(pair.connect(alice).updateLoanParams(apeIds.aliceOne, params1)).to.be.revertedWith("NFTPair: not the lender");

      // Someone else:
      await expect(pair.connect(bob).updateLoanParams(apeIds.aliceOne, params1)).to.be.revertedWith("NFTPair: not the lender");
    });

    it("Should accept same or better conditions from lender", async () => {
      const data = [params1];
      const recordUpdate = (k, f) => {
        const params = data[data.length - 1];
        data.push({ ...params, [k]: f(params[k]) });
      };
      recordUpdate("valuation", (v) => v.sub(10));
      recordUpdate("annualInterestBPS", (i) => i - 400);
      recordUpdate("duration", (d) => d + 10_000);

      await pair.connect(carol).lend(apeIds.aliceOne, params1, false);

      for (const params of data) {
        await expect(pair.connect(carol).updateLoanParams(apeIds.aliceOne, params)).to.emit(pair, "LogUpdateLoanParams");
      }
    });

    it("Should refuse worse conditions from lender", async () => {
      const data: ILoanParams[] = [];
      const recordUpdate = (k, f) => {
        data.push({ ...params1, [k]: f(params1[k]) });
      };
      recordUpdate("valuation", (v) => v.add(1));
      recordUpdate("annualInterestBPS", (i) => i + 1);
      recordUpdate("duration", (d) => d - 1);

      await pair.connect(carol).lend(apeIds.aliceOne, params1, false);

      for (const params of data) {
        await expect(pair.connect(carol).updateLoanParams(apeIds.aliceOne, params)).to.be.revertedWith("NFTPair: worse params");
      }
    });
  });

  describeSnapshot("Remove Collateral", () => {
    let pair: NFTPair;
    const params: ILoanParams = {
      valuation: getBigNumber(123),
      annualInterestBPS: 10_000,
      duration: DAY,
    };
    let startTime: number;

    before(async () => {
      pair = await deployPair();

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      for (const id of [apeIds.aliceOne, apeIds.aliceTwo]) {
        await pair.connect(alice).requestLoan(id, params, alice.address, false);
      }
      await pair.connect(bob).lend(apeIds.aliceOne, params, false);
      startTime = (await pair.tokenLoan(apeIds.aliceOne)).startTime.toNumber();
    });

    it("Should allow borrowers to remove unused collateral", async () => {
      await expect(pair.connect(alice).removeCollateral(apeIds.aliceTwo, alice.address))
        .to.emit(pair, "LogRemoveCollateral")
        .withArgs(apeIds.aliceTwo, alice.address)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceTwo);
    });

    it("Should not allow others to remove unused collateral", async () => {
      await expect(pair.connect(bob).removeCollateral(apeIds.aliceTwo, alice.address)).to.be.revertedWith("NFTPair: not the borrower");
    });

    it("Should not allow borrowers to remove used collateral", async () => {
      await expect(pair.connect(alice).removeCollateral(apeIds.aliceOne, alice.address)).to.be.revertedWith("NFTPair: not the lender");
    });

    it("Should allow lenders to seize collateral at expiry", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration + 1]);
      // Send it to someone else for a change:
      await expect(pair.connect(bob).removeCollateral(apeIds.aliceOne, bob.address))
        .to.emit(pair, "LogRemoveCollateral")
        .withArgs(apeIds.aliceOne, bob.address)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, bob.address, apeIds.aliceOne);
    });

    it("Should allow lenders to seize collateral after expiry", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration + 2]);
      // Send it to someone else for a change:
      await expect(pair.connect(bob).removeCollateral(apeIds.aliceOne, bob.address))
        .to.emit(pair, "LogRemoveCollateral")
        .withArgs(apeIds.aliceOne, bob.address)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, bob.address, apeIds.aliceOne);
    });

    it("Should not allow lenders to seize collateral otherwise", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration]);
      await expect(pair.connect(bob).removeCollateral(apeIds.aliceOne, bob.address)).to.be.revertedWith("NFTPair: not expired");
    });

    it("Should not allow others to seize collateral ever", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration]);
      await expect(pair.connect(carol).removeCollateral(apeIds.aliceOne, carol.address)).to.be.revertedWith("NFTPair: not the lender");

      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration + 1_000_000]);
      await expect(pair.connect(carol).removeCollateral(apeIds.aliceOne, carol.address)).to.be.revertedWith("NFTPair: not the lender");
    });

    it("Should let anyone withdraw stray NFT tokens", async () => {
      await apes.connect(bob).transferFrom(bob.address, pair.address, apeIds.bobOne);
      await expect(pair.connect(bob).removeCollateral(apeIds.bobOne, bob.address))
        .to.emit(pair, "LogRemoveCollateral")
        .withArgs(apeIds.bobOne, bob.address);
    });
  });

  describeSnapshot("Repay", () => {
    let pair: NFTPair;
    let startTime: number;

    const params: ILoanParams = {
      valuation: getBigNumber(1),
      annualInterestBPS: 10_000,
      duration: YEAR,
    };
    const valuationShare = params.valuation.mul(9).div(20);
    const borrowerShare = valuationShare.mul(99).div(100);

    // Theoretically this could fail to actually bound the repay share because
    // of the FP math used. Double check using a more exact method if that
    // happens:
    const YEAR_BPS = YEAR * 10_000;
    const COMPOUND_TERMS = 6;
    const getMaxRepayShare = (time, params_) => {
      // We mimic what the contract does, but without rounding errors in the
      // approximation, so the upper bound should be strict.
      // 1. Calculate exact amount owed; round it down, like the contract does.
      // 2. Convert that to Bento shares (still hardcoded at 9/20); rounding up
      const x = BigRational.from(time * params_.annualInterestBPS).div(YEAR_BPS);
      return expApprox(x, COMPOUND_TERMS).mul(params_.valuation).floor().mul(9).add(19).div(20);
    };

    before(async () => {
      pair = await deployPair();

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      for (const id of [apeIds.aliceOne, apeIds.aliceTwo]) {
        await pair.connect(alice).requestLoan(id, params, alice.address, false);
      }
      await pair.connect(bob).lend(apeIds.aliceOne, params, false);
      startTime = (await pair.tokenLoan(apeIds.aliceOne)).startTime.toNumber();
    });

    it("Should allow borrowers to pay off loans before expiry", async () => {
      const getBalances = async () => ({
        alice: await bentoBox.balanceOf(guineas.address, alice.address),
        bob: await bentoBox.balanceOf(guineas.address, bob.address),
        pair: await bentoBox.balanceOf(guineas.address, pair.address),
        feeTracker: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      // Two Bento transfers: payment to the lender, fee to the contract
      await advanceNextTime(DAY);
      await expect(pair.connect(alice).repay(apeIds.aliceOne, alice.address, false))
        .to.emit(pair, "LogRepay")
        .withArgs(alice.address, apeIds.aliceOne)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .to.emit(bentoBox, "LogTransfer");

      const t1 = await getBalances();
      const maxRepayShare = getMaxRepayShare(DAY, params);
      const linearInterest = valuationShare.mul(params.annualInterestBPS).mul(DAY).div(YEAR_BPS);

      const paid = t0.alice.sub(t1.alice);
      expect(paid).to.be.gte(valuationShare.add(linearInterest));
      expect(paid).to.be.lte(maxRepayShare);

      // The difference is rounding errors only, so should be very small:
      const paidError = maxRepayShare.sub(paid);
      expect(paidError.mul(1_000_000_000)).to.be.lt(paid);

      // The fee is hardcoded at 10% of the interest
      const fee = t1.feeTracker.sub(t0.feeTracker);
      expect(fee.mul(10)).to.be.gte(linearInterest);
      expect(fee.mul(10)).to.be.lte(paid.sub(valuationShare));
      expect(t1.pair.sub(t0.pair)).to.equal(fee);

      const received = t1.bob.sub(t0.bob);
      expect(received.add(fee)).to.equal(paid);
    });

    it("Should allow paying off loans for someone else", async () => {
      // ..and take from the correct person:
      const getBalances = async () => ({
        alice: await bentoBox.balanceOf(guineas.address, alice.address),
        bob: await bentoBox.balanceOf(guineas.address, bob.address),
        carol: await bentoBox.balanceOf(guineas.address, carol.address),
        pair: await bentoBox.balanceOf(guineas.address, pair.address),
        feeTracker: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      await advanceNextTime(DAY);
      await expect(pair.connect(carol).repay(apeIds.aliceOne, alice.address, false))
        .to.emit(pair, "LogRepay")
        .withArgs(carol.address, apeIds.aliceOne)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .to.emit(bentoBox, "LogTransfer");

      const t1 = await getBalances();
      const maxRepayShare = getMaxRepayShare(DAY, params);

      // Alice paid or received nothing:
      expect(t0.alice).to.equal(t1.alice);

      const paid = t0.carol.sub(t1.carol);

      // The difference is rounding errors only, so should be very small:
      const paidError = maxRepayShare.sub(paid);
      expect(paidError.mul(1_000_000_000)).to.be.lt(paid);

      const fee = t1.feeTracker.sub(t0.feeTracker);
      expect(fee.mul(10)).to.be.lte(paid.sub(valuationShare));
      expect(t1.pair.sub(t0.pair)).to.equal(fee);

      const received = t1.bob.sub(t0.bob);
      expect(received.add(fee)).to.equal(paid);
    });

    it("Should allow paying off loans for someone else (skim)", async () => {
      const interval = 234 * DAY + 5678;
      // Does not matter who supplies the payment. Note that there will be
      // an excess left; skimming is really only suitable for contracts that
      // can calculate the exact repayment needed:
      const exactAmount = params.valuation.add(await pair.calculateInterest(params.valuation, interval, params.annualInterestBPS));
      // The contract rounds down; we round up and add a little:
      const closeToShare = exactAmount.mul(9).add(19).div(20);
      const enoughShare = closeToShare.add(getBigNumber(1337, 8));

      // This would normally be done in the same transaction...
      await bentoBox.connect(bob).transfer(guineas.address, bob.address, pair.address, enoughShare);

      const getBalances = async () => ({
        alice: await bentoBox.balanceOf(guineas.address, alice.address),
        bob: await bentoBox.balanceOf(guineas.address, bob.address),
        carol: await bentoBox.balanceOf(guineas.address, carol.address),
        pair: await bentoBox.balanceOf(guineas.address, pair.address),
        feeTracker: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      await ethers.provider.send("evm_setNextBlockTimestamp", [(await pair.tokenLoan(apeIds.aliceOne)).startTime.toNumber() + interval]);
      await expect(pair.connect(carol).repay(apeIds.aliceOne, alice.address, true))
        .to.emit(pair, "LogRepay")
        .withArgs(pair.address, apeIds.aliceOne)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .to.emit(bentoBox, "LogTransfer");

      const t1 = await getBalances();
      const maxRepayShare = getMaxRepayShare(interval, params);

      // Alice paid or received nothing:
      expect(t0.alice).to.equal(t1.alice);

      // Neither did Carol, who skimmed the preexisting excess balance:
      expect(t0.carol).to.equal(t1.carol);

      // The pair kept the fee and the excess, but sent the repayment to Bob:
      const fee = t1.feeTracker.sub(t0.feeTracker);
      expect(t1.pair).to.be.gte(t1.feeTracker);

      // The skimmable amount covers the entire payment:
      const received = t1.bob.sub(t0.bob);

      const paid = received.add(fee);
      expect(paid).to.be.lte(enoughShare);

      // Funds either went to Bob or stayed with the pair:
      expect(t0.pair.sub(t1.pair)).to.equal(received);

      const leftover = t1.pair.sub(t1.feeTracker);
      expect(leftover).to.equal(enoughShare.sub(paid));

      expect(fee.mul(10)).to.be.lte(paid.sub(valuationShare));
    });

    // Simple scenario to help refactor `cook()`:
    it("Should allow paying off loans for someone else (cook)", async () => {
      // ..and take from the correct person:
      const getBalances = async () => ({
        alice: await bentoBox.balanceOf(guineas.address, alice.address),
        bob: await bentoBox.balanceOf(guineas.address, bob.address),
        carol: await bentoBox.balanceOf(guineas.address, carol.address),
        pair: await bentoBox.balanceOf(guineas.address, pair.address),
        feeTracker: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      await advanceNextTime(DAY);

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      actions.push(ACTION_REPAY);
      values.push(0);
      datas.push(encodeParameters(["uint256", "address", "bool"], [apeIds.aliceOne, alice.address, false]));

      await expect(pair.connect(carol).cook(actions, values, datas))
        .to.emit(pair, "LogRepay")
        .withArgs(carol.address, apeIds.aliceOne)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .to.emit(bentoBox, "LogTransfer");

      const t1 = await getBalances();
      const maxRepayShare = getMaxRepayShare(DAY, params);

      // Alice paid or received nothing:
      expect(t0.alice).to.equal(t1.alice);

      const paid = t0.carol.sub(t1.carol);

      // The difference is rounding errors only, so should be very small:
      const paidError = maxRepayShare.sub(paid);
      expect(paidError.mul(1_000_000_000)).to.be.lt(paid);

      const fee = t1.feeTracker.sub(t0.feeTracker);
      expect(fee.mul(10)).to.be.lte(paid.sub(valuationShare));
      expect(t1.pair.sub(t0.pair)).to.equal(fee);

      const received = t1.bob.sub(t0.bob);
      expect(received.add(fee)).to.equal(paid);
    });

    it("Should allow paying off loans for someone else (c+s)", async () => {
      const interval = 234 * DAY + 5678;
      // Does not matter who supplies the payment. Note that there will be
      // an excess left; skimming is really only suitable for contracts that
      // can calculate the exact repayment needed:
      const exactAmount = params.valuation.add(await pair.calculateInterest(params.valuation, interval, params.annualInterestBPS));
      // The contract rounds down; we round up and add a little:
      const closeToShare = exactAmount.mul(9).add(19).div(20);
      const enoughShare = closeToShare.add(getBigNumber(1337, 8));

      // This would normally be done in the same transaction...
      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      const getBalances = async () => ({
        alice: await bentoBox.balanceOf(guineas.address, alice.address),
        bob: await bentoBox.balanceOf(guineas.address, bob.address),
        carol: await bentoBox.balanceOf(guineas.address, carol.address),
        pair: await bentoBox.balanceOf(guineas.address, pair.address),
        feeTracker: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      // Calculate repay share exactly
      actions.push(ACTION_GET_SHARES_DUE);
      values.push(0);
      datas.push(encodeParameters(["uint256"], [apeIds.aliceOne]));

      actions.push(ACTION_BENTO_TRANSFER);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256"], [guineas.address, pair.address, USE_VALUE1]));

      actions.push(ACTION_REPAY);
      values.push(0);
      datas.push(encodeParameters(["uint256", "address", "bool"], [apeIds.aliceOne, alice.address, true]));

      await ethers.provider.send("evm_setNextBlockTimestamp", [(await pair.tokenLoan(apeIds.aliceOne)).startTime.toNumber() + interval]);
      await expect(pair.connect(carol).cook(actions, values, datas))
        .to.emit(pair, "LogRepay")
        .withArgs(pair.address, apeIds.aliceOne)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .to.emit(bentoBox, "LogTransfer");

      const t1 = await getBalances();
      const maxRepayShare = getMaxRepayShare(interval, params);

      // We essentially did a normal repayment, so expect the same balance
      // changes as in the case where we are not skimming:

      // Alice paid or received nothing:
      expect(t0.alice).to.equal(t1.alice);

      const paid = t0.carol.sub(t1.carol);

      // The difference is rounding errors only, so should be very small:
      const paidError = maxRepayShare.sub(paid);
      expect(paidError.mul(1_000_000_000)).to.be.lt(paid);

      const fee = t1.feeTracker.sub(t0.feeTracker);
      expect(fee.mul(10)).to.be.lte(paid.sub(valuationShare));
      expect(t1.pair.sub(t0.pair)).to.equal(fee);

      const received = t1.bob.sub(t0.bob);
      expect(received.add(fee)).to.equal(paid);
    });

    it("Should work for a large, but repayable, number", async () => {
      const fiveYears = 5 * YEAR;
      const large: ILoanParams = {
        valuation: getBigNumber(1_000_000_000),
        annualInterestBPS: 65_535,
        duration: 2 * fiveYears,
      };

      await pair.connect(alice).updateLoanParams(apeIds.aliceTwo, large);

      await guineas.transfer(bob.address, large.valuation);
      await guineas.transfer(alice.address, MaxUint128);

      // Alice and Bob already had something deposited; this will ensure they
      // can pay. Alice's total must not overflow the max BB balance..
      await bentoBox.connect(bob).deposit(guineas.address, bob.address, bob.address, large.valuation, 0);
      // (Don't overflow the BentoBox..)
      await bentoBox.connect(alice).deposit(guineas.address, alice.address, alice.address, MaxUint128.div(2), 0);

      await pair.connect(bob).lend(apeIds.aliceTwo, large, false);

      const getBalances = async () => ({
        alice: await bentoBox.balanceOf(guineas.address, alice.address),
        bob: await bentoBox.balanceOf(guineas.address, bob.address),
        pair: await bentoBox.balanceOf(guineas.address, pair.address),
        feeTracker: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      const inFive = await advanceNextTime(fiveYears);

      await expect(pair.connect(alice).repay(apeIds.aliceTwo, alice.address, false))
        .to.emit(pair, "LogRepay")
        .withArgs(alice.address, apeIds.aliceTwo)
        .to.emit(apes, "Transfer")
        .withArgs(pair.address, alice.address, apeIds.aliceTwo)
        .to.emit(bentoBox, "LogTransfer")
        .to.emit(bentoBox, "LogTransfer");

      const t1 = await getBalances();
      const maxRepayShare = getMaxRepayShare(fiveYears, large);
      const linearInterest = valuationShare.mul(large.annualInterestBPS).mul(fiveYears).div(YEAR_BPS);

      const paid = t0.alice.sub(t1.alice);
      expect(paid).to.be.gte(valuationShare.add(linearInterest));
      expect(paid).to.be.lte(maxRepayShare);

      // The interest really is ridiculous:
      expect(paid).to.be.gte(valuationShare.mul(170_000_000_000_000n));

      // The difference is rounding errors only, so should be very small:
      const difference = maxRepayShare.sub(paid);
      expect(difference.mul(1_000_000_000)).to.be.lt(paid);

      // The difference is rounding errors only, so should be very small:
      const paidError = maxRepayShare.sub(paid);
      expect(paidError.mul(1_000_000_000)).to.be.lt(paid);

      // Lower bound makes little sense here..
      const fee = t1.feeTracker.sub(t0.feeTracker);
      expect(fee.mul(10)).to.be.lte(paid.sub(valuationShare));
      expect(t1.pair.sub(t0.pair)).to.equal(fee);

      const received = t1.bob.sub(t0.bob);
      expect(received.add(fee)).to.equal(paid);
    });

    it("Should refuse repayments on expired loans", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration + 1]);
      await expect(pair.connect(alice).repay(apeIds.aliceOne, alice.address, false)).to.be.revertedWith("NFTPair: loan expired");
    });

    it("Should refuse repayments on nonexistent loans", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + params.duration + 1]);
      await expect(pair.connect(carol).repay(apeIds.carolOne, carol.address, false)).to.be.revertedWith("NFTPair: no loan");
    });

    it("Should refuse to skim too much", async () => {
      const interval = 234 * DAY + 5678;
      // Does not matter who supplies the payment. Note that there will be
      // an excess left; skimming is really only suitable for contracts that
      // can calculate the exact repayment needed:
      const exactAmount = params.valuation.add(await pair.calculateInterest(params.valuation, interval, params.annualInterestBPS));
      // Round down and subtract some more to be sure, but close:
      const notEnoughShare = exactAmount.mul(9).div(20).sub(1337);

      await bentoBox.connect(bob).transfer(guineas.address, bob.address, pair.address, notEnoughShare);

      await ethers.provider.send("evm_setNextBlockTimestamp", [(await pair.tokenLoan(apeIds.aliceOne)).startTime.toNumber() + interval]);
      await expect(pair.connect(carol).repay(apeIds.aliceOne, alice.address, true)).to.be.revertedWith("NFTPair: skim too much");
    });
  });

  describeSnapshot("Signed Lend/Borrow", () => {
    let pair: NFTPair;
    let DOMAIN_SEPARATOR: string;
    let BORROW_SIGNATURE_HASH: string;
    let LEND_SIGNATURE_HASH: string;

    before(async () => {
      pair = await deployPair();

      DOMAIN_SEPARATOR = keccak256(
        defaultAbiCoder.encode(["bytes32", "uint256", "address"], [DOMAIN_SEPARATOR_HASH, chainId, masterContract.address])
      );

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }
    });

    it("Should have the expected DOMAIN_SEPARATOR", async () => {
      expect(DOMAIN_SEPARATOR).to.equal(await pair.DOMAIN_SEPARATOR());
    });

    describe("Lend", () => {
      // The borrower somehow obtains the signature, then requests and gets the
      // loan in one step:
      it("Should support pre-approving a loan request", async () => {
        // Bob agrees to lend 100 guineas agaist token "carolOne", to be repaid
        // no later one year from now. This offer is good for one hour, and can
        // be taken up by anyone who can provide the token (and the signature).
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signLendRequest(pair, bob, {
          tokenId: apeIds.carolOne,
          anyTokenId: false,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        // Carol takes the loan:
        await expect(
          pair
            .connect(carol)
            .requestAndBorrow(apeIds.carolOne, bob.address, carol.address, { valuation, duration, annualInterestBPS }, false, false, sigParams)
        ).to.emit(pair, "LogLend");
      });

      it("Should support pre-approving a loan request for any token", async () => {
        // Bob agrees to lend 100 guineas agaist any ape, to be repaid
        // no later one year from now. This offer is good for one hour, and can
        // be taken up by anyone who can provide the token (and the signature).
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signLendRequest(pair, bob, {
          tokenId: 0,
          anyTokenId: true,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        // Carol takes the loan:
        await expect(
          pair
            .connect(carol)
            .requestAndBorrow(apeIds.carolOne, bob.address, carol.address, { valuation, duration, annualInterestBPS }, false, true, sigParams)
        ).to.emit(pair, "LogLend");
      });

      it("Should require an exact match on all conditions", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signLendRequest(pair, bob, {
          tokenId: apeIds.carolOne,
          anyTokenId: false,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };
        // Carol tries to take the loan, but fails because oneo of the
        // parameters is different. This pretty much only tests that we do the
        // signature check at all, and it feels a bit silly to check every
        // variable: if the "success" case passes and any one of these fails,
        // then the hash is being checked.
        // (Similarly, we could check the token ID, contract, token contracts,
        // etc, but we don't, because we know we are hashing those.)
        for (const [key, value] of Object.entries(loanParams)) {
          const altered = BigNumber.from(value).add(1);
          const badLoanParams = { ...loanParams, [key]: altered };
          await expect(
            pair.connect(carol).requestAndBorrow(apeIds.carolOne, bob.address, carol.address, badLoanParams, false, false, sigParams)
          ).to.be.revertedWith("NFTPair: signature invalid");
        }
      });

      it("Should require the lender to be the signer", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signLendRequest(pair, bob, {
          tokenId: apeIds.carolOne,
          anyTokenId: false,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };
        // Carol tries to take the loan from Alice instead and fails:
        await expect(
          pair.connect(carol).requestAndBorrow(apeIds.carolOne, alice.address, carol.address, loanParams, false, false, sigParams)
        ).to.be.revertedWith("NFTPair: signature invalid");
      });

      it("Should enforce the deadline", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signLendRequest(pair, bob, {
          tokenId: apeIds.carolOne,
          anyTokenId: false,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };
        const successParams = [apeIds.carolOne, bob.address, carol.address, loanParams, false, false, sigParams] as const;

        // Request fails because the deadline has expired:
        await advanceNextTime(3601);
        await expect(pair.connect(carol).requestAndBorrow(...successParams)).to.be.revertedWith("NFTPair: signature expired");
      });

      it("Should not accept the same signature twice", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signLendRequest(pair, bob, {
          tokenId: apeIds.carolOne,
          anyTokenId: false,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };
        const successParams = [apeIds.carolOne, bob.address, carol.address, loanParams, false, false, sigParams] as const;

        // It works the first time:
        await expect(pair.connect(carol).requestAndBorrow(...successParams)).to.emit(pair, "LogLend");

        // Carol repays the loan to get the token back:
        await expect(pair.connect(carol).repay(apeIds.carolOne, carol.address, false)).to.emit(pair, "LogRepay");
        expect(await apes.ownerOf(apeIds.carolOne)).to.equal(carol.address);

        // It fails now (because the nonce is no longer a match):
        await expect(pair.connect(carol).requestAndBorrow(...successParams)).to.be.revertedWith("NFTPair: signature invalid");
      });
    });

    describe("Borrow", () => {
      // Signing a commitment to borrow mainly differs in that:
      // - It is not put on chain  until the loan is actually made
      // - Only the recipient (of the signed message, for now) can lend
      // - The borrower can pull out by failing to satisfy the conditions for
      //   `requestLoan`.
      it("Should let borrowers sign a private loan request", async () => {
        // Bob commits to borrow 100 guineas and supply token "bobTwo" as
        // collateral, to be repaid no later than a year from now. The offer is
        // good for one hour, and anyone willing to lend at these terms can
        // take it up - if they have the signature.
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signBorrowRequest(pair, bob, {
          tokenId: apeIds.bobTwo,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        // Alice takes the loan:
        await expect(
          pair.connect(alice).takeCollateralAndLend(apeIds.bobTwo, bob.address, { valuation, duration, annualInterestBPS }, false, sigParams)
        ).to.emit(pair, "LogLend");
      });

      it("Should require an exact match on all conditions", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signBorrowRequest(pair, bob, {
          tokenId: apeIds.bobTwo,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };
        for (const [key, value] of Object.entries(loanParams)) {
          const altered = BigNumber.from(value).add(1);
          const badLoanParams = { ...loanParams, [key]: altered };
          await expect(
            pair.connect(alice).takeCollateralAndLend(apeIds.bobTwo, bob.address, badLoanParams, false, sigParams)
          ).to.be.revertedWith("NFTPair: signature invalid");
        }
      });

      it("Should require the borrower to be the signer", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signBorrowRequest(pair, bob, {
          tokenId: apeIds.bobTwo,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };
        // Alice tries to lend to Carol instead and fails:
        await expect(pair.connect(alice).takeCollateralAndLend(apeIds.bobTwo, carol.address, loanParams, false, sigParams)).to.be.revertedWith(
          "NFTPair: signature invalid"
        );
      });

      it("Should enforce the deadline", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signBorrowRequest(pair, bob, {
          tokenId: apeIds.bobTwo,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };

        await advanceNextTime(3601);
        await expect(pair.connect(alice).takeCollateralAndLend(apeIds.bobTwo, bob.address, loanParams, false, sigParams)).to.be.revertedWith(
          "NFTPair: signature expired"
        );
      });

      it("Should not accept the same signature twice", async () => {
        const { timestamp } = await ethers.provider.getBlock("latest");
        const valuation = getBigNumber(100);
        const duration = 365 * 24 * 3600;
        const annualInterestBPS = 15000;
        const deadline = timestamp + 3600;

        const sigParams = await signBorrowRequest(pair, bob, {
          tokenId: apeIds.bobTwo,
          valuation,
          duration,
          annualInterestBPS,
          deadline,
        });

        const loanParams = { valuation, duration, annualInterestBPS };

        await expect(pair.connect(alice).takeCollateralAndLend(apeIds.bobTwo, bob.address, loanParams, false, sigParams)).to.emit(
          pair,
          "LogLend"
        );

        // Bob repays the loan to get the token back:
        await expect(pair.connect(bob).repay(apeIds.bobTwo, bob.address, false)).to.emit(pair, "LogRepay");
        expect(await apes.ownerOf(apeIds.bobTwo)).to.equal(bob.address);

        // It fails now (because the nonce is no longer a match):
        await expect(pair.connect(alice).takeCollateralAndLend(apeIds.bobTwo, bob.address, loanParams, false, sigParams)).to.be.revertedWith(
          "NFTPair: signature invalid"
        );
      });
    });

    // Not tested, in either case: the loan is set up correctly, both
    // collateral and assets change hands, etc. This happens to hold currently,
    // but that is only because the implementation is exactly "call
    // requestLoan() on behalf of the borrower, then lend() on behalf of the
    // lender".
  });

  describeSnapshot("Withdraw Fees", () => {
    let pair: NFTPair;

    const params: ILoanParams = {
      valuation: getBigNumber(3),
      annualInterestBPS: 5_000,
      duration: YEAR,
    };
    const valuationShare = params.valuation.mul(9).div(20);
    const borrowerShare = valuationShare.mul(99).div(100);

    // Theoretically this could fail to actually bound the repay share because
    // of the FP math used. Double check using a more exact method if that
    // happens:
    const YEAR_BPS = YEAR * 10_000;
    const COMPOUND_TERMS = 6;
    const getMaxRepayShare = (time, params_) => {
      // We mimic what the contract does, but without rounding errors in the
      // approximation, so the upper bound should be strict.
      // 1. Calculate exact amount owed; round it down, like the contract does.
      // 2. Convert that to Bento shares (still hardcoded at 9/20); rounding up
      const x = BigRational.from(time * params_.annualInterestBPS).div(YEAR_BPS);
      return expApprox(x, COMPOUND_TERMS).mul(params_.valuation).floor().mul(9).add(19).div(20);
    };

    before(async () => {
      pair = await deployPair();

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      await pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, false);
      await pair.connect(bob).lend(apeIds.aliceOne, params, false);

      expect(await pair.feeTo()).to.equal(AddressZero);
      expect(await masterContract.feeTo()).to.equal(AddressZero);
      expect(await pair.owner()).to.equal(AddressZero);
      expect(await masterContract.owner()).to.equal(deployer.address);
    });

    // Scenario covered by BentoBox (refuses to send to zero address)
    it("Should not burn funds if feeTo not set", async () => {
      await expect(pair.connect(alice).withdrawFees()).to.be.revertedWith("BentoBox: to not set");
    });

    it("Should let only the deployer change the fee recipient", async () => {
      await expect(masterContract.connect(bob).setFeeTo(alice.address)).to.be.revertedWith("Ownable: caller is not the owner");

      await expect(masterContract.connect(deployer).setFeeTo(alice.address)).to.emit(masterContract, "LogFeeTo").withArgs(alice.address);

      expect(await masterContract.feeTo()).to.equal(alice.address);
      expect(await pair.feeTo()).to.equal(AddressZero);
    });

    it("Should let anyone request a withdrawal - to the operator", async () => {
      await masterContract.connect(deployer).setFeeTo(carol.address);
      // 10% of the 1% open fee on the loan:
      const feeShare = params.valuation.div(1000).mul(9).div(20);
      expect(feeShare).to.be.gt(0);
      expect(await pair.feesEarnedShare()).to.equal(feeShare);
      await expect(pair.connect(bob).withdrawFees())
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, carol.address, feeShare)
        .to.emit(pair, "LogWithdrawFees")
        .withArgs(carol.address, feeShare);

      expect(await pair.feesEarnedShare()).to.equal(0);

      await expect(pair.connect(bob).withdrawFees()).to.emit(pair, "LogWithdrawFees").withArgs(carol.address, 0);
    });
  });

  describeSnapshot("Edge Cases", () => {
    // For coverage mostly - entire scenario not really necessary:
    let pair: NFTPair;

    before(async () => {
      pair = await deployPair();

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }
    });

    it("Should revert if payable interest exceeds 2^128", async () => {
      await expect(pair.calculateInterest(MaxUint128, YEAR, 10_000)).to.be.reverted;
    });
  });

  describeSnapshot("Other Cook Scenarios", () => {
    // Uses its own
    let pair: NFTPair;
    let market: NFTMarketMock;
    let DOMAIN_SEPARATOR: string;
    let BORROW_SIGNATURE_HASH: string;
    let LEND_SIGNATURE_HASH: string;

    const tokenIds: BigNumber[] = [];
    before(async () => {
      pair = await deployPair();
      // Undo some of the setup, so we start from scratch:
      const mc = masterContract.address;
      const hz = HashZero;
      for (const signer of [alice, bob, carol]) {
        const addr = signer.address;
        const bb = bentoBox.connect(signer);
        // In theory this can be done via a cook. In practice we're having some
        // trouble with the EIP-712 (structured data) signature due to BentoBox
        // using a slightly different encoding scheme than ethers.io expects.
        // So, contract approval is assumed in our tests.
        // await bb.setMasterContractApproval(addr, mc, false, 0, hz, hz);

        await guineas.transfer(addr, getBigNumber(10_000));
        //
        await guineas.connect(signer).approve(bentoBox.address, MaxUint256);

        // We added profit in the setup; 3000 guineas became 3000 shares
        await bb.withdraw(guineas.address, addr, addr, 0, getBigNumber(3000));
      }
      expect(await bentoBox.balanceOf(guineas.address, alice.address)).to.equal(0);

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      for (let i = 0; i < 10; i++) {
        tokenIds.push(await mintApe(bob.address));
      }
    });

    const approveHash = hashUtf8String("Give FULL access to funds in (and approved to) BentoBox?");
    const revokeHash = hashUtf8String("Revoke access to BentoBox?");
    const signBentoApprovalRequest = async (wallet, approved: boolean, nonce?: number) => {
      const sigTypes = [
        { name: "warning", type: "string" },
        { name: "user", type: "address" },
        { name: "contract", type: "address" },
        { name: "approved", type: "bool" },
        { name: "nonce", type: "uint256" },
      ];

      const sigValues = {
        warning: approved ? approveHash : revokeHash,
        user: wallet.address,
        contract: bentoBox.address,
        approved,
        nonce: nonce ?? 0,
      };

      // At this point we'd like to sign this digest, but signing arbitrary
      // data is made difficult in ethers.js to prevent abuse. So for now we
      // use a helper method that basically does everything we just did again:
      const sig = await wallet._signTypedData(
        // The stuff going into DOMAIN_SEPARATOR:
        {
          name: hashUtf8String("BentoBox V1"),
          chainId,
          verifyingContract: bentoBox.address,
        },

        // sigHash
        { SetMasterContractApproval: sigTypes },
        sigValues
      );
      return splitSignature(sig);
    };

    // Bob is hardcoded as the borrower
    const requestLoans = (getArgs: (i: number) => [ILoanParams, string, boolean]) => {
      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];
      for (let i = 0; i < tokenIds.length; i++) {
        const tokenId = tokenIds[i];
        const [params, recipient, skim] = getArgs(i);
        actions.push(ACTION_REQUEST_LOAN);
        values.push(0);
        datas.push(
          encodeParameters(
            ["uint256", "tuple(uint128 valuation, uint64 duration, uint16 annualInterestBPS)", "address", "bool"],
            [tokenId, params, recipient, skim]
          )
        );
      }
      return pair.connect(bob).cook(actions, values, datas);
    };

    // Alice is hardcoded as the lender
    const issueLoans = (getArgs: (i: number) => [ILoanParams, boolean]) => {
      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // 1. Set contract approval. SKIPPING involuntarily:
      // const { v, r, s } = await signBentoApprovalRequest(alice, true);
      // actions.push(ACTION_BENTO_SETAPPROVAL);
      // values.push(0);
      // datas.push(encodeParameters(
      //   ["address", "address", "bool", "uint8", "bytes32", "bytes32"],
      //   [alice.address, masterContract.address, true, v, r, s]
      // ));

      // 2. Deposit funds into BentoBox
      const n = tokenIds.length;
      expect(n).to.be.gte(2);
      const amountNeeded = getBigNumber(n * (n + 1) * 6);
      actions.push(ACTION_BENTO_DEPOSIT);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, alice.address, amountNeeded, 0]));

      // 3. Lend
      for (let i = 0; i < n; i++) {
        actions.push(ACTION_LEND);
        values.push(0);
        const [params, skim] = getArgs(i);
        datas.push(
          encodeParameters(
            ["uint256", "tuple(uint128 valuation, uint64 duration, uint16 annualInterestBPS)", "bool"],
            [tokenIds[i], params, skim]
          )
        );
      }

      return pair.connect(alice).cook(actions, values, datas);
    };

    // Suppose this is one use case..
    it("Should allow requesting multiple loans", async () => {
      // All apes come from Bob:
      await expect(
        requestLoans((i) => [
          {
            valuation: getBigNumber((i + 1) * 12),
            duration: YEAR,
            annualInterestBPS: i * 500,
          },
          [alice.address, bob.address, carol.address][i % 3],
          false,
        ])
      )
        .to.emit(apes, "Transfer")
        .withArgs(bob.address, pair.address, tokenIds[0])
        .to.emit(apes, "Transfer")
        .withArgs(bob.address, pair.address, tokenIds[1])
        .to.emit(apes, "Transfer")
        .withArgs(bob.address, pair.address, tokenIds[9])
        .to.emit(pair, "LogRequestLoan")
        .withArgs(alice.address, tokenIds[6], getBigNumber(7 * 12), YEAR, 6 * 500)
        .to.emit(pair, "LogRequestLoan")
        .withArgs(bob.address, tokenIds[7], getBigNumber(8 * 12), YEAR, 7 * 500)
        .to.emit(pair, "LogRequestLoan")
        .withArgs(carol.address, tokenIds[8], getBigNumber(9 * 12), YEAR, 8 * 500);
    });

    it("Should have the expected domain separator", async () => {
      // Note the string type for "name", while in reality we hash it,
      // resulting in a "bytes32". This type of thing causes problems if we use
      // the ethers library for signing structured messages.
      const hash = hashUtf8String("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
      const domainSeparator = keccak256(
        defaultAbiCoder.encode(["bytes32", "bytes32", "uint256", "address"], [hash, hashUtf8String("BentoBox V1"), chainId, bentoBox.address])
      );
      expect(domainSeparator).to.equal(await bentoBox.DOMAIN_SEPARATOR());
    });

    it("Should disallow taking collateral NFTs via ACTION_CALL", async () => {
      // To supply collateral, we have to approve the NFT pair to spend our
      // tokens. If we also allow arbitrary calls to the collateral token, then
      // this can be used to steal NFTs:
      const takeNftFrom = (contract, owner, tokenId) => {
        const params = encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [contract.address, contract.interface.encodeFunctionData("transferFrom", [owner.address, bob.address, tokenId]), false, false, 0]
        );
        return pair.connect(bob).cook([ACTION_CALL], [0], [params]);
      };
      await expect(takeNftFrom(apes, alice, apeIds.aliceOne)).to.be.revertedWith("NFTPair: can't call");

      // As an extra check, the same call for some other token works - if an
      // owner has ill-advisedly allowed the pair to spend that other token:
      const bears = await deployContract("ERC721Mock");
      const carolBearId = await mintToken(bears, carol.address);
      // WIthout approval:
      await expect(takeNftFrom(bears, carol, carolBearId)).to.be.revertedWith("NFTPair: call failed");

      // With approval:
      await bears.connect(carol).setApprovalForAll(pair.address, true);
      await expect(takeNftFrom(bears, carol, carolBearId)).to.emit(bears, "Transfer").withArgs(carol.address, bob.address, carolBearId);
    });

    // Failing the approval request; types in sig not an exact match, so have to
    // sign the message without help from ethers' abstractions. See also the
    // DOMAIN_SEPARATOR test; suspect a similar issue.
    it("Should handle depositing and lending with minimal setup", async () => {
      // Bob requests loans for himself:
      await requestLoans((i) => [
        {
          valuation: getBigNumber((i + 1) * 12),
          duration: YEAR,
          annualInterestBPS: i * 500,
        },
        bob.address,
        false,
      ]);
      await expect(
        issueLoans((i) => [
          {
            valuation: getBigNumber((i + 1) * 12),
            duration: YEAR,
            annualInterestBPS: i * 500,
          },
          false,
        ])
      )
        .to.emit(pair, "LogLend")
        .withArgs(alice.address, tokenIds[0]);
    });

    it("Should revert the entire cook if one transaction fails", async () => {
      await requestLoans((i) => [
        {
          valuation: getBigNumber((i + 1) * 12),
          duration: YEAR,
          annualInterestBPS: i * 500,
        },
        bob.address,
        false,
      ]);

      await expect(
        issueLoans((i) => [
          {
            valuation: getBigNumber((i + 1) * 12),
            duration: YEAR,
            // Last request is bad in that the lender now wants more interest
            // than the borrower is willing to pay:
            annualInterestBPS: i * 500 + (i == tokenIds.length - 1 ? 1 : 0),
          },
          false,
        ])
      ).to.be.revertedWith("NFTPair: bad params");
    });

    it("Should allow multiple BentoBox transfers", async () => {
      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // Share/amount ratio is 1:
      expect(await bentoBox.toShare(weth.address, getBigNumber(1), false)).to.equal(getBigNumber(1));

      // 1. Deposit
      const toBob = getBigNumber(1);
      const toCarol = getBigNumber(2);
      const total = toBob.add(toCarol);
      const USE_ETHEREUM = AddressZero;
      actions.push(ACTION_BENTO_DEPOSIT);
      values.push(total);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [USE_ETHEREUM, alice.address, total, 0]));

      // 2. Transfer (single)
      const toCarolSingle = toCarol.mul(1).div(4);
      const toCarolBatch = toCarol.sub(toCarolSingle);
      expect(toCarolSingle.mul(toCarolBatch)).to.be.gt(0);
      actions.push(ACTION_BENTO_TRANSFER);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256"], [weth.address, carol.address, toCarolSingle]));

      // 3. Transfer (multiple)
      actions.push(ACTION_BENTO_TRANSFER_MULTIPLE);
      values.push(0);
      datas.push(encodeParameters(["address", "address[]", "uint256[]"], [weth.address, [bob.address, carol.address], [toBob, toCarolBatch]]));

      await pair.connect(alice).cook(actions, values, datas, { value: total });

      expect(await bentoBox.balanceOf(weth.address, alice.address)).to.equal(0);
      expect(await bentoBox.balanceOf(weth.address, bob.address)).to.equal(toBob);
      expect(await bentoBox.balanceOf(weth.address, carol.address)).to.equal(toCarol);
    });
  });

  describeSnapshot("Flash Repay", () => {
    let pair: NFTPair;
    let swapper: NFTBuyerSellerMock;

    const params1 = {
      valuation: getBigNumber(10),
      duration: YEAR,
      annualInterestBPS: 2000,
    };
    const params2 = { ...params1, valuation: getBigNumber(25) };

    before(async () => {
      // Alice requests a loan of 10 guineas against "AliceOne":
      pair = await deployPair();
      swapper = await deployContract("NFTBuyerSellerMock", bentoBox.address, apesMarket.address);

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      // Alice requests two loans
      await pair.connect(alice).requestLoan(apeIds.aliceOne, params1, alice.address, false);
      await pair.connect(alice).requestLoan(apeIds.aliceTwo, params2, alice.address, false);

      // Bob issues the loans
      await pair.connect(bob).lend(apeIds.aliceOne, params1, false);
      await pair.connect(bob).lend(apeIds.aliceTwo, params2, false);

      // Alice donates all her money to Carol
      await bentoBox
        .connect(alice)
        .transfer(guineas.address, alice.address, carol.address, await bentoBox.balanceOf(guineas.address, alice.address));
      await guineas.connect(alice).transfer(carol.address, await guineas.balanceOf(alice.address));

      // Carol uses some of it to fund the apes market
      await guineas.connect(carol).approve(apesMarket.address, MaxUint256);
      await apesMarket.connect(carol).fund(getBigNumber(100));
    });

    it("Should allow flash repayments via cook()", async () => {
      const getBalances = async () => ({
        alice: await guineas.balanceOf(alice.address),
        aliceBento: await bentoBox.balanceOf(guineas.address, alice.address),

        pairBento: await bentoBox.balanceOf(guineas.address, pair.address),
        pairFees: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      expect(t0.alice).to.equal(0);
      expect(t0.aliceBento).to.equal(0);

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // We're just repaying one loan in this test.

      // 1. Repay, send to marketplace to skim. Also, set "skim = true" so that
      //    the actual payment will be skimmed later.
      //    This sets both slots of `result`, to [<amount in shares>, <amount>].
      actions.push(ACTION_REPAY);
      values.push(0);
      datas.push(encodeParameters(["uint256", "address", "bool"], [apeIds.aliceOne, apesMarket.address, true]));

      // 2. Sell the NFT, by skimming.
      //    Our mock "market" happens to require a hardcoded amount, because
      //    `cook()` is not flexible enough to pass the amount needed in the
      //    appropriate parameter position.
      //    This will not always be the case, but we have to assume that it is
      //    in general, so we have not "fixed" the mock contract to make it
      //    work. That way, this/these test case(s) paint a more fair picture
      //    of what using `cook()` for flash loans is like.
      const salePrice = getBigNumber(11); // enough to cover the loan
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [
            apesMarket.address,
            apesMarket.interface.encodeFunctionData("sell", [apeIds.aliceOne, salePrice, alice.address, true]),
            false,
            false,
            0,
          ]
        )
      );

      // 3. ACTION_REPAY told us how much it was; transfer that amount to the
      //    BentoBox. `result[0]` has the amount in shares:
      actions.push(ACTION_BENTO_DEPOSIT);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, pair.address, 0, USE_VALUE1]));

      // That's it; `cook()` will now skim the balance at the end:
      await expect(pair.connect(alice).cook(actions, values, datas)).to.emit(pair, "LogRepay");

      const t1 = await getBalances();

      // Alice should have a little left:
    });

    it("Should allow multiple flash repayments via cook()", async () => {
      const getBalances = async () => ({
        alice: await guineas.balanceOf(alice.address),
        aliceBento: await bentoBox.balanceOf(guineas.address, alice.address),

        pairBento: await bentoBox.balanceOf(guineas.address, pair.address),
        pairFees: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      expect(t0.alice).to.equal(0);
      expect(t0.aliceBento).to.equal(0);

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // (See the single repayment test for more function-specific comments)
      // What we're doing here is:
      // - Flash repay first loan, send token to "market" contract
      // - Sell the first token in the market (for "enough"; can't get exact)
      // - Flash repay second loan, send token to "market" contract
      // - Sell the second token in the market (again, enough)h
      // - Pay enough for both loans at once
      //
      // This makes it even harder to deposit only EXACTLY what was required,
      // unless we're willing to needlessly do two Bento transfers. (The repay
      // logic populates fields with shares or amount required, but we have
      // no way to add them up).
      // Since we're testing the double recursion, we leave that aspect as is
      // and just send "definitely enough to cover" if we want it to succeed.
      actions.push(ACTION_REPAY);
      values.push(0);
      datas.push(encodeParameters(["uint256", "address", "bool"], [apeIds.aliceOne, apesMarket.address, true]));

      const salePrice1 = getBigNumber(11); // enough to cover the loan
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [
            apesMarket.address,
            apesMarket.interface.encodeFunctionData("sell", [apeIds.aliceOne, salePrice1, alice.address, true]),
            false,
            false,
            0,
          ]
        )
      );

      actions.push(ACTION_REPAY);
      values.push(0);
      datas.push(encodeParameters(["uint256", "address", "bool"], [apeIds.aliceTwo, apesMarket.address, true]));

      const salePrice2 = getBigNumber(26); // enough to cover the loan
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [
            apesMarket.address,
            apesMarket.interface.encodeFunctionData("sell", [apeIds.aliceTwo, salePrice2, alice.address, true]),
            false,
            false,
            0,
          ]
        )
      );

      // 3. ACTION_REPAY told us how much it was; transfer that amount to the
      //    BentoBox. `result[0]` has the amount in shares:
      actions.push(ACTION_BENTO_DEPOSIT);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, pair.address, salePrice1.add(salePrice2), 0]));

      // That's it; `cook()` will now skim the balance at the end:
      await expect(pair.connect(alice).cook(actions, values, datas)).to.emit(pair, "LogRepay").to.emit(pair, "LogRepay");
    });

    it("Should refuse flash repayments via cook() - not enough", async () => {
      const getBalances = async () => ({
        alice: await guineas.balanceOf(alice.address),
        aliceBento: await bentoBox.balanceOf(guineas.address, alice.address),

        pairBento: await bentoBox.balanceOf(guineas.address, pair.address),
        pairFees: await pair.feesEarnedShare(),
      });
      const t0 = await getBalances();

      expect(t0.alice).to.equal(0);
      expect(t0.aliceBento).to.equal(0);

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // We're just repaying one loan in this test.

      // 1. Repay, send to marketplace to skim. Also, set "skim = true" so that
      //    the actual payment will be skimmed later.
      //    This sets both slots of `result`, to [<amount in shares>, <amount>].
      actions.push(ACTION_REPAY);
      values.push(0);
      datas.push(encodeParameters(["uint256", "address", "bool"], [apeIds.aliceOne, apesMarket.address, true]));

      // 2. Sell the NFT, by skimming.
      //    Our mock "market" happens to require a hardcoded amount, because
      //    `cook()` is not flexible enough to pass the amount needed in the
      //    appropriate parameter position.
      //    This will not always be the case, but we have to assume that it is
      //    in general, so we have not "fixed" the mock contract to make it
      //    work. That way, this/these test case(s) paint a more fair picture
      //    of what using `cook()` for flash loans is like.
      const salePrice = getBigNumber(11); // enough to cover the loan
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [
            apesMarket.address,
            apesMarket.interface.encodeFunctionData("sell", [apeIds.aliceOne, salePrice, alice.address, true]),
            false,
            false,
            0,
          ]
        )
      );

      // 3. Skip sending the money

      // That's it; `cook()` will now skim the balance at the end:
      await expect(pair.connect(alice).cook(actions, values, datas)).to.be.revertedWith("NFTPair: skim too much");
    });

    it("Should allow flash repayments with swapper - good price", async () => {
      await expect(pair.connect(alice).flashRepay(apeIds.aliceOne, params1.valuation.mul(2), swapper.address, alice.address, false)).to.emit(
        pair,
        "LogRepay"
      );
    });

    it("Should refuse flash repayments with swapper - not enough", async () => {
      await expect(
        pair.connect(alice).flashRepay(
          apeIds.aliceOne,
          params1.valuation, // Will not cover interest
          swapper.address,
          alice.address,
          false
        )
      ).to.be.revertedWith("BoringMath: Underflow");
    });
  });

  describeSnapshot("Flash Borrow", () => {
    let pair: NFTPair;
    let swapper: NFTBuyerSellerMock;

    const params1 = {
      valuation: getBigNumber(10),
      duration: YEAR,
      annualInterestBPS: 2000,
    };
    const params2 = { ...params1, valuation: getBigNumber(25) };

    let aliceSig: ISignature;
    let bobSig: ISignature;

    before(async () => {
      // Alice requests a loan of 10 guineas against "AliceOne":
      pair = await deployPair();
      swapper = await deployContract("NFTBuyerSellerMock", bentoBox.address, apesMarket.address);

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      const { timestamp } = await ethers.provider.getBlock("latest");
      const deadline = timestamp + 3600;

      // Alice signs a lending request against CarolOne
      aliceSig = await signLendRequest(pair, alice, {
        tokenId: apeIds.carolOne,
        anyTokenId: false,
        ...params1,
        deadline,
      });
      // Bob signs a lending request against any ape
      bobSig = await signLendRequest(pair, bob, {
        tokenId: 0,
        anyTokenId: true,
        ...params2,
        deadline,
      });

      // Stock the apes market:
      for (const signer of [alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(apesMarket.address, true);
      }
      await apesMarket.connect(alice).stock(apeIds.aliceOne);
      await apesMarket.connect(bob).stock(apeIds.bobOne);
      await apesMarket.connect(carol).stock(apeIds.carolOne);
    });

    it("Should allow flash borrowing (LTV < 1)", async () => {
      // Bob knows about Alice's commitment to lend 10 guineas against ape
      // "carolOne". Assuming it costs 13 guineas, he needs to put up another
      // 3, plus the opening fee on borrowing the 10 -- 0.1 guinea:
      const price = getBigNumber(13);
      // `toShare` rounding up:
      const priceShare = price.mul(9).add(19).div(20); // rounding up
      const totalShare = params1.valuation.mul(9).div(20); // rounding down
      const openFeeShare = totalShare.mul(1).div(100);
      const protocolFeeShare = openFeeShare.div(10);
      const lenderOutShare = totalShare.sub(openFeeShare).add(protocolFeeShare);
      const borrowerShare = totalShare.sub(openFeeShare);
      const shortage = priceShare.sub(borrowerShare);
      await expect(
        pair
          .connect(bob)
          .flashRequestAndBorrow(apeIds.carolOne, alice.address, bob.address, params1, false, aliceSig, price, swapper.address, false)
      )
        .to.emit(pair, "LogLend")
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, bob.address, pair.address, shortage)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pair.address, lenderOutShare)
        .to.emit(guineas, "Transfer")
        .withArgs(bentoBox.address, swapper.address, price)
        .to.emit(guineas, "Transfer")
        .withArgs(swapper.address, apesMarket.address, price)
        .to.emit(apes, "Transfer")
        .withArgs(apesMarket.address, pair.address, apeIds.carolOne);
    });

    it("Should allow flash borrowing (LTV > 1)", async () => {
      // Bob can buy "CarolOne" at a price below what he can borrow against it.
      // As such he can get paid to take out the loab:
      // "carolOne". Assuming it costs 13 guineas, he needs to put up another
      // 3, plus the opening fee on borrowing the 10 -- 0.1 guinea:
      const price = getBigNumber(7);
      // `toShare` rounding up:
      const priceShare = price.mul(9).add(19).div(20); // rounding up
      const totalShare = params1.valuation.mul(9).div(20); // rounding down
      const openFeeShare = totalShare.mul(1).div(100);
      const protocolFeeShare = openFeeShare.div(10);
      const lenderOutShare = totalShare.sub(openFeeShare).add(protocolFeeShare);
      const borrowerShare = totalShare.sub(openFeeShare);
      const excess = borrowerShare.sub(priceShare);
      await expect(
        pair
          .connect(bob)
          .flashRequestAndBorrow(apeIds.carolOne, alice.address, bob.address, params1, false, aliceSig, price, swapper.address, false)
      )
        .to.emit(pair, "LogLend")
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, bob.address, excess)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pair.address, lenderOutShare)
        .to.emit(guineas, "Transfer")
        .withArgs(bentoBox.address, swapper.address, price)
        .to.emit(guineas, "Transfer")
        .withArgs(swapper.address, apesMarket.address, price)
        .to.emit(apes, "Transfer")
        .withArgs(apesMarket.address, pair.address, apeIds.carolOne);
    });

    it("Should allow flash borrowing (LTV = 1)", async () => {
      const getBalances = async () => ({
        bob: await guineas.balanceOf(bob.address),
        bobBento: await bentoBox.balanceOf(guineas.address, bob.address),

        deployer: await guineas.balanceOf(deployer.address),
        deployerBento: await bentoBox.balanceOf(guineas.address, deployer.address),
      });
      const t0 = await getBalances();

      // Bob can buy "CarolOne" at a price that happens to be exactly what he
      // gets when taking out a loan -- meaning the principal less open fee.
      // Actually, given the signature, anyone can make the call; we'll let the
      // deployer do it. Bob still gets the loan:
      const totalShare = params1.valuation.mul(9).div(20); // rounding down
      const openFeeShare = totalShare.mul(1).div(100);
      const protocolFeeShare = openFeeShare.div(10);
      const lenderOutShare = totalShare.sub(openFeeShare).add(protocolFeeShare);
      const borrowerShare = totalShare.sub(openFeeShare);

      const priceShare = borrowerShare;
      // The following mght be off a little, if the amount/share ratio is not
      // hardcoded to 20/9:
      const price = priceShare.mul(20).div(9);

      await expect(
        pair
          .connect(deployer)
          .flashRequestAndBorrow(apeIds.carolOne, alice.address, bob.address, params1, false, aliceSig, price, swapper.address, false)
      )
        .to.emit(pair, "LogLend")
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pair.address, lenderOutShare)
        .to.emit(guineas, "Transfer")
        .withArgs(bentoBox.address, swapper.address, price)
        .to.emit(guineas, "Transfer")
        .withArgs(swapper.address, apesMarket.address, price)
        .to.emit(apes, "Transfer")
        .withArgs(apesMarket.address, pair.address, apeIds.carolOne);

      const t1 = await getBalances();

      expect(t1.deployer.sub(t0.deployer)).to.equal(0);
      expect(t1.deployerBento.sub(t0.deployerBento)).to.equal(0);
      expect(t1.bob.sub(t0.bob)).to.equal(0);
      expect(t1.bobBento.sub(t0.bobBento)).to.equal(0);
    });

    it("Should allow flash borrowing (LTV < 1, cook)", async () => {
      // Bob knows about Alice's commitment to lend 10 guineas against ape
      // "carolOne". Assuming it costs 13 guineas, he needs to put up another
      // 3, plus the opening fee on borrowing the 10 -- 0.1 guinea:
      const price = getBigNumber(13);
      // `toShare` rounding up:
      const priceShare = price.mul(9).add(19).div(20); // rounding up
      const totalShare = params1.valuation.mul(9).div(20); // rounding down
      const openFeeShare = totalShare.mul(1).div(100);
      const protocolFeeShare = openFeeShare.div(10);
      const lenderOutShare = totalShare.sub(openFeeShare).add(protocolFeeShare);
      const borrowerShare = totalShare.sub(openFeeShare);
      const shortage = priceShare.sub(borrowerShare);

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // Bob starts the test with JUST enough guineas to make up the shortage:
      await bentoBox
        .connect(bob)
        .transfer(guineas.address, bob.address, deployer.address, (await bentoBox.balanceOf(guineas.address, bob.address)).sub(shortage));

      // Bob requests a loan agains CarolOne, uses that loan to buy help buy it
      // at the market, then posts the purchased token as collateral.

      // 1. Take out the loan
      actions.push(ACTION_REQUEST_AND_BORROW);
      values.push(0);
      datas.push(
        encodeParameters(
          [
            "uint256",
            "address",
            "address",
            "tuple(uint128 valuation, uint64 duration, uint16 annualInterestBPS)",
            "bool",
            "bool",
            "tuple(uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
          ],
          [
            apeIds.carolOne,
            alice.address,
            bob.address,
            params1,
            true, // (skimCOllateral)
            false,
            aliceSig,
          ]
        )
      );

      // 2. Send funds to the apes market. Since Bob now has the loan in his
      //    BentoBox balance, this will succeed:
      actions.push(ACTION_BENTO_WITHDRAW);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, apesMarket.address, price, 0]));

      // 3. Buy the token at the apes market, skimming the funds and sending
      //    the token to the pair:
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [apesMarket.address, apesMarket.interface.encodeFunctionData("buy", [apeIds.carolOne, price, pair.address, true]), false, false, 0]
        )
      );

      // .. that's it; having indicated in step 1 that we are skimming the
      // token, `cook()` will use it as collateral in the final step.
      await expect(pair.connect(bob).cook(actions, values, datas))
        .to.emit(pair, "LogLend")
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, bob.address, borrowerShare)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pair.address, lenderOutShare)
        .to.emit(guineas, "Transfer")
        .withArgs(bentoBox.address, apesMarket.address, price)
        .to.emit(apes, "Transfer")
        .withArgs(apesMarket.address, pair.address, apeIds.carolOne);
    });

    it("Should allow flash borrowing (LTV > 1, cook)", async () => {
      // Alice borrows 25 guineas from Bob, using his "any token" signature,
      // against "carolOne". Assuming it costs 20 guineas, Alice can start with
      // no guineas at all, and end up with about 4.75 guineas -- the 5 extra,
      // minus the 0.25 open fee on the loan -- along with the option to repay
      // the loan.
      const price = getBigNumber(20);
      const priceShare = price.mul(9).add(19).div(20); // rounding up
      const totalShare = params2.valuation.mul(9).div(20); // rounding down
      const openFeeShare = totalShare.mul(1).div(100);
      const protocolFeeShare = openFeeShare.div(10);
      const lenderOutShare = totalShare.sub(openFeeShare).add(protocolFeeShare);
      const borrowerShare = totalShare.sub(openFeeShare);
      const excessShare = borrowerShare.sub(priceShare);

      expect(excessShare).to.be.lt(getBigNumber(5).mul(9).div(20));
      expect(excessShare).to.be.gte(getBigNumber(475).div(100).mul(9).div(20));

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // Alice starts the test with an empty BentoBox balance:
      await bentoBox
        .connect(alice)
        .transfer(guineas.address, alice.address, deployer.address, await bentoBox.balanceOf(guineas.address, alice.address));

      // Alice requests a loan agains CarolOne, uses some of the loan to buy it
      // at the market, then posts the purchased token as collateral.

      // 1. Take out the loan
      actions.push(ACTION_REQUEST_AND_BORROW);
      values.push(0);
      datas.push(
        encodeParameters(
          [
            "uint256",
            "address",
            "address",
            "tuple(uint128 valuation, uint64 duration, uint16 annualInterestBPS)",
            "bool",
            "bool",
            "tuple(uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
          ],
          [
            apeIds.carolOne,
            bob.address,
            alice.address,
            params2,
            true, // (skimCOllateral)
            true, // (anyTokenId in sig)
            bobSig,
          ]
        )
      );

      // 2. Send funds to the apes market. Succeeds, since Alice got the loan:
      actions.push(ACTION_BENTO_WITHDRAW);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, apesMarket.address, price, 0]));

      // 3. Buy the token at the apes market, skimming the funds and sending
      //    the token to the pair:
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [apesMarket.address, apesMarket.interface.encodeFunctionData("buy", [apeIds.carolOne, price, pair.address, true]), false, false, 0]
        )
      );

      // .. that's it; having indicated in step 1 that we are skimming the
      // token, `cook()` will use it as collateral in the final step.
      await expect(pair.connect(alice).cook(actions, values, datas))
        .to.emit(pair, "LogLend")
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, alice.address, borrowerShare)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, bob.address, pair.address, lenderOutShare)
        .to.emit(guineas, "Transfer")
        .withArgs(bentoBox.address, apesMarket.address, price)
        .to.emit(apes, "Transfer")
        .withArgs(apesMarket.address, pair.address, apeIds.carolOne);

      expect(await bentoBox.balanceOf(guineas.address, alice.address)).to.equal(excessShare);
    });

    it("Should reject if the collateral is not posted (cook)", async () => {
      // Uses the successful case of 25 against Bob's "any" signature, but
      // fails to send the token to the contract
      const price = getBigNumber(20);

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // Alice starts the test with an empty BentoBox balance:
      await bentoBox
        .connect(alice)
        .transfer(guineas.address, alice.address, deployer.address, await bentoBox.balanceOf(guineas.address, alice.address));

      // Alice requests a loan agains CarolOne, uses some of the loan to buy it
      // at the market. The collateral stays with Alice this time:

      // 1. Take out the loan
      actions.push(ACTION_REQUEST_AND_BORROW);
      values.push(0);
      datas.push(
        encodeParameters(
          [
            "uint256",
            "address",
            "address",
            "tuple(uint128 valuation, uint64 duration, uint16 annualInterestBPS)",
            "bool",
            "bool",
            "tuple(uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
          ],
          [
            apeIds.carolOne,
            bob.address,
            alice.address,
            params2,
            true, // (skimCOllateral)
            true, // (anyTokenId in sig)
            bobSig,
          ]
        )
      );

      // 2. Send funds to the apes market. Succeeds, since Alice got the loan:
      actions.push(ACTION_BENTO_WITHDRAW);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, apesMarket.address, price, 0]));

      // 3. Buy the token at the apes market, skimming the funds and sending
      //    the token to the pair:
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [
            apesMarket.address,
            apesMarket.interface.encodeFunctionData("buy", [
              apeIds.carolOne,
              price,
              alice.address, // not pair.address
              true,
            ]),
            false,
            false,
            0,
          ]
        )
      );

      // .. that's it; having indicated in step 1 that we are skimming the
      // token, `cook()` will use it as collateral in the final step.
      await expect(pair.connect(alice).cook(actions, values, datas)).to.be.revertedWith("NFTPair: skim failed");
    });

    it("Should allow flash borrowing (LTV > 1, cook, no skim)", async () => {
      // Skimming is more efficient, but if Alice has approved the contract
      // then the collateral can be taken from her address instead.
      // This is the same as the "reject if collateral not posted" scenario,
      // where Alice ends up with the collateral, except that skimming is not
      // used. As a last step, the pair takes the collateral from Alice:
      const price = getBigNumber(20);
      const priceShare = price.mul(9).add(19).div(20); // rounding up
      const totalShare = params2.valuation.mul(9).div(20); // rounding down
      const openFeeShare = totalShare.mul(1).div(100);
      const protocolFeeShare = openFeeShare.div(10);
      const lenderOutShare = totalShare.sub(openFeeShare).add(protocolFeeShare);
      const borrowerShare = totalShare.sub(openFeeShare);
      const excessShare = borrowerShare.sub(priceShare);

      expect(excessShare).to.be.lt(getBigNumber(5).mul(9).div(20));
      expect(excessShare).to.be.gte(getBigNumber(475).div(100).mul(9).div(20));

      const actions: number[] = [];
      const values: any[] = [];
      const datas: any[] = [];

      // Alice starts the test with an empty BentoBox balance:
      await bentoBox
        .connect(alice)
        .transfer(guineas.address, alice.address, deployer.address, await bentoBox.balanceOf(guineas.address, alice.address));

      // Alice requests a loan agains CarolOne, uses some of the loan to buy it
      // at the market, then posts the purchased token as collateral.

      // 1. Take out the loan
      actions.push(ACTION_REQUEST_AND_BORROW);
      values.push(0);
      datas.push(
        encodeParameters(
          [
            "uint256",
            "address",
            "address",
            "tuple(uint128 valuation, uint64 duration, uint16 annualInterestBPS)",
            "bool",
            "bool",
            "tuple(uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
          ],
          [
            apeIds.carolOne,
            bob.address,
            alice.address,
            params2,
            false, // (skimCOllateral)
            true, // (anyTokenId in sig)
            bobSig,
          ]
        )
      );

      // 2. Send funds to the apes market. Succeeds, since Alice got the loan:
      actions.push(ACTION_BENTO_WITHDRAW);
      values.push(0);
      datas.push(encodeParameters(["address", "address", "int256", "int256"], [guineas.address, apesMarket.address, price, 0]));

      // 3. Buy the token at the apes market, skimming the funds and sending
      //    the token to the pair:
      actions.push(ACTION_CALL);
      values.push(0);
      datas.push(
        encodeParameters(
          ["address", "bytes", "bool", "bool", "uint8"],
          [apesMarket.address, apesMarket.interface.encodeFunctionData("buy", [apeIds.carolOne, price, alice.address, true]), false, false, 0]
        )
      );

      // .. that's it: the contract will take the collateral from Alice, who
      // got it from the apes market.
      await expect(pair.connect(alice).cook(actions, values, datas))
        .to.emit(pair, "LogLend")
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, alice.address, borrowerShare)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, bob.address, pair.address, lenderOutShare)
        .to.emit(guineas, "Transfer")
        .withArgs(bentoBox.address, apesMarket.address, price)
        .to.emit(apes, "Transfer")
        .withArgs(apesMarket.address, alice.address, apeIds.carolOne)
        .to.emit(apes, "Transfer")
        .withArgs(alice.address, pair.address, apeIds.carolOne);

      expect(await bentoBox.balanceOf(guineas.address, alice.address)).to.equal(excessShare);
    });
  });

  describeSnapshot("Lending Club", () => {
    let pair: NFTPair;
    let lendingClub: LendingClubMock;
    let emptyLendingClub: LendingClubMock;

    const nextWeek = Math.floor(new Date().getTime() / 1000) + 86400 * 7;

    before(async () => {
      pair = await deployPair();
      lendingClub = await deployContract("LendingClubMock", pair.address, bob.address);
      await lendingClub.init();
      emptyLendingClub = await deployContract("LendingClubMock", AddressZero, AddressZero);

      for (const signer of [alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pair.address, true);
      }

      // Bob deposits 10 guineas into the lending "club" that he is the sole
      // investor of.
      await bentoBox.connect(bob).deposit(guineas.address, bob.address, lendingClub.address, getBigNumber(10), 0);
    });

    const borrow = (
      borrower: SignerWithAddress,
      club: LendingClubMock,
      tokenId: BigNumberish,
      params: ILoanParams,
      // Defaults to "next week'
      deadline: BigNumberish = Math.floor(new Date().getTime() / 1000) + 86400 * 7
    ) => pair.connect(borrower).requestAndBorrow(tokenId, club.address, borrower.address, params, false, false, zeroSign(deadline));

    it("Should allow LendingClubs to approve or reject loans", async () => {
      // Mock implementation detail: tokenId has to be even
      expect(getBigNumber(apeIds.aliceOne, 0).mod(2)).to.equal(0);

      const valuation = getBigNumber(1).add(apeIds.aliceOne);
      const duration = 7 * DAY;
      const annualInterestBPS = 20_000;

      await expect(
        borrow(alice, emptyLendingClub, apeIds.aliceOne, {
          valuation,
          duration,
          annualInterestBPS,
        })
      ).to.be.revertedWith("NFTPair: LendingClub does not like you");

      await expect(
        borrow(alice, lendingClub, apeIds.aliceOne, {
          valuation,
          duration,
          annualInterestBPS,
        })
      ).to.emit(pair, "LogLend");

      expect(getBigNumber(apeIds.aliceTwo, 0).mod(2)).to.equal(1);
      await expect(
        borrow(alice, lendingClub, apeIds.aliceTwo, {
          valuation,
          duration,
          annualInterestBPS,
        })
      ).to.be.revertedWith("NFTPair: LendingClub does not like you");
    });
  });
});
