import {
  ethers,
  network,
  deployments,
  getNamedAccounts,
  artifacts,
} from "hardhat";
import { expect } from "chai";
import { BigNumberish, Signer } from "ethers";

import {
  advanceNextTime,
  duration,
  encodeParameters,
  getBigNumber,
  impersonate,
} from "../utilities";
import {
  BentoBoxMock,
  ERC20Mock,
  OracleMock,
  WETH9Mock,
  PrivatePool,
} from "../typechain";
import { encodeInitData } from "./PrivatePool";

const { formatUnits } = ethers.utils;
const { MaxUint256, AddressZero, HashZero } = ethers.constants;

const one = getBigNumber(1);

// Cook actions
const Cook = {
  ACTION_ADD_ASSET: 1,
  ACTION_REPAY: 2,
  ACTION_REMOVE_ASSET: 3,
  ACTION_REMOVE_COLLATERAL: 4,
  ACTION_BORROW: 5,
  ACTION_GET_REPAY_SHARE: 6,
  ACTION_GET_REPAY_PART: 7,
  ACTION_ACCRUE: 8,

  // Functions that don't need accrue to be called
  ACTION_ADD_COLLATERAL: 10,
  ACTION_UPDATE_EXCHANGE_RATE: 11,

  // Function on BentoBox
  ACTION_BENTO_DEPOSIT: 20,
  ACTION_BENTO_WITHDRAW: 21,
  ACTION_BENTO_TRANSFER: 22,
  ACTION_BENTO_TRANSFER_MULTIPLE: 23,
  ACTION_BENTO_SETAPPROVAL: 24,

  // Any external call (except to BentoBox)
  ACTION_CALL: 30,

  USE_VALUE1: -1,
  USE_VALUE2: -2,
};

const MainTestSettings = {
  // 7% annually -- precision is 18 digits:
  INTEREST_PER_SECOND: getBigNumber(7).div(100 * 3600 * 24 * 365),
  COLLATERALIZATION_RATE_BPS: 7500,
  LIQUIDATION_MULTIPLIER_BPS: 11200,
  BORROW_OPENING_FEE_BPS: 10,
};

describe("Private Lending Pool", async () => {
  let weth: WETH9Mock;
  let guineas: ERC20Mock;
  let bentoBox: BentoBoxMock;
  let oracle: OracleMock;
  let masterContract: PrivatePool;
  let mainPair: PrivatePool;
  let alice: Signer;
  let bob: Signer;
  let carol: Signer;

  // Inner snapshots.The "inner" state is whatever `before` in `proc` sets up.
  // Reverts to the "outer" state after.
  const describeSnapshot = (name, proc) =>
    describe(name, () => {
      let outerSnapshotId;
      before(async () => {
        outerSnapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      proc();

      let snapshotId = null;
      beforeEach(async () => {
        if (snapshotId) {
          await ethers.provider.send("evm_revert", [snapshotId]);
        }
        snapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      after(async () => {
        await ethers.provider.send("evm_revert", [outerSnapshotId]);
      });
    });

  const deployPair = async (initSettings) => {
    const deployTx = await bentoBox
      .deploy(masterContract.address, encodeInitData(initSettings), false)
      .then((tx) => tx.wait());
    const [deployEvent] = deployTx.events;
    expect(deployEvent.eventSignature).to.equal(
      "LogDeploy(address,bytes,address)"
    );
    const { cloneAddress } = deployEvent.args;
    return ethers.getContractAt<PrivatePool>("PrivatePool", cloneAddress);
  };

  const showBalances = async (accs = { alice, bob, carol }) => {
    for (const [name, acc] of Object.entries(accs)) {
      console.log(`\n---- ${name}:`);
      const ethBalance = await ethers.provider.getBalance(acc.address);
      console.log(`Ethereum: ${formatUnits(ethBalance)}\n`);
      for (const [token, contract] of [
        ["WETH", weth],
        ["Guineas", guineas],
      ]) {
        const balance = await contract.balanceOf(acc.address);
        const bentoShares = await bentoBox.balanceOf(
          contract.address,
          acc.address
        );
        const bentoBalance = await bentoBox.toAmount(
          contract.address,
          bentoShares,
          false
        );
        console.log(`${token}:            ${formatUnits(balance)}`);
        console.log(
          `${token} (BentoBox):`,
          `${formatUnits(bentoBalance)} (${formatUnits(bentoShares)} shares)\n`
        );
      }
    }
  };

  before(async () => {
    const WETH9Mock = await ethers.getContractFactory("WETH9Mock");
    weth = await WETH9Mock.deploy();

    const BentoBoxMock = await ethers.getContractFactory("BentoBoxMock");
    bentoBox = await BentoBoxMock.deploy(weth.address);

    const PrivatePool = await ethers.getContractFactory("PrivatePool");
    masterContract = await PrivatePool.deploy(bentoBox.address);
    await bentoBox.whitelistMasterContract(masterContract.address, true);

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    guineas = await ERC20Mock.deploy(getBigNumber(1_000_000));

    const OracleMock = await ethers.getContractFactory("OracleMock");
    oracle = await OracleMock.deploy();

    const addresses = await getNamedAccounts();
    alice = await ethers.getSigner(addresses.alice);
    bob = await ethers.getSigner(addresses.bob);
    carol = await ethers.getSigner(addresses.carol);

    const mc = masterContract.address;
    const hz = HashZero;
    for (const signer of [alice, bob, carol]) {
      const addr = signer.address;
      const bb = bentoBox.connect(signer);
      await bb.setMasterContractApproval(addr, mc, true, 0, hz, hz);

      await weth.connect(signer).deposit({ value: getBigNumber(1000) });
      await guineas.transfer(addr, getBigNumber(10_000));

      await weth.connect(signer).approve(bentoBox.address, MaxUint256);
      await bb.deposit(weth.address, addr, addr, getBigNumber(200), 0);

      await guineas.connect(signer).approve(bentoBox.address, MaxUint256);
      await bb.deposit(guineas.address, addr, addr, getBigNumber(3000), 0);
    }
    await guineas.approve(bentoBox.address, MaxUint256);
    await bentoBox.addProfit(guineas.address, getBigNumber(11000));

    await weth.approve(bentoBox.address, MaxUint256);
    await weth.deposit({ value: getBigNumber(100) });
    const dep = addresses.deployer;
    await bentoBox.deposit(weth.address, dep, dep, getBigNumber(100), 0);
    await bentoBox.takeLoss(weth.address, getBigNumber(169));

    // WETH: 700 deposited (200 each), 169 lost => 700 shares is 531 WETH
    // Guineas: 9000 in, 11k profit => 9k shares is 20k guineas

    // Initial balances are now:
    //
    // ---- alice:
    // Ethereum: 9000.0
    //
    // WETH:            800.0
    // WETH (BentoBox): 151.714285714285714285 (200.0 shares)
    //
    // Guineas:            7000.0
    // Guineas (BentoBox): 6666.666666666666666666 (3000.0 shares)
    //
    // ---- bob:
    // Ethereum: 9000.0
    //
    // WETH:            800.0
    // WETH (BentoBox): 151.714285714285714285 (200.0 shares)
    //
    // Guineas:            7000.0
    // Guineas (BentoBox): 6666.666666666666666666 (3000.0 shares)
    //
    // ---- carol:
    // Ethereum: 9000.0
    //
    // WETH:            800.0
    // WETH (BentoBox): 151.714285714285714285 (200.0 shares)
    //
    // Guineas:            7000.0
    // Guineas (BentoBox): 6666.666666666666666666 (3000.0 shares)

    mainPair = await deployPair({
      lender: alice.address,
      borrowers: [bob.address, carol.address],
      asset: guineas.address,
      collateral: weth.address,
      oracle: oracle.address,
      ...MainTestSettings,
    });
  });

  describe("Deploy", async () => {
    it("Should deploy", async () => {
      expect(await mainPair.lender()).to.equal(alice.address);
      for (const { address } of [carol, bob]) {
        expect(await mainPair.approvedBorrowers(address)).to.equal(true);
      }
      expect(await mainPair.approvedBorrowers(alice.address)).to.equal(false);
    });

    it("Should reject bad settings", async () => {
      await expect(
        deployPair({
          collateral: AddressZero,
        })
      ).to.be.revertedWith("PrivatePool: bad pair");

      await expect(
        deployPair({
          collateral: weth.address,
          LIQUIDATION_MULTIPLIER_BPS: 9_999,
        })
      ).to.be.revertedWith("PrivatePool: negative liquidation bonus");

      await expect(
        deployPair({
          collateral: weth.address,
          LIQUIDATION_MULTIPLIER_BPS: 10_000,
          COLLATERALIZATION_RATE_BPS: 10_001,
        })
      ).to.be.revertedWith("PrivatePool: bad collateralization rate");
    });

    it("Should refuse to initialize twice", async () => {
      await expect(mainPair.init(encodeInitData({}))).to.be.revertedWith(
        "PrivatePool: already initialized"
      );
    });
  });

  describeSnapshot("Add Asset", async () => {
    it("Should let the lender add assets", async () => {
      const share = getBigNumber(450);
      await expect(mainPair.connect(alice).addAsset(false, share))
        .to.emit(mainPair, "LogAddAsset")
        .withArgs(alice.address, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, alice.address, mainPair.address, share);

      const assetBalance = await mainPair.assetBalance();
      expect(assetBalance.reservesShare).to.equal(getBigNumber(450));
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });

    it("Should let the lender add assets (skim)", async () => {
      // This is not a reasonable transaction..
      const share = getBigNumber(450);
      const [g, a, p] = [guineas, alice, mainPair].map((x) => x.address);

      await bentoBox.connect(alice).transfer(g, a, p, share);
      await expect(mainPair.connect(alice).addAsset(true, share))
        .to.emit(mainPair, "LogAddAsset")
        .withArgs(bentoBox.address, share);

      const assetBalance = await mainPair.assetBalance();
      expect(assetBalance.reservesShare).to.equal(getBigNumber(450));
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });

    it("Should let the lender add assets (cook amount)", async () => {
      //                (   10^9  ) (   10^9  )
      const amount = 27_182_818_284_590_452_353n; // Does not divide 20 or 9

      // (Shares : Amount) in Bento is (9 : 20)
      // This is what the BentoBox gives us for our deposit; round down:
      const share = (amount * 9n) / 20n;

      const [g, a, p] = [guineas, alice, mainPair].map((x) => x.address);
      const actions = [Cook.ACTION_BENTO_DEPOSIT, Cook.ACTION_ADD_ASSET];
      const datas = [
        encodeParameters(
          ["address", "address", "uint256", "uint256"],
          [g, a, amount, 0]
        ),
        encodeParameters(["int256", "bool"], [share, false]),
      ];
      const values = [0, 0];

      // Make sure the existing Bento balance stays the same:
      const initialBentoBalance = await bentoBox.balanceOf(g, a);

      await expect(mainPair.connect(alice).cook(actions, values, datas))
        .to.emit(bentoBox, "LogDeposit")
        .withArgs(g, a, a, amount, share)
        .to.emit(mainPair, "LogAddAsset")
        .withArgs(a, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(g, a, p, share);

      expect(await bentoBox.balanceOf(g, a)).to.equal(initialBentoBalance);

      const assetBalance = await mainPair.assetBalance();
      expect(assetBalance.reservesShare).to.equal(share);
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });

    it("Should refuse to skim too much", async () => {
      const share = getBigNumber(123);
      const [g, a, p] = [guineas, alice, mainPair].map((x) => x.address);

      await bentoBox.connect(alice).transfer(g, a, p, share);
      await expect(
        mainPair.connect(alice).addAsset(true, share.add(1))
      ).to.be.revertedWith("PrivatePool: skim too much");
    });

    it("Should let anyone add assets", async () => {
      const share = getBigNumber(450);
      await expect(mainPair.connect(bob).addAsset(false, share))
        .to.emit(mainPair, "LogAddAsset")
        .withArgs(bob.address, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, bob.address, mainPair.address, share);

      const share2 = 27_182_818_284_590_452_353n;
      await expect(mainPair.connect(carol).addAsset(false, share2))
        .to.emit(mainPair, "LogAddAsset")
        .withArgs(carol.address, share2)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(guineas.address, carol.address, mainPair.address, share2);

      const assetBalance = await mainPair.assetBalance();
      expect(assetBalance.reservesShare).to.equal(share.add(share2));
      expect(assetBalance.feesEarnedShare).to.equal(0);
    });
  });

  describeSnapshot("Add Collateral", async () => {
    it("Should let approved borrowers add collateral", async () => {
      const share1 = getBigNumber(55);
      const to1 = bob.address;
      await expect(mainPair.connect(bob).addCollateral(to1, false, share1))
        .to.emit(mainPair, "LogAddCollateral")
        .withArgs(bob.address, to1, share1)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(weth.address, bob.address, mainPair.address, share1);

      expect(await mainPair.userCollateralShare(to1)).to.equal(share1);

      let collateralBalance = await mainPair.collateralBalance();
      expect(collateralBalance.userTotalShare).to.equal(share1);
      expect(collateralBalance.feesEarnedShare).to.equal(0);

      const share2 = 27_182_818_284_590_452_353n;
      const to2 = carol.address;
      await expect(mainPair.connect(carol).addCollateral(to2, false, share2))
        .to.emit(mainPair, "LogAddCollateral")
        .withArgs(carol.address, to2, share2)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(weth.address, carol.address, mainPair.address, share2);

      expect(await mainPair.userCollateralShare(to2)).to.equal(share2);

      collateralBalance = await mainPair.collateralBalance();
      expect(collateralBalance.userTotalShare).to.equal(share1.add(share2));
      expect(collateralBalance.feesEarnedShare).to.equal(0);
    });

    it("Should let anyone add collateral for approved borrowers", async () => {
      const share = getBigNumber(55);
      const to = bob.address;
      await expect(mainPair.connect(alice).addCollateral(to, false, share))
        .to.emit(mainPair, "LogAddCollateral")
        .withArgs(alice.address, to, share)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(weth.address, alice.address, mainPair.address, share);
    });

    it("Should refuse collateral for unapproved borrowers", async () => {
      const share = getBigNumber(55);
      const to = alice.address;
      await expect(
        mainPair.connect(bob).addCollateral(to, false, share)
      ).to.be.revertedWith("PrivatePool: unapproved borrower");
    });

    it("Should let approved borrowers add collateral (skim)", async () => {
      const share = getBigNumber(55);
      const to = bob.address;
      const [w, b, p] = [weth, bob, mainPair].map((x) => x.address);

      await bentoBox.connect(bob).transfer(w, b, p, share);
      await expect(mainPair.connect(bob).addCollateral(to, true, share))
        .to.emit(mainPair, "LogAddCollateral")
        .withArgs(bentoBox.address, to, share);
    });
  });

  describeSnapshot("Borrow", async () => {
    const assetShare = getBigNumber(1000).mul(9).div(20);
    const collatShare1 = getBigNumber(31_415926535_897932384n, 0);
    const collatShare2 = getBigNumber(27_182818284_590452353n, 0);

    const rate = getBigNumber(1, 18).div(12); // one WETH is 12 guineas
    const ratePrecision = getBigNumber(1);

    before(async () => {
      await mainPair.connect(alice).addAsset(false, assetShare);

      const to1 = bob.address;
      await mainPair.connect(bob).addCollateral(to1, false, collatShare1);

      const to2 = carol.address;
      await mainPair.connect(carol).addCollateral(to2, false, collatShare2);

      await oracle.set(rate);
      await mainPair.updateExchangeRate();
    });

    it("Should allow approved borrowers to borrow", async () => {
      const amount = getBigNumber(10);
      expect(amount.mul(rate)).to.be.lte(amount.mul(ratePrecision));

      const fee = amount.div(1000);
      const part = amount.add(fee); // total debt started at zero

      // Still 9 : 20 ratio
      const share = amount.mul(9).div(20);

      const [g, b, p] = [guineas, bob, mainPair].map((x) => x.address);
      await expect(mainPair.connect(bob).borrow(b, amount))
        .to.emit(mainPair, "LogBorrow")
        .withArgs(b, b, amount, fee, part)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(g, p, b, share);

      const totalDebt = await mainPair.totalDebt();
      expect(totalDebt.elastic).to.equal(part);
      expect(totalDebt.base).to.equal(part);

      expect(await mainPair.borrowerDebtPart(bob.address)).to.equal(part);
    });

    it("Should refuse to lend to unapproved borrowers", async () => {
      await expect(
        mainPair.connect(alice).borrow(alice.address, 1)
      ).to.be.revertedWith("PrivatePool: unapproved borrower");
    });

    it("Should enforce LTV requirements when borrowing", async () => {
      // Pinning down an exact cutoff is not as straightforward as it seems;
      // the calculation involves the BentoBox balance and token/share ratio of
      // the collateral (from anyone), total debt taken out by others, and
      // total accrued interest.

      const collatAmount = collatShare1.mul(531).div(700); // WETH ratio
      const borrowAmount = collatAmount.mul(9); // 75% of 12

      await expect(
        mainPair.connect(bob).borrow(bob.address, borrowAmount)
      ).to.be.revertedWith("PrivatePool: borrower insolvent");

      // Accounting for the 0.1% open fee is enough to make it succeed:
      const withFee = borrowAmount.mul(1000).div(1001);
      await expect(mainPair.connect(bob).borrow(bob.address, withFee)).to.emit(
        mainPair,
        "LogBorrow"
      );

      // Borrowing even one more wei is enough to make it fail again:
      await expect(
        mainPair.connect(bob).borrow(bob.address, withFee.add(1))
      ).to.be.revertedWith("PrivatePool: borrower insolvent");
    });

    it("Should collect the protocol fee immediately", async () => {
      // Borrowers incur an opening fee, which gets added on to their debt. The
      // protocol gets a cut of that. The lender pays for this as soon as
      // feasible. If there are assets left, it comes out of those.
      //
      // This is the case in the initial setup of this section.
      const borrowAmount = getBigNumber(100);
      const openFee = borrowAmount.div(1000);
      const protocolFee = openFee.div(10);

      // No interest has accrued yet, so this is corresponds 1:1 with tokens:
      const debtPart = borrowAmount.add(openFee);

      const borrowShare = borrowAmount.mul(9).div(20);
      const protocolFeeShare = protocolFee.mul(9).div(20);
      const takenShare = borrowShare.add(protocolFeeShare);

      await expect(
        mainPair.connect(bob).borrow(bob.address, borrowAmount)
      ).to.emit(mainPair, "LogBorrow");

      const assetBalance = await mainPair.assetBalance();
      expect(assetBalance.reservesShare).to.equal(assetShare.sub(takenShare));
      expect(assetBalance.feesEarnedShare).to.equal(protocolFeeShare);

      expect(await mainPair.feesOwedAmount()).to.equal(0);
    });

    it("Should not lend out more than there is", async () => {
      // There are 1000 guineas of assets; 150 WETH allows for borrowing
      // 1350 and is therefore enough:
      await mainPair
        .connect(bob)
        .addCollateral(bob.address, false, getBigNumber(150));

      // More than reserves
      await expect(
        mainPair.connect(bob).borrow(bob.address, getBigNumber(1001))
      ).to.be.revertedWith("BoringMath: Underflow");
    });

    it("Should not defer the protocol fee on new loans", async () => {
      // This amounts to testing that the amount + protocol fee need to be in
      // reserve:
      await mainPair
        .connect(bob)
        .addCollateral(bob.address, false, getBigNumber(150));

      // Exactly the reserves (our test amounts divide cleanly), but that is
      // not enough with the fee:
      const reservesAmount = getBigNumber(1000);
      await expect(
        mainPair.connect(bob).borrow(bob.address, reservesAmount)
      ).to.be.revertedWith("BoringMath: Underflow");

      const cutoff = reservesAmount.mul(1000).div(1001);
      await expect(mainPair.connect(bob).borrow(bob.address, cutoff)).to.emit(
        mainPair,
        "LogBorrow"
      );
    });
  });

  describeSnapshot("Accrue", async () => {
    // Potentially overcollateralize, so we can test what happens if fees cannot
    // be taken out of reserves.
    const assetAmount = getBigNumber(1000);
    const assetShare = assetAmount.mul(9).div(20);

    // Each enough to borrow all the assets:
    const collatShare1 = getBigNumber(200);
    const collatShare2 = getBigNumber(200);

    const borrowAmount1 = getBigNumber(100);
    const openFee1 = borrowAmount1.div(1000);
    const debtAmount1 = borrowAmount1.add(openFee1);

    const rate = getBigNumber(1, 18).div(10); // one WETH is 10 guineas now
    const ratePrecision = getBigNumber(1, 18);

    const YEAR = 3600 * 24 * 365;

    before(async () => {
      await mainPair.connect(alice).addAsset(false, assetShare);

      const to1 = bob.address;
      await mainPair.connect(bob).addCollateral(to1, false, collatShare1);

      const to2 = carol.address;
      await mainPair.connect(carol).addCollateral(to2, false, collatShare2);

      await oracle.set(rate);
      await mainPair.updateExchangeRate();
    });

    it("Should charge interest and collect fees over it", async () => {
      await mainPair.connect(bob).borrow(bob.address, borrowAmount1);
      await advanceNextTime(YEAR);

      const perSecond = MainTestSettings.INTEREST_PER_SECOND;
      const extraAmount = debtAmount1
        .mul(MainTestSettings.INTEREST_PER_SECOND)
        .mul(YEAR)
        .div(getBigNumber(1));
      const feeAmount = extraAmount.div(10);

      await expect(mainPair.accrue())
        .to.emit(mainPair, "LogAccrue")
        .withArgs(extraAmount, feeAmount);

      // Protocol cut of the open fee + fee on interest, both in shares:
      expect((await mainPair.assetBalance()).feesEarnedShare).to.equal(
        openFee1.div(10).mul(9).div(20).add(feeAmount.mul(9).div(20))
      );
      expect(await mainPair.feesOwedAmount()).to.equal(0);

      const totalDebt = await mainPair.totalDebt();
      expect(totalDebt.base).to.equal(debtAmount1);
      expect(totalDebt.elastic).to.equal(debtAmount1.add(extraAmount));

      // Seven percent (hardcoded) on the amount + 0.1% opening fee. Despite
      // all the rounding, this should be roughly 0.07007 times the amount
      // taken out.  Since the contract rounds down, we expect to be under, so
      // round up for the test:
      expect(
        extraAmount.mul(100_000).add(borrowAmount1.sub(1)).div(borrowAmount1)
      ).to.equal(7007);
    });

    it("Should not do anything if nothing is borrowed", async () => {
      await mainPair.accrue();
      // No "LogAccrue" event. Cleaner way to do this?
      expect(
        await ethers.provider.send("eth_getLogs", [{ fromBlock: "latest" }])
      ).to.deep.equal([]);
    });

    it("Should defer fees if everything is loaned out", async () => {
      // We effect this by taking a ridiculously long time period, so that even
      // the protocol fee drains the remaining asset reserves. Further fees
      // should be recorded as "owed".
      const almostEverything = assetAmount.mul(99).div(100);
      const openFee = almostEverything.div(1000);
      const openProtocolFeeShare = openFee.div(10).mul(9).div(20);
      const remainingShare = assetShare
        .sub(almostEverything.mul(9).div(20))
        .sub(openProtocolFeeShare);
      const initialDebt = almostEverything.add(openFee);

      await mainPair.connect(bob).borrow(bob.address, almostEverything);
      const time = 1000 * YEAR;
      await advanceNextTime(time);

      // 7000% interest; the fee is 7% of the initial debt, which is more than
      // remaining asset reserves. It should still work:
      const perSecond = MainTestSettings.INTEREST_PER_SECOND;
      const extraAmount = initialDebt
        .mul(MainTestSettings.INTEREST_PER_SECOND)
        .mul(time)
        .div(getBigNumber(1));
      const feeAmount = extraAmount.div(10);
      await expect(mainPair.accrue())
        .to.emit(mainPair, "LogAccrue")
        .withArgs(extraAmount, feeAmount);

      // Outstanding debt is recorded normally:
      const totalDebt = await mainPair.totalDebt();
      expect(totalDebt.base).to.equal(initialDebt);
      expect(totalDebt.elastic).to.equal(initialDebt.add(extraAmount));

      // Reserves are drained: what wasn't loaned out was collected as fees.
      // These already included the protocol fee:
      const assetBalance = await mainPair.assetBalance();
      expect(assetBalance.reservesShare).to.equal(0);
      expect(assetBalance.feesEarnedShare).to.equal(
        remainingShare.add(openProtocolFeeShare)
      );

      // We collected the remaining asset reserves as fee. The rest is owed:
      const feeShare = feeAmount.mul(9).div(20);
      const stillOwedShare = feeShare.sub(remainingShare);
      const stillOwedAmount = stillOwedShare.mul(20).div(9);
      expect(await mainPair.feesOwedAmount()).to.equal(stillOwedAmount);
    });
  });

  describeSnapshot("Remove Collateral", async () => {
    const assetShare = getBigNumber(1000).mul(9).div(20);
    const collatShare1 = getBigNumber(31_415926535_897932384n, 0);
    const collatShare2 = getBigNumber(27_182818284_590452353n, 0);

    const rate = getBigNumber(1, 18).div(12); // one WETH is 12 guineas
    const ratePrecision = getBigNumber(1);

    before(async () => {
      await mainPair.connect(alice).addAsset(false, assetShare);

      const to1 = bob.address;
      await mainPair.connect(bob).addCollateral(to1, false, collatShare1);

      const to2 = carol.address;
      await mainPair.connect(carol).addCollateral(to2, false, collatShare2);

      await oracle.set(rate);
      await mainPair.updateExchangeRate();
    });

    it("Should let anyone with collateral remove it", async () => {
      // The only case where "anyone" is not a borrower is (currently) pairs
      // with "seize collateral"-type liquidations; then it's the lender. This
      // may change if we allow modifying the whitelist; then we'll have to
      // cleanly handle no-longer-whitelisted users.
      expect(
        await mainPair.connect(bob).removeCollateral(bob.address, collatShare1)
      )
        .to.emit(mainPair, "LogRemoveCollateral")
        .withArgs(bob.address, bob.address, collatShare1);

      const remainder = getBigNumber(12);
      expect(
        await mainPair
          .connect(carol)
          .removeCollateral(carol.address, collatShare2.sub(remainder))
      )
        .to.emit(mainPair, "LogRemoveCollateral")
        .withArgs(carol.address, carol.address, collatShare2.sub(remainder));
    });

    // (All this is pretty much untouched since Kashi.. OK if accrue() and
    // isSolvent are OK).
  });

  describeSnapshot("Repay", () => {
    const collatAmount1 = getBigNumber(31_415926535_897932384n, 0);
    const collatShare1 = collatAmount1.mul(700).div(531);

    const collatAmount2 = getBigNumber(27_182818284_590452353n, 0);
    const collatShare2 = collatAmount2.mul(700).div(531);

    const rate = getBigNumber(1, 18).div(12); // one WETH is 12 guineas

    const assetAmount = getBigNumber(400);
    const assetShare = assetAmount.mul(9).div(20);

    const timeStep = 12345;

    const bobLoanAmount = assetAmount.mul(6).div(13);

    before(async () => {
      await mainPair.connect(alice).addAsset(false, assetShare);

      const to1 = bob.address;
      await mainPair.connect(bob).addCollateral(to1, false, collatShare1);

      const to2 = carol.address;
      await mainPair.connect(carol).addCollateral(to2, false, collatShare2);

      await oracle.set(rate);
      await mainPair.updateExchangeRate();

      await mainPair.connect(bob).borrow(bob.address, bobLoanAmount);
    });

    it("Should let borrowers repay debt", async () => {
      // const debt = assetAmount.div(2).mul(
      //   getBigNumber(1).add(MainTestSettings.INTEREST_PER_SECOND)
      // ).div(getBigNumber(1));
      const timeStep = 12345;

      // As the first debtor, parts will be in 1-1 correspondence to amounts:
      let debtPart = bobLoanAmount.add(bobLoanAmount.div(1000));
      let debtAmount = debtPart;

      let totalDebt = await mainPair.totalDebt();
      expect(totalDebt.elastic).to.equal(debtAmount);
      expect(totalDebt.base).to.equal(debtPart);

      expect(await mainPair.borrowerDebtPart(bob.address)).to.equal(debtPart);

      await advanceNextTime(timeStep);
      const extraAmount = debtAmount
        .mul(MainTestSettings.INTEREST_PER_SECOND)
        .mul(timeStep)
        .div(one);
      debtAmount = debtAmount.add(extraAmount);

      // "parts" are in units of the initial debt. These should cover it:
      const repayPart = debtPart.div(4);

      // Bob owns all the debt, so this is the conversion. Rounding is up, in
      // favour of the contract, so that the amount definitely covers the
      // part intended to be paid back:
      const repayAmount = repayPart
        .mul(debtAmount)
        .add(debtPart.sub(1))
        .div(debtPart);

      // "Smallest number of shares covering this" -- so rounded up again:
      // Note that -- as in the UniV2 AMMs, for instance -- this number of
      // shares could theoretically be used to cover a larger debt.
      const repayShare = repayAmount.mul(9).add(19).div(20);

      const [g, b, p] = [guineas, bob, mainPair].map((x) => x.address);
      expect(await mainPair.connect(bob).repay(bob.address, false, repayPart))
        .to.emit(mainPair, "LogAccrue")
        .withArgs(extraAmount, extraAmount.div(10))
        .to.emit(mainPair, "LogRepay")
        .withArgs(bob.address, bob.address, repayAmount, repayPart)
        .to.emit(bentoBox, "LogTransfer")
        .withArgs(g, b, p, repayShare);

      debtPart = debtPart.sub(repayPart);
      debtAmount = debtAmount.sub(repayAmount);

      totalDebt = await mainPair.totalDebt();

      expect(totalDebt.elastic).to.equal(debtAmount);
      expect(totalDebt.base).to.equal(debtPart);
    });

    it("Should use repayment towards fees owed, if any", async () => {
      // In other words, the protocol gets first dibs on the fees. Fees are
      // really owed by the lender, so from the borrower's POV nothing should
      // change.

      // SETUP (and extra test for other calculations):
      const timeStep = 234567;

      const bobLoanShare = bobLoanAmount.mul(9).div(20);

      const t0 = {
        bobDebtAmount: bobLoanAmount.mul(1001).div(1000),
        assetBalance: await mainPair.assetBalance(),
        totalDebt: await mainPair.totalDebt(),
      };
      t0.bobDebtPart = t0.bobDebtAmount;

      expect(t0.assetBalance.reservesShare).to.equal(
        assetShare
          .sub(bobLoanAmount.mul(9).div(20))
          .sub(bobLoanAmount.div(10_000).mul(9).div(20))
      );
      expect(t0.totalDebt.elastic).to.equal(t0.bobDebtAmount);

      const t1 = {
        accruedInterest: t0.bobDebtAmount
          .mul(MainTestSettings.INTEREST_PER_SECOND.mul(timeStep))
          .div(one),
      };
      // We find the number of shares Carol should borrow to drain reserves. We
      // account for the protocol cut of Bob's accrued interest, and Carol's
      // upcoming opening fee. Rounding up, because the calculation for the fee
      // rounds down. This is not exact, because the contract starts with the
      // amount, not the total. We deal with this by simply leaving a few wei
      // of wiggle room (here and elsewhere); "multiplication and then division
      // with rounding" is not an invertible operation, and not every target
      // can be reached no matter how you round. (Try (M * 2) / 1 == 3).
      const carolLoanShare = t0.assetBalance.reservesShare
        .sub(t1.accruedInterest.div(10).mul(9).div(20))
        .add(1)
        .mul(10_000)
        .div(10_001);
      const carolLoanAmount = carolLoanShare.mul(20).div(9).add(2);

      await advanceNextTime(timeStep);
      await mainPair.connect(carol).borrow(carol.address, carolLoanAmount);

      t1.assetBalance = await mainPair.assetBalance();
      t1.feesOwedAmount = await mainPair.feesOwedAmount();
      expect(t1.assetBalance.reservesShare).to.be.lte(1);
      expect(t1.feesOwedAmount).to.equal(0);

      // One accrual (after some time) should now be enough to cause fees to
      // be owed.

      t1.totalDebt = await mainPair.totalDebt();

      await advanceNextTime(timeStep);
      await mainPair.accrue();

      const t2 = {
        accruedInterest: t1.totalDebt.elastic
          .mul(MainTestSettings.INTEREST_PER_SECOND.mul(timeStep))
          .div(one),
        assetBalance: await mainPair.assetBalance(),
        totalDebt: await mainPair.totalDebt(),
        feesOwedAmount: await mainPair.feesOwedAmount(),
      };
      // Since we have at most 1 wei in reserve, almost all of the protocol fee
      // over the accrued interest will be "fees owed".
      // The calculation involves two separate roundings and an addition, so
      // the error is more than 1 or even `toAmount(1)`:
      expect(t2.assetBalance.reservesShare).to.equal(0);
      expect(t2.feesOwedAmount).to.be.gt(0);
      expect(t2.feesOwedAmount.sub(t2.accruedInterest.div(10)).abs()).to.be.lte(
        5
      );

      // Repaying triggers another accrual, so we (advance a fixed time and)
      // determine how much will be owed after that:
      const t3 = {
        accruedInterest: t2.totalDebt.elastic
          .mul(MainTestSettings.INTEREST_PER_SECOND.mul(timeStep))
          .div(one),
      };
      // Intermediate value; we would see it if we did something that accrues
      // but not deposits any assets:
      t3.feesOwedBeforeRepay = t2.feesOwedAmount.add(
        t3.accruedInterest.div(10)
      );

      // A debt "part" corresponds to 1 token when the first loan is taken out.
      // When interest accrues this amount grows correspondingly; it never
      // shrinks.
      // Repaying N "parts", then, definitely covers N tokens. Not by a lot;
      // we've seen a bit over 1 week of 7%-a-year interest at this point.
      // The amount we want to repay is the intermediate value of fees owed;
      // after the accrual that gets triggered
      const repayPart = t3.feesOwedBeforeRepay;

      await advanceNextTime(timeStep);
      await mainPair.connect(bob).repay(bob.address, false, repayPart);

      t3.assetBalance = await mainPair.assetBalance();
      t3.totalDebt = await mainPair.totalDebt();
      t3.bobDebtPart = await mainPair.borrowerDebtPart(bob.address);
      t3.feesOwedAmount = await mainPair.feesOwedAmount();

      // Before the accrual, there were already fees owed, and therefore no
      // asset reserves. More fees were then incurred. Since they could not be
      // taken out of reserves, they were not "earned" until we made the
      // repayment. At which point we expect "fees earned" to have increased
      // by exactly that amount (in shares):
      expect(t3.assetBalance.feesEarnedShare).to.equal(
        t2.assetBalance.feesEarnedShare.add(
          t3.feesOwedBeforeRepay.mul(9).div(20)
        )
      );
      expect(t3.feesOwedAmount).to.equal(0);

      // Debt gets paid off as normal; in particular the fees are not added to
      // it or anything:
      expect(t3.bobDebtPart).to.equal(t0.bobDebtPart.sub(repayPart));
      expect(t3.totalDebt.base).to.equal(t2.totalDebt.base.sub(repayPart));

      // The small amount we repaid in excess of the fees owed should have gone
      // to asset reserves.
      const excessRepayAmount = repayPart
        .mul(t3.totalDebt.elastic)
        .div(t3.totalDebt.base)
        .sub(t3.feesOwedBeforeRepay);
      const excessRepayShare = excessRepayAmount.mul(9).div(20);

      // Again, giving it a few wei of leeway due to rounding in _receiveAsset:
      expect(
        t3.assetBalance.reservesShare.sub(excessRepayShare).abs()
      ).to.be.lte(5);
    });
  });

  describeSnapshot("Liquidate -- normal", () => {
    const bobCollateralAmount = getBigNumber(20);
    const bobCollateralShare = bobCollateralAmount.mul(700).div(531);

    const carolCollateralAmount = getBigNumber(30);
    const carolCollateralShare = carolCollateralAmount.mul(700).div(531);

    // Check that this covers rates we use..
    const assetAmount = getBigNumber(1000);
    const assetShare = assetAmount.mul(9).div(20);

    const initialRate = one.div(10); // one WETH is 10 guineas
    const bobLoanAmount = getBigNumber(100); // ~50% LTV
    const carolLoanAmount = getBigNumber(100); // ~33% LTV

    const t0 = {};

    before(async () => {
      const [a, b, c] = [alice, bob, carol].map((x) => x.address);
      await mainPair.connect(alice).addAsset(false, assetShare);
      await mainPair.connect(bob).addCollateral(b, false, bobCollateralShare);
      await mainPair
        .connect(carol)
        .addCollateral(c, false, carolCollateralShare);

      await oracle.set(one.div(10)); // one WETH is 10 guineas
      await mainPair.updateExchangeRate();

      await mainPair.connect(bob).borrow(b, bobLoanAmount);
      await mainPair.connect(carol).borrow(c, carolLoanAmount);

      t0.aliceBentoGuineas = await bentoBox.balanceOf(guineas.address, a);
      t0.aliceBentoWeth = await bentoBox.balanceOf(weth.address, a);

      t0.bobCollateralShare = await mainPair.userCollateralShare(b);
      t0.carolCollateralShare = await mainPair.userCollateralShare(c);

      t0.bobDebtPart = await mainPair.borrowerDebtPart(b);
      t0.carolDebtPart = await mainPair.borrowerDebtPart(c);

      t0.totalDebt = await mainPair.totalDebt();
      t0.assetBalance = await mainPair.assetBalance();
      t0.collateralBalance = await mainPair.collateralBalance();

      t0.blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
    });

    it("Should refuse to liquidate solvent borrowers, at all", async () => {
      // Not enough time will have passed to make either borrower insolvent
      // over the accrued interest:
      await expect(
        mainPair.liquidate(
          [bob.address, carol.address],
          [one, one],
          alice.address,
          AddressZero
        )
      ).to.be.revertedWith("PrivatePool: all are solvent");
    });

    it("Should liquidate insolvent borrowers only", async () => {
      const rate = one.div(5);
      await oracle.set(rate);
      await mainPair.updateExchangeRate();
      // Bob:   ~100 / (20 * 5) ~= 100% => insolvent
      // Carol: ~100 / (30 * 5) ~= 66%  => solvent
      //
      const bobLiquidatePart = one;
      const carolLiquidatePart = one;

      // Alice has guineas and has approved the contract. That she is also the
      // lender makes no difference in the execution path taken.
      await expect(
        mainPair
          .connect(alice)
          .liquidate(
            [bob.address, carol.address],
            [one, one],
            alice.address,
            AddressZero
          )
      )
        .to.emit(mainPair, "LogRemoveCollateral")
        .to.emit(mainPair, "LogRepay");

      const t1 = {
        totalDebt: await mainPair.totalDebt(),
        bobDebtPart: await mainPair.borrowerDebtPart(bob.address),
        carolDebtPart: await mainPair.borrowerDebtPart(carol.address),

        collateralBalance: await mainPair.collateralBalance(),
        bobCollateralShare: await mainPair.userCollateralShare(bob.address),
        carolCollateralShare: await mainPair.userCollateralShare(carol.address),

        assetBalance: await mainPair.assetBalance(),

        aliceBentoGuineas: await bentoBox.balanceOf(
          guineas.address,
          alice.address
        ),
        aliceBentoWeth: await bentoBox.balanceOf(weth.address, alice.address),

        blockTimestamp: (await ethers.provider.getBlock("latest")).timestamp,
      };

      // Amounts do not account for interest, but that should be very little
      // Bob's "debt parts" correspond almost 1:1 to the amount of guineas he
      // owes; the difference is interest accrued over a few blocks.
      // This still gives us a firm lower bound on how much collateral gets
      // taken from Bob:
      const bobMinCollateralTakenShare = bobLiquidatePart
        .mul(rate)
        .mul(MainTestSettings.LIQUIDATION_MULTIPLIER_BPS)
        .div(one.mul(10_000))
        .mul(700)
        .div(531);

      // Alice gets the collateral and bonus, in exchange for the loan amount
      // plus the protocol fee on the bonus.
      // While rounding (from amounts to shares) is an issue, the leeway is
      // mostly to account for the interest, as in the collateral calculation.
      const minRepayShare = bobLiquidatePart.mul(9).div(20);
      // Not entirely accurate because it gets calculated differently, but
      // equivalent up to rounding effects:
      const protocolFeeShare = minRepayShare
        .mul(MainTestSettings.LIQUIDATION_MULTIPLIER_BPS)
        .div(10_000)
        .sub(minRepayShare)
        .div(10);
      const aliceMaxBentoGuineas = t0.aliceBentoGuineas
        .sub(minRepayShare)
        .sub(protocolFeeShare);

      expect(t1.aliceBentoGuineas).to.be.lte(aliceMaxBentoGuineas);
      expect(t1.aliceBentoGuineas).to.be.gte(
        aliceMaxBentoGuineas.mul(9999).div(10_000)
      );

      const aliceMinBentoWeth = t0.aliceBentoWeth.add(
        bobMinCollateralTakenShare
      );
      expect(t1.aliceBentoWeth).to.be.gte(aliceMinBentoWeth);
      expect(t1.aliceBentoWeth).to.be.lte(
        aliceMinBentoWeth.mul(10_001).div(10_000)
      );

      // If we want a firm lower bound on asset reserves, we need to account
      // for interest: the accrue() call right before liquidations charges
      // interest, and takes the protocol cut of that interest out of reserves.
      // We divide rounding up:
      const maxInterestFee = MainTestSettings.INTEREST_PER_SECOND.mul(
        t1.blockTimestamp - t0.blockTimestamp
      )
        .mul(t0.totalDebt.elastic)
        .add(one.sub(1))
        .div(one)
        .add(9)
        .div(10);
      const minAssetReserves = t0.assetBalance.reservesShare
        .add(minRepayShare)
        .sub(maxInterestFee);
      const minFeesEarnedShare =
        t0.assetBalance.feesEarnedShare.add(protocolFeeShare);
      expect(t1.assetBalance.reservesShare).to.be.gte(minAssetReserves);
      expect(t1.assetBalance.feesEarnedShare).to.be.gte(minFeesEarnedShare);

      // Carol was not insolvent, so that liquidation failed:
      expect(t1.carolDebtPart).to.equal(t0.carolDebtPart);
      expect(t1.carolCollateralShare).to.equal(t0.carolCollateralShare);

      // Bob got liquidated; this affects his balance and the totals:
      expect(t1.bobDebtPart).to.equal(t0.bobDebtPart.sub(bobLiquidatePart));
      expect(t1.totalDebt.base).to.equal(
        t0.totalDebt.base.sub(bobLiquidatePart)
      );

      const bobMaxCollateralShare = t0.bobCollateralShare.sub(
        bobMinCollateralTakenShare
      );
      expect(t1.bobCollateralShare).to.be.lte(bobMaxCollateralShare);
      expect(t1.bobCollateralShare).to.be.gte(
        bobMaxCollateralShare.mul(9999).div(10_000)
      );
      // Equivalent check..
      expect(t1.collateralBalance.userTotalShare).to.equal(
        t1.bobCollateralShare.add(t1.carolCollateralShare)
      );
    });
  });

  describeSnapshot("Liquidate -- in kind", () => {
    const bobCollateralAmount = getBigNumber(20);
    const bobCollateralShare = bobCollateralAmount.mul(700).div(531);

    const carolCollateralAmount = getBigNumber(30);
    const carolCollateralShare = carolCollateralAmount.mul(700).div(531);

    // Check that this covers rates we use..
    const assetAmount = getBigNumber(1000);
    const assetShare = assetAmount.mul(9).div(20);

    const initialRate = one.div(10); // one WETH is 10 guineas
    const bobLoanAmount = getBigNumber(100); // ~50% LTV
    const carolLoanAmount = getBigNumber(100); // ~33% LTV

    const t0 = {};
    let pair;

    before(async () => {
      const [a, b, c] = [alice, bob, carol].map((x) => x.address);

      pair = await deployPair({
        lender: alice.address,
        borrowers: [bob.address, carol.address],
        asset: guineas.address,
        collateral: weth.address,
        oracle: oracle.address,
        ...MainTestSettings,
        LIQUIDATION_SEIZE_COLLATERAL: true,
      });

      await pair.connect(alice).addAsset(false, assetShare);
      await pair.connect(bob).addCollateral(b, false, bobCollateralShare);
      await pair.connect(carol).addCollateral(c, false, carolCollateralShare);

      await oracle.set(one.div(10)); // one WETH is 10 guineas
      await pair.updateExchangeRate();

      await pair.connect(bob).borrow(b, bobLoanAmount);
      await pair.connect(carol).borrow(c, carolLoanAmount);

      t0.aliceBentoGuineas = await bentoBox.balanceOf(guineas.address, a);
      t0.aliceBentoWeth = await bentoBox.balanceOf(weth.address, a);

      t0.bobCollateralShare = await pair.userCollateralShare(b);
      t0.carolCollateralShare = await pair.userCollateralShare(c);

      t0.bobDebtPart = await pair.borrowerDebtPart(b);
      t0.carolDebtPart = await pair.borrowerDebtPart(c);

      t0.totalDebt = await pair.totalDebt();
      t0.assetBalance = await pair.assetBalance();
      t0.collateralBalance = await pair.collateralBalance();

      t0.blockTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
    });

    it("Should refuse to liquidate solvent borrowers, at all", async () => {
      // Not enough time will have passed to make either borrower insolvent
      // over the accrued interest:
      await expect(
        pair.liquidate(
          [bob.address, carol.address],
          [one, one],
          alice.address,
          AddressZero
        )
      ).to.be.revertedWith("PrivatePool: all are solvent");
    });

    it("Should liquidate insolvent borrowers only", async () => {
      const rate = one.div(5);
      await oracle.set(rate);
      await pair.updateExchangeRate();
      // Bob:   ~100 / (20 * 5) ~= 100% => insolvent
      // Carol: ~100 / (30 * 5) ~= 66%  => solvent
      //
      const bobLiquidatePart = one;
      const carolLiquidatePart = one;

      // That Alice she is also the lender makes no difference in the execution
      // path taken.
      await expect(
        pair
          .connect(alice)
          .liquidate(
            [bob.address, carol.address],
            [one, one],
            alice.address,
            AddressZero
          )
      ).to.emit(pair, "LogSeizeCollateral");

      const t1 = {
        totalDebt: await pair.totalDebt(),
        bobDebtPart: await pair.borrowerDebtPart(bob.address),
        carolDebtPart: await pair.borrowerDebtPart(carol.address),

        aliceCollateralShare: await pair.userCollateralShare(alice.address),
        bobCollateralShare: await pair.userCollateralShare(bob.address),
        carolCollateralShare: await pair.userCollateralShare(carol.address),

        assetBalance: await pair.assetBalance(),
        collateralBalance: await pair.collateralBalance(),

        aliceBentoGuineas: await bentoBox.balanceOf(
          guineas.address,
          alice.address
        ),
        aliceBentoWeth: await bentoBox.balanceOf(weth.address, alice.address),

        blockTimestamp: (await ethers.provider.getBlock("latest")).timestamp,
      };

      // Amounts do not account for interest, but that should be very little
      // Bob's "debt parts" correspond almost 1:1 to the amount of guineas he
      // owes; the difference is interest accrued over a few blocks.
      // This still gives us a firm lower bound on how much collateral gets
      // taken from Bob:
      const bobMinCollateralTakenShare = bobLiquidatePart
        .mul(rate)
        .mul(MainTestSettings.LIQUIDATION_MULTIPLIER_BPS)
        .div(one.mul(10_000))
        .mul(700)
        .div(531);

      // These need not add up (rounding), but should be firm lower bounds:
      const minCollateralLiquidatorShare = bobMinCollateralTakenShare
        .mul(MainTestSettings.LIQUIDATION_MULTIPLIER_BPS - 10_000)
        .div(MainTestSettings.LIQUIDATION_MULTIPLIER_BPS)
        .mul(9)
        .div(10);
      const minCollateralFeeShare = minCollateralLiquidatorShare.div(9);
      const minCollateralLenderShare = bobMinCollateralTakenShare
        .mul(10_000)
        .div(MainTestSettings.LIQUIDATION_MULTIPLIER_BPS);

      expect(t1.collateralBalance.feesEarnedShare).to.be.gte(
        minCollateralFeeShare
      );
      expect(t1.collateralBalance.feesEarnedShare).to.be.lte(
        minCollateralFeeShare.mul(10_001).div(10_000)
      );

      // Alice gets the bonus only, in kind, minus the protocol fee. The
      // contract gets the protocol fee over the bonus.
      // No repayment:
      expect(t1.aliceBentoGuineas).to.equal(t0.aliceBentoGuineas);

      // Alice the liquidator:
      const aliceMinBentoWeth = t0.aliceBentoWeth.add(
        minCollateralLiquidatorShare
      );
      expect(t1.aliceBentoWeth).to.be.gte(aliceMinBentoWeth);
      expect(t1.aliceBentoWeth).to.be.lte(
        aliceMinBentoWeth.mul(10_001).div(10_000)
      );

      // Alice the lender:
      expect(t1.aliceCollateralShare).to.be.gte(minCollateralLenderShare);
      expect(t1.aliceCollateralShare).to.be.lte(
        minCollateralLenderShare.mul(10_001).div(10_000)
      );

      // Asset reserves do not really change, except for the interest fee..
      const maxInterestFee = MainTestSettings.INTEREST_PER_SECOND.mul(
        t1.blockTimestamp - t0.blockTimestamp
      )
        .mul(t0.totalDebt.elastic)
        .add(one.sub(1))
        .div(one)
        .add(9)
        .div(10);
      const minAssetReserves =
        t0.assetBalance.reservesShare.sub(maxInterestFee);
      expect(t1.assetBalance.reservesShare).to.be.gte(minAssetReserves);

      // Carol was not insolvent, so that liquidation failed:
      expect(t1.carolDebtPart).to.equal(t0.carolDebtPart);
      expect(t1.carolCollateralShare).to.equal(t0.carolCollateralShare);

      // Bob got liquidated; this affects his balance and the totals:
      expect(t1.bobDebtPart).to.equal(t0.bobDebtPart.sub(bobLiquidatePart));
      expect(t1.totalDebt.base).to.equal(
        t0.totalDebt.base.sub(bobLiquidatePart)
      );

      const bobMaxCollateralShare = t0.bobCollateralShare.sub(
        bobMinCollateralTakenShare
      );
      expect(t1.bobCollateralShare).to.be.lte(bobMaxCollateralShare);
      expect(t1.bobCollateralShare).to.be.gte(
        bobMaxCollateralShare.mul(9999).div(10_000)
      );
      // Given that individual shares are as expected, this tests the total:
      expect(t1.collateralBalance.userTotalShare).to.equal(
        t1.bobCollateralShare
          .add(t1.carolCollateralShare)
          .add(t1.aliceCollateralShare)
      );
    });
  });

  describeSnapshot("Edge Cases", () => {
    const makeIsSolventTest = (totalSupply, shouldPass) => async () => {
      const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
      const OracleMock = await ethers.getContractFactory("OracleMock");

      const sdOracle = await OracleMock.deploy();
      await sdOracle.set(getBigNumber(100)); // 100 coins to the dollar; 1c
      const enoughDollars = getBigNumber(1_000, 0).mul(totalSupply);

      const coin = await ERC20Mock.deploy(totalSupply);
      const dollar = await ERC20Mock.deploy(enoughDollars);

      await coin.transfer(bob.address, totalSupply);
      await dollar.transfer(alice.address, totalSupply.div(10)); // Also Enough

      const coinPair = await deployPair({
        lender: alice.address,
        borrowers: [bob.address],
        asset: dollar.address,
        collateral: coin.address,
        oracle: sdOracle.address,
        ...MainTestSettings, // (Mostly defaults from Kashi)
      });
      await coinPair.updateExchangeRate();

      await dollar.connect(alice).approve(bentoBox.address, MaxUint256);
      await bentoBox
        .connect(alice)
        .deposit(
          dollar.address,
          alice.address,
          alice.address,
          totalSupply.div(10),
          0
        );
      await coinPair.connect(alice).addAsset(false, totalSupply.div(10));

      await coin.connect(bob).approve(bentoBox.address, MaxUint256);
      await bentoBox
        .connect(bob)
        .deposit(coin.address, bob.address, bob.address, totalSupply, 0);
      await coinPair
        .connect(bob)
        .addCollateral(bob.address, false, totalSupply);

      const assetBalance = await coinPair.assetBalance();
      const collateralBalance = await coinPair.collateralBalance();
      const bobCollateral = await coinPair.userCollateralShare(bob.address);

      expect(assetBalance.reservesShare).to.equal(totalSupply.div(10));
      expect(collateralBalance.userTotalShare).to.equal(totalSupply);
      expect(bobCollateral).to.equal(totalSupply);

      const bentoCoinTotals = await bentoBox.totals(coin.address);
      expect(bentoCoinTotals.elastic).to.equal(totalSupply);

      if (shouldPass) {
        await expect(coinPair.connect(bob).borrow(bob.address, 1))
          .to.emit(coinPair, "LogBorrow")
          .to.emit(bentoBox, "LogTransfer");
      } else {
        await expect(
          coinPair.connect(bob).borrow(bob.address, 1)
        ).to.be.revertedWith("BoringMath: Mul Overflow");
      }
    };

    it(
      "Works with all SPELL as collateral (no strat losses)",
      makeIsSolventTest(getBigNumber(210_000_000_000n, 18), true)
    );

    // This fails with the old Kashi-style `isSolvent`:
    it(
      "No longer breaks at 393 billion (18-decimal) tokens",
      makeIsSolventTest(getBigNumber(393_000_000_000n, 18), true)
    );
  });
});
