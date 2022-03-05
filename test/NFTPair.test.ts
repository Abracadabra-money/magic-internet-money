import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumber, BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";

import { advanceNextTime, duration, encodeParameters, getBigNumber, impersonate } from "../utilities";
import { BentoBoxMock, ERC20Mock, ERC721Mock, WETH9Mock, NFTPair } from "../typechain";
import { describeSnapshot } from "./helpers";
import { Cook, encodeLoanParamsNFT } from "./PrivatePool";

const LoanStatus = {
  INITIAL: 0,
  REQUESTED: 1,
  OUTSTANDING: 2,
};

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
  expiration: number;
  annualInterestBPS: number;
}
interface IPartialLoanParams {
  valuation?: BigNumber;
  expiration?: number;
  annualInterestBPS?: number;
}

const { formatUnits } = ethers.utils;
const { MaxUint256, AddressZero, HashZero } = ethers.constants;

const nextYear = Math.floor(new Date().getTime() / 1000) + 86400 * 365;
const nextDecade = Math.floor(new Date().getTime() / 1000) + 86400 * 365 * 10;

describe("NFT Pair", async () => {
  let apes: ERC721Mock;
  let guineas: ERC20Mock;
  let bentoBox: BentoBoxMock;
  let masterContract: NFTPair;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

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
      expiration: nextYear,
      openFeeBPS: 1000,
      annualInterestBPS: 2000,
      ...params,
    });

  // Specific to the mock implementation..
  const mintApe = async (ownerAddress) => {
    const id = await apes.totalSupply();
    await apes.mint(ownerAddress);
    return id;
  };

  before(async () => {
    const weth = await deployContract("WETH9Mock");
    bentoBox = await deployContract("BentoBoxMock", weth.address);
    masterContract = await deployContract("NFTPair", bentoBox.address);
    await bentoBox.whitelistMasterContract(masterContract.address, true);
    apes = await deployContract("ERC721Mock");
    guineas = await deployContract("ERC20Mock", getBigNumber(1_000_000));

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
        expiration: tomorrow,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, false))
        .to.emit(apes, "Transfer")
        .withArgs(alice.address, pair.address, apeIds.aliceOne)
        .to.emit(pair, "LogRequestLoan")
        .withArgs(alice.address, apeIds.aliceOne, params.valuation, params.expiration, params.annualInterestBPS);
    });

    it("Should let anyone with an NFT request a loan (skim)", async () => {
      // The intended use case of skimming is one transaction; this is not that
      // situation. But since we are the only one interacting with the contract
      // the logic still works:
      const params = {
        valuation: getBigNumber(10),
        expiration: tomorrow,
        annualInterestBPS: 2000,
      };
      await apes.connect(alice).transferFrom(alice.address, pair.address, apeIds.aliceOne);
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, true)).to.emit(pair, "LogRequestLoan");
    });

    it("Should fail to skim if token not present", async () => {
      const params = {
        valuation: getBigNumber(10),
        expiration: tomorrow,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, true)).to.be.revertedWith("NFTPair: skim failed");
    });

    it("Should refuse second request. Important if skimming!", async () => {
      const params = {
        valuation: getBigNumber(10),
        expiration: tomorrow,
        annualInterestBPS: 2000,
      };
      await expect(pair.connect(alice).requestLoan(apeIds.aliceOne, params, alice.address, false)).to.emit(pair, "LogRequestLoan");
      await expect(pair.connect(bob).requestLoan(apeIds.aliceOne, params, bob.address, true)).to.be.revertedWith("NFTPair: loan exists");
    });

    it("Should refuse loan requests without collateral", async () => {
      const params = {
        valuation: getBigNumber(10),
        expiration: tomorrow,
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
        expiration: tomorrow,
        annualInterestBPS: 2000,
      };

      await pair.connect(alice).requestLoan(apeIds.aliceOne, params1, alice.address, false);

      await pair.connect(bob).requestLoan(apeIds.bobOne, params1, bob.address, false);

      // One on behalf of someone else:
      await pair.connect(bob).requestLoan(apeIds.bobTwo, params1, carol.address, false);
    });

    it("Should allow anyone to lend", async () => {
      const totalShare = params1.valuation.mul(9).div(20);
      const openFeeShare = totalShare.div(100);
      const borrowShare = totalShare.sub(openFeeShare);

      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, false))
        .to.emit(pair, "LogLend")
        .withArgs(carol.address, apeIds.aliceOne)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, carol.address, pair.address, totalShare)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, alice.address, borrowShare);

      const loan = await pair.tokenLoan(apeIds.aliceOne);
      expect(loan.lender).to.equal(carol.address);
      expect(loan.borrower).to.equal(alice.address);
      expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
    });

    it("Should allow anyone to lend (skim)", async () => {
      const totalShare = params1.valuation.mul(9).div(20);

      await bentoBox.connect(carol).transfer(guineas.address, carol.address, pair.address, totalShare);
      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, true)).to.emit(pair, "LogLend");
    });

    it("Should revert if skim amount is too low", async () => {
      const totalShare = params1.valuation.mul(9).div(20);
      const totalShareM1 = totalShare.sub(1);

      await bentoBox.connect(carol).transfer(guineas.address, carol.address, pair.address, totalShareM1);
      await expect(pair.connect(carol).lend(apeIds.aliceOne, params1, true)).to.be.revertedWith("NFTPair: skim too much");
    });

    it("Should allow collateralizing a loan for someone else", async () => {
      const totalShare = params1.valuation.mul(9).div(20);
      const openFeeShare = totalShare.div(100);
      const borrowShare = totalShare.sub(openFeeShare);

      // Loan was requested by Bob, but money and option to repay go to Carol:
      await expect(pair.connect(alice).lend(apeIds.bobTwo, params1, false))
        .to.emit(pair, "LogLend")
        .withArgs(alice.address, apeIds.bobTwo)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pair.address, totalShare)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, pair.address, carol.address, borrowShare);

      const loan = await pair.tokenLoan(apeIds.bobTwo);
      expect(loan.lender).to.equal(alice.address);
      expect(loan.borrower).to.equal(carol.address);
    });

    it("Should lend if expiration is earlier than expected", async () => {
      const later = { ...params1, expiration: params1.expiration + 1 };
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
      const earlier = { ...params1, expiration: params1.expiration - 1 };
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
        expiration: tomorrow,
        annualInterestBPS: 2000,
      };

      await pair.connect(alice).requestLoan(apeIds.aliceOne, params1, alice.address, false);
    });

    it("Should allow borrowers any update to loan requests", async () => {
      const data = [params1];
      const recordUpdate = (k, f) => {
        const params = data[data.length - 1];
        data.push({ ...params, [k]: f(params[k]) });
      };
      recordUpdate("valuation", (v) => v.add(10));
      recordUpdate("valuation", (v) => v.sub(20_000_000));
      recordUpdate("annualInterestBPS", (i) => i - 400);
      recordUpdate("annualInterestBPS", (i) => i + 300);
      recordUpdate("expiration", (e) => e + 10_000);
      recordUpdate("expiration", (e) => e - 98_765);

      for (const params of data) {
        await expect(pair.connect(alice).updateLoanParams(apeIds.aliceOne, params))
          .to.emit(pair, "LogUpdateLoanParams")
          .withArgs(apeIds.aliceOne, params.valuation, params.expiration, params.annualInterestBPS);
      }
    });

    it("Should refuse updates to someone else's requests", async () => {
      const params2 = { ...params1, expiration: params1.expiration + 2 };
      await expect(pair.connect(bob).updateLoanParams(apeIds.aliceOne, params2)).to.be.revertedWith("NFTPair: not the borrower");
    });

    it("..even if you set the loan up for them", async () => {
      const params2 = { ...params1, expiration: params1.expiration + 2 };
      await pair.connect(bob).requestLoan(apeIds.bobOne, params1, alice.address, false);
      await expect(pair.connect(bob).updateLoanParams(apeIds.bobOne, params2)).to.be.revertedWith("NFTPair: not the borrower");
    });

    it("Should refuse updates to nonexisting loans", async () => {
      const params2 = { ...params1, expiration: params1.expiration + 2 };
      await expect(pair.connect(alice).updateLoanParams(apeIds.aliceTwo, params2)).to.be.revertedWith("NFTPair: no collateral");
    });

    it("Should refuse non-lender updates to outstanding loans", async () => {
      const params2 = { ...params1, expiration: params1.expiration - 2 };
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
      recordUpdate("expiration", (e) => e + 10_000);

      await pair.connect(carol).lend(apeIds.aliceOne, params1, false);

      for (const params of data) {
        await expect(pair.connect(carol).updateLoanParams(apeIds.aliceOne, params)).to.emit(pair, "LogUpdateLoanParams");
      }
    });

    it("Should refuse worse conditions from lender", async () => {
      const data = [];
      const recordUpdate = (k, f) => {
        data.push({ ...params1, [k]: f(params1[k]) });
      };
      recordUpdate("valuation", (v) => v.add(1));
      recordUpdate("annualInterestBPS", (i) => i + 1);
      recordUpdate("expiration", (e) => e - 1);

      await pair.connect(carol).lend(apeIds.aliceOne, params1, false);

      for (const params of data) {
        await expect(pair.connect(carol).updateLoanParams(apeIds.aliceOne, params)).to.be.revertedWith("NFTPair: worse params");
      }
    });
  });

  // describeSnapshot("Remove Collateral", () => {
  //   let pool: NFTPair;

  //   before(async () => {
  //     pool = await deployPair();
  //     for (const signer of [bob, carol]) {
  //       await apes.connect(signer).setApprovalForAll(pool.address, true);
  //     }
  //     const share = getBigNumber(450); // 1000 guineas
  //     await pool.connect(alice).addAsset(false, share);

  //     await addToken(pool, apeIds.bobOne, {
  //       valuation: getBigNumber(1, 8),
  //       expiration: nextYear,
  //       annualInterestBPS: 10000,
  //     });
  //     await pool.connect(bob).addCollateral(apeIds.bobOne, bob.address, false);

  //     await addToken(pool, apeIds.carolOne, {
  //       valuation: getBigNumber(1, 8),
  //       expiration: nextYear,
  //       annualInterestBPS: 10000,
  //     });
  //     await pool
  //       .connect(carol)
  //       .addCollateral(apeIds.carolOne, carol.address, false);
  //   });

  //   it("Should let depositors withdraw their unused collateral", async () => {
  //     await expect(
  //       pool.connect(bob).removeCollateral(apeIds.bobOne, carol.address)
  //     )
  //       .to.emit(pool, "LogRemoveCollateral")
  //       .withArgs(bob.address, carol.address, apeIds.bobOne)
  //       .to.emit(apes, "Transfer")
  //       .withArgs(pool.address, carol.address, apeIds.bobOne);

  //     const loanStatus = await pool.tokenLoan(apeIds.bobOne);
  //     expect(loanStatus.borrower).to.equal(AddressZero);
  //     expect(loanStatus.startTime).to.equal(0);
  //     expect(loanStatus.status).to.equal(LoanStatus.INITIAL);
  //   });

  //   it("Should not allow withdrawals if the collateral is in use", async () => {
  //     // The only legitimate reason to take used collateral is a "liquidation"
  //     // where the loan has expired. This is only available to the lender:
  //     const terms = await pool.tokenLoanParams(apeIds.bobOne);
  //     await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms);
  //     await expect(
  //       pool.connect(carol).removeCollateral(apeIds.carolOne, carol.address)
  //     ).to.be.revertedWith("NFTPair: not the lender");
  //   });

  //   it("Should not give out someone else's unused collateral", async () => {
  //     await expect(
  //       pool.connect(bob).removeCollateral(apeIds.carolOne, carol.address)
  //     ).to.be.revertedWith("NFTPair: not the borrower");
  //   });

  //   it("Should let only the lender seize expired collateral", async () => {
  //     const terms = await pool.tokenLoanParams(apeIds.bobOne);
  //     await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms);
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear]);

  //     await expect(
  //       pool.connect(bob).removeCollateral(apeIds.carolOne, bob.address)
  //     ).to.be.revertedWith("NFTPair: not the lender");

  //     // You cannot "seize" your own collateral either:
  //     await expect(
  //       pool.connect(carol).removeCollateral(apeIds.carolOne, carol.address)
  //     ).to.be.revertedWith("NFTPair: not the lender");

  //     await expect(
  //       pool.connect(alice).removeCollateral(apeIds.carolOne, alice.address)
  //     )
  //       .to.emit(pool, "LogRemoveCollateral")
  //       .withArgs(carol.address, alice.address, apeIds.carolOne)
  //       .to.emit(apes, "Transfer")
  //       .withArgs(pool.address, alice.address, apeIds.carolOne);
  //   });

  //   it("Should only allow seizing expired collateral", async () => {
  //     const terms = await pool.tokenLoanParams(apeIds.bobOne);
  //     await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms);
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear - 1]);

  //     await expect(
  //       pool.connect(alice).removeCollateral(apeIds.carolOne, alice.address)
  //     ).to.be.revertedWith("NFTPair: not expired");
  //   });

  //   it("Should only allow seizing collateral used for a loan", async () => {
  //     await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear]);

  //     await expect(
  //       pool.connect(alice).removeCollateral(apeIds.carolOne, alice.address)
  //     ).to.be.revertedWith("NFTPair: not the borrower");
  //   });
  // });

  // describeSnapshot("Repay", () => {
  //   let pool: NFTPair;
  //   let bobBorrowedAt: number;
  //   let carolBorrowedAt: number;

  //   before(async () => {
  //     pool = await deployPair();
  //     for (const signer of [bob, carol]) {
  //       await apes.connect(signer).setApprovalForAll(pool.address, true);
  //     }
  //     const share = getBigNumber(450); // 1000 guineas
  //     await pool.connect(alice).addAsset(false, share);

  //     // 30% interest
  //     await addToken(pool, apeIds.bobOne, {
  //       valuation: getBigNumber(1, 8),
  //       expiration: nextYear,
  //       annualInterestBPS: 3_000,
  //     });
  //     await pool.connect(bob).addCollateral(apeIds.bobOne, bob.address, false);
  //     const terms1 = await pool.tokenLoanParams(apeIds.bobOne);
  //     await pool.connect(bob).borrow(apeIds.bobOne, bob.address, terms1);
  //     bobBorrowedAt = (await ethers.provider.getBlock("latest")).timestamp;

  //     // 100% interest
  //     await addToken(pool, apeIds.carolOne, {
  //       valuation: getBigNumber(1, 18),
  //       expiration: nextDecade,
  //       annualInterestBPS: 10_000,
  //     });
  //     await pool
  //       .connect(carol)
  //       .addCollateral(apeIds.carolOne, carol.address, false);
  //     const terms2 = await pool.tokenLoanParams(apeIds.carolOne);
  //     await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms2);
  //     carolBorrowedAt = (await ethers.provider.getBlock("latest")).timestamp;
  //   });

  //   it("Should let borrowers repay debt", async () => {
  //     await advanceNextTime(123456);
  //   });
  // });
});
