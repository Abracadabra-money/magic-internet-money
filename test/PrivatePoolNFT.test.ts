import { ethers, network, deployments, getNamedAccounts, artifacts } from "hardhat";
import { expect } from "chai";
import { BigNumberish, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";

import { advanceNextTime, duration, encodeParameters, getBigNumber, impersonate } from "../utilities";
import { BentoBoxMock, ERC20Mock, ERC721Mock, WETH9Mock, PrivatePoolNFT } from "../typechain";
import { describeSnapshot } from "./helpers";
import { Cook, LoanStatus, encodeInitDataNFT, encodeLoanParamsNFT } from "./PrivatePool";

interface ILoanParams {
  valuation: BigNumberish;
  expiration: BigNumberish;
  openFeeBPS: BigNumberish;
  annualInterestBPS: BigNumberish;
  compoundInterestTerms: BigNumberish;
}
interface PartialLoanParams {
  valuation?: BigNumberish;
  expiration?: BigNumberish;
  openFeeBPS?: BigNumberish;
  annualInterestBPS?: BigNumberish;
  compoundInterestTerms?: BigNumberish;
}

const { formatUnits } = ethers.utils;
const { MaxUint256, AddressZero, HashZero } = ethers.constants;

const nextYear = Math.floor(new Date().getTime() / 1000) + 86400 * 365;

describe("Private Lending Pool", async () => {
  let apes: ERC721Mock;
  let guineas: ERC20Mock;
  let bentoBox: BentoBoxMock;
  let masterContract: PrivatePoolNFT;
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

  const deployPool = async (initSettings = {}) => {
    const fullSettings = {
      collateral: apes.address,
      asset: guineas.address,
      lender: alice.address,
      borrowers: [bob.address, carol.address],
      ...initSettings,
    };
    const deployTx = await bentoBox.deploy(masterContract.address, encodeInitDataNFT(fullSettings), false).then((tx) => tx.wait());
    for (const e of deployTx.events || []) {
      if (e.eventSignature == "LogDeploy(address,bytes,address)") {
        return ethers.getContractAt<PrivatePoolNFT>("PrivatePoolNFT", e.args?.cloneAddress);
      }
    }
    throw new Error("Deploy event not found"); // (For the typechecker..)
  };

  const addToken = (pool, tokenId, params: PartialLoanParams) =>
    pool.connect(alice).updateLoanParams(tokenId, {
      valuation: 0,
      expiration: nextYear,
      openFeeBPS: 1000,
      annualInterestBPS: 2000,
      compoundInterestTerms: 5,
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
    masterContract = await deployContract("PrivatePoolNFT", bentoBox.address);
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
    let pool: PrivatePoolNFT;
    let tomorrow: Number;

    before(async () => {
      tomorrow = Math.floor(new Date().getTime() / 1000) + 86400;

      pool = await deployPool({
        tokenIds: [apeIds.bobOne, apeIds.carolTwo],
        loanParams: [
          {
            valuation: getBigNumber(10),
            expiration: tomorrow,
            openFeeBPS: 1000,
            annualInterestBPS: 2000,
            compoundInterestTerms: 4,
          },
          {
            valuation: getBigNumber(20),
            expiration: tomorrow,
            openFeeBPS: 800,
            annualInterestBPS: 3000,
            compoundInterestTerms: 5,
          },
        ],
      });
    });

    it("Should deploy with expected parameters", async () => {
      expect(await pool.lender()).to.equal(alice.address);
      for (const { address } of [carol, bob]) {
        expect(await pool.approvedBorrowers(address)).to.equal(true);
      }
      expect(await pool.approvedBorrowers(alice.address)).to.equal(false);

      const paramsOne = await pool.tokenLoanParams(apeIds.bobOne);
      expect(paramsOne.valuation).to.equal(getBigNumber(10));
      expect(paramsOne.expiration).to.equal(tomorrow);
      expect(paramsOne.openFeeBPS).to.equal(1000);
      expect(paramsOne.annualInterestBPS).to.equal(2000);
      expect(paramsOne.compoundInterestTerms).to.equal(4);

      const notProvided = await pool.tokenLoanParams(apeIds.aliceOne);
      expect(notProvided.valuation).to.equal(0);
      expect(notProvided.expiration).to.equal(0);
      expect(notProvided.openFeeBPS).to.equal(0);
      expect(notProvided.annualInterestBPS).to.equal(0);
      expect(notProvided.compoundInterestTerms).to.equal(0);
    });

    it("Should reject bad settings", async () => {
      await expect(deployPool({ collateral: AddressZero })).to.be.revertedWith("PrivatePool: bad pair");

      await expect(
        deployPool({
          tokenIds: [apeIds.bobOne],
          loanParams: [
            {
              valuation: getBigNumber(20),
              expiration: tomorrow,
              openFeeBPS: 10001,
              annualInterestBPS: 3000,
              compoundInterestTerms: 5,
            },
          ],
        })
      ).to.be.revertedWith("PrivatePool: open fee");
    });

    it("Should refuse to initialize twice", async () => {
      await expect(pool.init(encodeInitDataNFT({}))).to.be.revertedWith("PrivatePool: already initialized");
    });
  });

  describeSnapshot("Add Asset", () => {
    let pool: PrivatePoolNFT;

    before(async () => {
      pool = await deployPool({});
    });

    it("Should let the lender add assets", async () => {
      const share = getBigNumber(450);
      await expect(pool.connect(alice).addAsset(false, share))
        .to.emit(pool, "LogAddAsset")
        .withArgs(alice.address, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, pool.address, share);

      const assetBalance = await pool.assetBalance();
      expect(assetBalance.reservesShare).to.equal(share);
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });

    it("Should let the lender add assets (skim)", async () => {
      // This is not a reasonable transaction..
      const share = getBigNumber(450);
      const [g, a, p] = [guineas, alice, pool].map((x) => x.address);

      await bentoBox.connect(alice).transfer(g, a, p, share);
      await expect(pool.connect(alice).addAsset(true, share)).to.emit(pool, "LogAddAsset").withArgs(bentoBox.address, share);

      const assetBalance = await pool.assetBalance();
      expect(assetBalance.reservesShare).to.equal(getBigNumber(450));
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });

    it("Should let the lender add assets (cook amount)", async () => {
      //                (   10^9  ) (   10^9  )
      const amount = 27_182_818_284_590_452_353n; // Does not divide 20 or 9

      // (Shares : Amount) in Bento is (9 : 20)
      // This is what the BentoBox gives us for our deposit; round down:
      const share = (amount * 9n) / 20n;

      const [g, a, p] = [guineas, alice, pool].map((x) => x.address);
      const actions = [Cook.ACTION_BENTO_DEPOSIT, Cook.ACTION_ADD_ASSET];
      const datas = [
        encodeParameters(["address", "address", "uint256", "uint256"], [g, a, amount, 0]),
        encodeParameters(["int256", "bool"], [share, false]),
      ];
      const values = [0, 0];

      // Make sure the existing Bento balance stays the same:
      const initialBentoBalance = await bentoBox.balanceOf(g, a);

      await expect(pool.connect(alice).cook(actions, values, datas))
        .to.emit(bentoBox, "LogDeposit")
        .withArgs(g, a, a, amount, share)
        .to.emit(pool, "LogAddAsset")
        .withArgs(a, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(g, a, p, share);

      expect(await bentoBox.balanceOf(g, a)).to.equal(initialBentoBalance);

      const assetBalance = await pool.assetBalance();
      expect(assetBalance.reservesShare).to.equal(share);
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });

    it("Should refuse to skim too much", async () => {
      const share = getBigNumber(123);
      const [g, a, p] = [guineas, alice, pool].map((x) => x.address);

      await bentoBox.connect(alice).transfer(g, a, p, share);
      await expect(pool.connect(alice).addAsset(true, share.add(1))).to.be.revertedWith("PrivatePool: skim too much");
    });

    it("Should let anyone add assets", async () => {
      const share = getBigNumber(450);
      await expect(pool.connect(bob).addAsset(false, share))
        .to.emit(pool, "LogAddAsset")
        .withArgs(bob.address, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, bob.address, pool.address, share);

      const share2 = 27_182_818_284_590_452_353n;
      await expect(pool.connect(carol).addAsset(false, share2))
        .to.emit(pool, "LogAddAsset")
        .withArgs(carol.address, share2)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, carol.address, pool.address, share2);

      const assetBalance = await pool.assetBalance();
      expect(assetBalance.reservesShare).to.equal(share.add(share2));
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });
  });

  describeSnapshot("Add Collateral", () => {
    let pool: PrivatePoolNFT;
    let tomorrow: Number;

    before(async () => {
      tomorrow = Math.floor(new Date().getTime() / 1000) + 86400;

      pool = await deployPool({
        tokenIds: [apeIds.aliceOne, apeIds.bobOne, apeIds.carolTwo],
        loanParams: [
          {
            valuation: getBigNumber(10),
            expiration: tomorrow,
            openFeeBPS: 1000,
            annualInterestBPS: 2000,
            compoundInterestTerms: 4,
          },
          {
            valuation: getBigNumber(10),
            expiration: tomorrow,
            openFeeBPS: 1000,
            annualInterestBPS: 2000,
            compoundInterestTerms: 4,
          },
          {
            valuation: getBigNumber(20),
            expiration: tomorrow,
            openFeeBPS: 800,
            annualInterestBPS: 3000,
            compoundInterestTerms: 5,
          },
        ],
      });

      for (const signer of [deployer, alice, bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pool.address, true);
      }
    });

    it("Should accept approved tokens for approved borrowers", async () => {
      const beforeStatus = await pool.tokenLoan(apeIds.bobOne);
      expect(beforeStatus.borrower).to.equal(AddressZero);
      expect(beforeStatus.startTime).to.equal(0);
      expect(beforeStatus.status).to.equal(LoanStatus.INITIAL);

      await expect(pool.connect(bob).addCollateral(apeIds.bobOne, bob.address, false))
        .to.emit(pool, "LogAddCollateral")
        .withArgs(bob.address, bob.address, apeIds.bobOne)
        .to.emit(apes, "Transfer")
        .withArgs(bob.address, pool.address, apeIds.bobOne);

      const afterStatus = await pool.tokenLoan(apeIds.bobOne);
      expect(afterStatus.borrower).to.equal(bob.address);
      expect(afterStatus.startTime).to.equal(0);
      expect(afterStatus.status).to.equal(LoanStatus.COLLATERAL_DEPOSITED);
    });

    it("Should let anyone deposit for an approved borrower", async () => {
      await apes.connect(bob).transferFrom(bob.address, deployer.address, apeIds.bobOne);

      await expect(pool.connect(deployer).addCollateral(apeIds.bobOne, bob.address, false))
        .to.emit(pool, "LogAddCollateral")
        .withArgs(deployer.address, bob.address, apeIds.bobOne)
        .to.emit(apes, "Transfer")
        .withArgs(deployer.address, pool.address, apeIds.bobOne);

      const afterStatus = await pool.tokenLoan(apeIds.bobOne);
      expect(afterStatus.borrower).to.equal(bob.address);
      expect(afterStatus.startTime).to.equal(0);
      expect(afterStatus.status).to.equal(LoanStatus.COLLATERAL_DEPOSITED);
    });

    it("Should refuse collateral for an unapproved borrower", async () => {
      await expect(pool.connect(bob).addCollateral(apeIds.bobOne, alice.address, false)).to.be.revertedWith("PrivatePool: unapproved borrower");
    });

    it("Should refuse unapproved tokens", async () => {
      await expect(pool.connect(bob).addCollateral(apeIds.bobTwo, bob.address, false)).to.be.revertedWith("PrivatePool: loan unavailable");
    });

    it("Should accept approved tokens (skim)", async () => {
      await apes.connect(alice).transferFrom(alice.address, pool.address, apeIds.aliceOne);

      await expect(pool.connect(bob).addCollateral(apeIds.aliceOne, bob.address, true))
        .to.emit(pool, "LogAddCollateral")
        .withArgs(pool.address, bob.address, apeIds.aliceOne);

      const afterStatus = await pool.tokenLoan(apeIds.aliceOne);
      expect(afterStatus.borrower).to.equal(bob.address);
      expect(afterStatus.startTime).to.equal(0);
      expect(afterStatus.status).to.equal(LoanStatus.COLLATERAL_DEPOSITED);
    });
  });

  describeSnapshot("Borrow", async () => {
    let pool: PrivatePoolNFT;

    before(async () => {
      pool = await deployPool();
      for (const signer of [bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pool.address, true);
      }
      const share = getBigNumber(450); // 1000 guineas
      await pool.connect(alice).addAsset(false, share);

      // Doubles as a test of setting the params the other way:
      await addToken(pool, apeIds.bobOne, {
        valuation: getBigNumber(1, 8),
        expiration: nextYear,
        annualInterestBPS: 10000,
      });
      await pool.connect(bob).addCollateral(apeIds.bobOne, bob.address, false);

      await addToken(pool, apeIds.carolOne, {
        valuation: getBigNumber(10),
        expiration: nextYear,
        annualInterestBPS: 3000,
        openFeeBPS: 500,
        compoundInterestTerms: 10,
      });
      await pool.connect(carol).addCollateral(apeIds.carolOne, carol.address, false);

      // Allowed as collateral but not provided:
      await addToken(pool, apeIds.carolTwo, {
        valuation: getBigNumber(10),
      });
    });

    it("Should allow approved borrowers to borrow", async () => {
      const [g, b, p] = [guineas, bob, pool].map((x) => x.address);

      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      const ts = await advanceNextTime(1);

      expect(terms.valuation).to.equal(getBigNumber(1, 8));
      const openFee = terms.valuation.mul(terms.openFeeBPS).div(10_000);
      const receivedShare = terms.valuation.sub(openFee).mul(9).div(20);
      const openFeeShare = openFee.mul(9).div(20);
      const protocolFeeShare = openFeeShare.div(10); // Fixed

      const t0 = {
        assetBalance: await pool.assetBalance(),
        loanStatus: await pool.tokenLoan(apeIds.bobOne),
      };

      expect(t0.loanStatus.borrower).to.equal(bob.address);
      expect(t0.loanStatus.startTime).to.equal(0);
      expect(t0.loanStatus.status).to.equal(LoanStatus.COLLATERAL_DEPOSITED);

      await expect(pool.connect(bob).borrow(apeIds.bobOne, bob.address, terms))
        .to.emit(pool, "LogBorrow")
        .withArgs(b, b, apeIds.bobOne)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(g, p, b, receivedShare);

      const t1 = {
        assetBalance: await pool.assetBalance(),
        loanStatus: await pool.tokenLoan(apeIds.bobOne),
      };

      expect(t1.loanStatus.borrower).to.equal(bob.address);
      expect(t1.loanStatus.startTime).to.equal(ts);
      expect(t1.loanStatus.status).to.equal(LoanStatus.TAKEN);

      expect(t1.assetBalance.feesEarnedShare).to.equal(t0.assetBalance.feesEarnedShare.add(protocolFeeShare));
      expect(t1.assetBalance.reservesShare).to.equal(t0.assetBalance.reservesShare.sub(receivedShare).sub(protocolFeeShare));
    });

    it("Should only lend to whoever supplied the collateral", async () => {
      // Havinng supplied the collateral counts as being an "approved borrower".
      // (This only matters if we actually add a way to change the whitelist).
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await expect(pool.connect(carol).borrow(apeIds.bobOne, carol.address, terms)).to.be.revertedWith("PrivatePool: no collateral");

      // Sending it to Bob won't help, he has to be the msg.sender:
      await expect(pool.connect(carol).borrow(apeIds.bobOne, bob.address, terms)).to.be.revertedWith("PrivatePool: no collateral");
    });

    it("Should not lend unless the collateral is deposited", async () => {
      const terms = await pool.tokenLoanParams(apeIds.carolTwo);
      await expect(pool.connect(carol).borrow(apeIds.carolTwo, carol.address, terms)).to.be.revertedWith("PrivatePool: no collateral");
    });

    it("Should not lend against the same collateral twice", async () => {
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await expect(pool.connect(bob).borrow(apeIds.bobOne, bob.address, terms)).to.emit(pool, "LogBorrow");
      await expect(pool.connect(bob).borrow(apeIds.bobOne, bob.address, terms)).to.be.revertedWith("PrivatePool: no collateral");
    });

    it("Should not lend if the loan is expired", async () => {
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear]);
      await expect(pool.connect(bob).borrow(apeIds.bobOne, bob.address, terms)).to.be.revertedWith("PrivatePool: expired");
    });

    it("Should allow loans at any time before expiration", async () => {
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear - 1]);
      await expect(pool.connect(bob).borrow(apeIds.bobOne, bob.address, terms)).to.emit(pool, "LogBorrow");
    });
  });

  describeSnapshot("Remove Collateral", () => {
    let pool: PrivatePoolNFT;

    before(async () => {
      pool = await deployPool();
      for (const signer of [bob, carol]) {
        await apes.connect(signer).setApprovalForAll(pool.address, true);
      }
      const share = getBigNumber(450); // 1000 guineas
      await pool.connect(alice).addAsset(false, share);

      await addToken(pool, apeIds.bobOne, {
        valuation: getBigNumber(1, 8),
        expiration: nextYear,
        annualInterestBPS: 10000,
      });
      await pool.connect(bob).addCollateral(apeIds.bobOne, bob.address, false);

      await addToken(pool, apeIds.carolOne, {
        valuation: getBigNumber(1, 8),
        expiration: nextYear,
        annualInterestBPS: 10000,
      });
      await pool.connect(carol).addCollateral(apeIds.carolOne, carol.address, false);
    });

    it("Should let depositors withdraw their unused collateral", async () => {
      await expect(pool.connect(bob).removeCollateral(apeIds.bobOne, carol.address))
        .to.emit(pool, "LogRemoveCollateral")
        .withArgs(bob.address, carol.address, apeIds.bobOne)
        .to.emit(apes, "Transfer")
        .withArgs(pool.address, carol.address, apeIds.bobOne);

      const loanStatus = await pool.tokenLoan(apeIds.bobOne);
      expect(loanStatus.borrower).to.equal(AddressZero);
      expect(loanStatus.startTime).to.equal(0);
      expect(loanStatus.status).to.equal(LoanStatus.INITIAL);
    });

    it("Should not allow withdrawals if the collateral is in use", async () => {
      // The only legitimate reason to take used collateral is a "liquidation"
      // where the loan has expired. This is only available to the lender:
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms);
      await expect(pool.connect(carol).removeCollateral(apeIds.carolOne, carol.address)).to.be.revertedWith("PrivatePool: not the lender");
    });

    it("Should not give out someone else's unused collateral", async () => {
      await expect(pool.connect(bob).removeCollateral(apeIds.carolOne, carol.address)).to.be.revertedWith("PrivatePool: not the borrower");
    });

    it("Should let only the lender seize expired collateral", async () => {
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms);
      await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear]);

      await expect(pool.connect(bob).removeCollateral(apeIds.carolOne, bob.address)).to.be.revertedWith("PrivatePool: not the lender");

      // You cannot "seize" your own collateral either:
      await expect(pool.connect(carol).removeCollateral(apeIds.carolOne, carol.address)).to.be.revertedWith("PrivatePool: not the lender");

      await expect(pool.connect(alice).removeCollateral(apeIds.carolOne, alice.address))
        .to.emit(pool, "LogRemoveCollateral")
        .withArgs(carol.address, alice.address, apeIds.carolOne)
        .to.emit(apes, "Transfer")
        .withArgs(pool.address, alice.address, apeIds.carolOne);
    });

    it("Should only allow seizing expired collateral", async () => {
      const terms = await pool.tokenLoanParams(apeIds.bobOne);
      await pool.connect(carol).borrow(apeIds.carolOne, carol.address, terms);
      await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear - 1]);

      await expect(pool.connect(alice).removeCollateral(apeIds.carolOne, alice.address)).to.be.revertedWith("PrivatePool: not expired");
    });

    it("Should only allow seizing collateral used for a loan", async () => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [nextYear]);

      await expect(pool.connect(alice).removeCollateral(apeIds.carolOne, alice.address)).to.be.revertedWith("PrivatePool: not the borrower");
    });
  });
});
