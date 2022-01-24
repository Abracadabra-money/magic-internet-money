// SPDX-License-Identifier: UNLICENSED

// Cauldron

//    (                (   (
//    )\      )    (   )\  )\ )  (
//  (((_)  ( /(   ))\ ((_)(()/(  )(    (    (
//  )\___  )(_)) /((_) _   ((_))(()\   )\   )\ )
// ((/ __|((_)_ (_))( | |  _| |  ((_) ((_) _(_/(
//  | (__ / _` || || || |/ _` | | '_|/ _ \| ' \))
//   \___|\__,_| \_,_||_|\__,_| |_|  \___/|_||_|

// Copyright (c) 2021 BoringCrypto - All rights reserved
// Twitter: @Boring_Crypto

// Special thanks to:
// @0xKeno - for all his invaluable contributions
// @burger_crypto - for the idea of trying to let the LPs benefit from liquidations

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";

import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@boringcrypto/boring-solidity/contracts/interfaces/IMasterContract.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringRebase.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./interfaces/IOracle.sol";
import "./interfaces/ISimpleSwapper.sol";
import "./libraries/FullMath.sol";

/// @title PrivatePool
/// @dev This contract allows contract calls to any contract (except BentoBox)
/// from arbitrary callers thus, don't trust calls from this contract in any circumstances.
contract PrivatePool is BoringOwnable, IMasterContract {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using RebaseLibrary for Rebase;
    using BoringERC20 for IERC20;

    event LogExchangeRate(uint256 rate);
    event LogAccrue(uint256 accruedAmount, uint256 feeAmount);
    event LogAddCollateral(address indexed from, address indexed to, uint256 share);
    event LogAddAsset(address indexed from, uint256 share);
    event LogRemoveCollateral(address indexed from, address indexed to, uint256 share);
    event LogRemoveAsset(address indexed to, uint256 share);
    event LogBorrow(address indexed from, address indexed to, uint256 amount, uint256 openFeeAmount, uint256 part);
    event LogRepay(address indexed from, address indexed to, uint256 amount, uint256 part);
    event LogSeizeCollateral(address indexed from, uint256 collateralShare, uint256 debtAmount, uint256 debtPart);
    event LogFeeTo(address indexed newFeeTo);
    event LogWithdrawFees(address indexed feeTo, uint256 assetFeeShare, uint256 collateralFeeShare);

    // Immutables (for MasterContract and all clones)
    IBentoBoxV1 public immutable bentoBox;
    PrivatePool public immutable masterContract;

    // MasterContract variables
    address public feeTo;

    // Per clone variables
    // Clone init settings
    IERC20 public collateral;
    IERC20 public asset;
    IOracle public oracle;
    bytes public oracleData;

    // A note on terminology:
    // "Shares" are BentoBox shares.
    // "Parts" and represent shares held in the debt pool

    // The BentoBox balance is the sum of the below two.
    // Since that fits in a single uint128, we can often forgo overflow checks.
    struct AssetBalance {
        uint128 reservesShare;
        uint128 feesEarnedShare;
    }
    AssetBalance public assetBalance;
    uint256 public feesOwedAmount; // Positive only if reservesShare = 0

    // The BentoBox balance is the sum of the below two.
    // Seized collateral goes to the "userCollateralShare" account of the
    // lender.
    struct CollateralBalance {
        uint128 userTotalShare;
        uint128 feesEarnedShare;
    }
    CollateralBalance public collateralBalance;
    mapping(address => uint256) public userCollateralShare;

    // Elastic: Exact asset token amount that currently needs to be repaid
    // Base: Total parts of the debt held by borrowers (borrowerDebtPart)
    Rebase public totalDebt;
    mapping(address => uint256) public borrowerDebtPart;

    address public lender;
    mapping(address => bool) public approvedBorrowers;

    /// @notice Exchange and interest rate tracking.
    /// This is 'cached' here because calls to Oracles can be very expensive.
    uint256 public exchangeRate;

    struct AccrueInfo {
        uint64 lastAccrued;
        uint64 INTEREST_PER_SECOND; // (in units of 1/10^18)
        uint64 EXPIRATION;
        uint16 COLLATERALIZATION_RATE_BPS;
        uint16 LIQUIDATION_MULTIPLIER_BPS;
        uint16 BORROW_OPENING_FEE_BPS;
        bool LIQUIDATION_SEIZE_COLLATERAL;
    }
    AccrueInfo public accrueInfo;

    uint256 private constant PROTOCOL_FEE_BPS = 1000; // 10%
    uint256 private constant BPS = 10_000;
    uint256 private constant EXCHANGE_RATE_PRECISION = 1e18;

    /// @notice The constructor is only used for the initial master contract. Subsequent clones are initialised via `init`.
    constructor(IBentoBoxV1 bentoBox_) public {
        bentoBox = bentoBox_;
        masterContract = this;
    }

    struct InitSettings {
        IERC20 collateral;
        IERC20 asset;
        IOracle oracle;
        bytes oracleData;
        address lender;
        address[] borrowers;
        uint64 INTEREST_PER_SECOND;
        uint64 EXPIRATION;
        uint16 COLLATERALIZATION_RATE_BPS;
        uint16 LIQUIDATION_MULTIPLIER_BPS;
        uint16 BORROW_OPENING_FEE_BPS;
        bool LIQUIDATION_SEIZE_COLLATERAL;
    }

    /// @notice Serves as the constructor for clones, as clones can't have a regular constructor
    function init(bytes calldata data) public payable override {
        require(address(collateral) == address(0), "PrivatePool: already initialized");

        InitSettings memory settings = abi.decode(data, (InitSettings));
        require(address(settings.collateral) != address(0), "PrivatePool: bad pair");
        require(settings.LIQUIDATION_MULTIPLIER_BPS >= BPS, "PrivatePool: negative liquidation bonus");
        require(settings.COLLATERALIZATION_RATE_BPS <= BPS, "PrivatePool: bad collateralization rate");

        collateral = settings.collateral;
        asset = settings.asset;
        oracle = settings.oracle;
        oracleData = settings.oracleData;
        lender = settings.lender;

        AccrueInfo memory _aI;
        _aI.INTEREST_PER_SECOND = settings.INTEREST_PER_SECOND;
        _aI.EXPIRATION = settings.EXPIRATION;
        _aI.COLLATERALIZATION_RATE_BPS = settings.COLLATERALIZATION_RATE_BPS;
        _aI.LIQUIDATION_MULTIPLIER_BPS = settings.LIQUIDATION_MULTIPLIER_BPS;
        _aI.BORROW_OPENING_FEE_BPS = settings.BORROW_OPENING_FEE_BPS;
        _aI.LIQUIDATION_SEIZE_COLLATERAL = settings.LIQUIDATION_SEIZE_COLLATERAL;
        accrueInfo = _aI;

        for (uint256 i = 0; i < settings.borrowers.length; i++) {
            approvedBorrowers[settings.borrowers[i]] = true;
        }
    }

    function setApprovedBorrowers(address borrower, bool approved) external onlyOwner {
        approvedBorrowers[borrower] = approved;
    }

    /// @notice Accrues the interest on the borrowed tokens and handles the accumulation of fees.
    function accrue() public {
        AccrueInfo memory _accrueInfo = accrueInfo;
        // Number of seconds since accrue was called
        uint256 elapsedTime = block.timestamp - _accrueInfo.lastAccrued;
        if (elapsedTime == 0) {
            return;
        }
        accrueInfo.lastAccrued = uint64(block.timestamp);

        Rebase memory _totalDebt = totalDebt;
        if (_totalDebt.base == 0) {
            return;
        }
        // No overflow:
        // - _totalDebt.elastic is 128 bits
        // - INTEREST_PER_SECOND is 64 bits
        // - elapsedTime fits in 64 bits for the next 580 billion (10^9) years
        uint256 extraAmount = (uint256(_totalDebt.elastic) * _accrueInfo.INTEREST_PER_SECOND * elapsedTime) / 1e18;

        // If the interest rate is too high, then this will overflow and
        // effectively lock up all funds. Do not set the interest rate too
        // high.
        _totalDebt.elastic = _totalDebt.elastic.add(extraAmount.to128());
        totalDebt = _totalDebt;

        // No overflow: extraAmount is divided by 1e18 > 2^59; we need 16 bits
        uint256 feeAmount = (extraAmount * PROTOCOL_FEE_BPS) / BPS;

        AssetBalance memory _assetBalance = assetBalance;
        if (_assetBalance.reservesShare == 0) {
            // Fees owed are always part of the debt, and the debt just got
            // at least `feeAmount` added to it. If that fit, so does this:
            feesOwedAmount += feeAmount;
        } else {
            uint256 feeShare = bentoBox.toShare(asset, feeAmount, false);
            if (_assetBalance.reservesShare < feeShare) {
                _assetBalance.feesEarnedShare += _assetBalance.reservesShare;
                feesOwedAmount += bentoBox.toAmount(asset, feeShare - _assetBalance.reservesShare, false);
                _assetBalance.reservesShare = 0;
            } else {
                // feesEarned + fee <= feesEarned + reserves <= Bento balance:
                _assetBalance.reservesShare -= uint128(feeShare);
                _assetBalance.feesEarnedShare += uint128(feeShare);
            }
            assetBalance = _assetBalance;
        }

        emit LogAccrue(extraAmount, feeAmount);
    }

    /// @notice Concrete implementation of `isSolvent`. Includes a third parameter to allow caching `exchangeRate`.
    /// @param _exchangeRate The exchange rate. Used to cache the `exchangeRate` between calls.
    function _isSolvent(address borrower, uint256 _exchangeRate) internal view returns (bool) {
        // accrue must have already been called!
        uint256 debtPart = borrowerDebtPart[borrower];
        if (debtPart == 0) return true;
        uint256 collateralShare = userCollateralShare[borrower];
        if (collateralShare == 0) return false;

        // The inequality that needs to hold for a user to be solvent is:
        //
        //    (value of user collateral) * (max LTV) >= (value of user debt)
        //
        // Our exchange rates give "collateral per ether of asset", so it makes
        // sense to express the value in the collateral token. The calculation
        // for the collateral value is:
        //
        //                                BentoBox tokens
        //               value = shares * ---------------
        //                                BentoBox shares
        //
        // where BentoBox tokens resp. shares refer to the balances for the
        // collateral (ERC20) contract. For the debt we get:
        //
        //                  Total debt tokens   Collateral wei per asset ether
        //  value = parts * ----------------- * ------------------------------
        //                   Total debt parts               1e18
        //
        // ..since "tokens" is in wei. We call this EXCHANGE_RATE_PRECISION.
        // Finally, max LTV is
        //
        //          COLLATERALIZATION_RATE_BPS
        //  ratio = --------------------------.
        //                     1e4
        //
        // We use the below table to (fit the inequality in 80 characters and)
        // move some things around and justify our calculations.
        //
        //      Description                 Variable in contract        Bits
        // -----------------------------------------------------------------
        // cs   shares                      collateralShare             128*
        // Be   BentoBox tokens             bentoBoxTotals.elastic      128
        // Bb   BentoBox shares             bentoBoxTotals.base         128
        // -----------------------------------------------------------------
        // dp   parts                       debtPart                    128*
        // De   Total debt tokens           totalDebt.elastic           128
        // Db   Total debt parts            totalDebt.base              128
        // xr   Coll. wei per asset ether   exchangeRate                256
        //      1e18                        EXCHANGE_RATE_PRECISION      60
        // ----------------------------------------------------------------
        // ltv                              COLLATERALIZATION_RATE_BPS   14
        //      1e4                         BPS                          14
        //      1e14                                                     47
        //
        // (* as in other proofs, these values fit in some 128-bit total).
        // The inequality, without regard for integer division:
        //
        //                       Be   ltv         De    xr
        //                  cs * -- * --- >= dp * -- * ----
        //                       Bb   1e4         Db   1e18
        //
        // This is equivalent to:
        //
        //    cs *  Be * ltv *  Db * 1e14 >=  dp *  De *  xr *  Bb
        //
        // Corresponding bit counts:
        //
        //   128 + 128 +  14 + 128 + 47;     128 + 128 + 256 + 128
        //
        // So, the LHS definitely fits in 512 bits, and as long as one token is
        // not 2^68 times as valuable as another. Of course the other terms
        // leave some leeway, too; if the exchange rate is this high, then the
        // Bento share count is very unlikely to take up the full 128 bits.
        //
        // "Full" multiplication is not very expensive or cumbersome; the case
        // where `exchangeRate` is too big is a little more involved, but
        // manageable.

        Rebase memory _totalDebt = totalDebt;
        Rebase memory bentoBoxTotals = bentoBox.totals(collateral);

        (uint256 leftLo, uint256 leftHi) = FullMath.fullMul(
            collateralShare * bentoBoxTotals.elastic,
            // Cast needed to avoid uint128 overflow
            uint256(accrueInfo.COLLATERALIZATION_RATE_BPS) * _totalDebt.base * 1e14
        );
        uint256 rightLo;
        uint256 rightHi;
        if (_exchangeRate <= type(uint128).max) {
            (rightLo, rightHi) = FullMath.fullMul(debtPart * _totalDebt.elastic, _exchangeRate * bentoBoxTotals.base);
        } else {
            // We multiply it out in stages to be safe. If the total overflows
            // 512 bits then we are done, as the LHS is guaranteed to be less.
            //
            //               aHi * 2^256 + aLo =                    dp * De * Bb
            // -----------------------------------------------------------------
            // The total is then the sum of:
            //
            // bHi * 2^512 + bLo * 2^256       = xr * aHi * 2^256
            //               cHi * 2^256 + cLo = xr *               aLo
            //
            (uint256 aLo, uint256 aHi) = FullMath.fullMul(debtPart * _totalDebt.elastic, bentoBoxTotals.base);
            (uint256 bLo, uint256 bHi) = FullMath.fullMul(_exchangeRate, aHi);
            if (bHi > 0) {
                return false;
            }

            uint256 cHi; // (cLo is rightLo)
            (rightLo, cHi) = FullMath.fullMul(_exchangeRate, aLo);
            rightHi = cHi + bLo;
            if (rightHi < cHi) {
                return false;
            }
        }
        return leftHi > rightHi || (leftHi == rightHi && leftLo >= rightLo);
    }

    /// @dev Checks if the borrower is solvent in the closed liquidation case at the end of the function body.
    modifier solvent() {
        _;
        require(_isSolvent(msg.sender, exchangeRate), "PrivatePool: borrower insolvent");
    }

    /// @notice Gets the exchange rate. I.e how much collateral to buy 1e18 asset.
    /// This function is supposed to be invoked if needed because Oracle queries can be expensive.
    /// @return updated True if `exchangeRate` was updated.
    /// @return rate The new exchange rate.
    function updateExchangeRate() public returns (bool updated, uint256 rate) {
        (updated, rate) = oracle.get(oracleData);

        if (updated) {
            exchangeRate = rate;
            emit LogExchangeRate(rate);
        } else {
            // Return the old rate if fetching wasn't successful
            rate = exchangeRate;
        }
    }

    /// @dev Helper function to move tokens.
    /// @param token The ERC-20 token.
    /// @param share The amount in shares to add.
    /// @param total Grand total amount to deduct from this contract's balance. Only applicable if `skim` is True.
    /// Only used for accounting checks.
    /// @param skim If True, only does a balance check on this contract.
    /// False if tokens from msg.sender in `bentoBox` should be transferred.
    function _addTokens(
        IERC20 token,
        uint256 share,
        uint256 total,
        bool skim
    ) internal {
        if (skim) {
            require(share <= bentoBox.balanceOf(token, address(this)).sub(total), "PrivatePool: skim too much");
        } else {
            bentoBox.transfer(token, msg.sender, address(this), share);
        }
    }

    /// @notice Adds `collateral` from msg.sender to the account `to`.
    /// @param to The receiver of the tokens.
    /// @param skim True if the amount should be skimmed from the deposit balance of msg.sender.
    /// False if tokens from msg.sender in `bentoBox` should be transferred.
    /// @param share The amount of shares to add for `to`.
    function addCollateral(
        address to,
        bool skim,
        uint256 share
    ) public {
        uint256 supplied = userCollateralShare[to];
        require(supplied > 0 || approvedBorrowers[to], "PrivatePool: unapproved borrower");

        // No overflow: the total for ALL users fits in 128 bits, or the
        // BentoBox transfer (_addTokens) fails.
        userCollateralShare[to] = supplied + share;
        CollateralBalance memory _collateralBalance = collateralBalance;
        // No overflow: the sum fits in the BentoBox total
        uint256 prevTotal = _collateralBalance.userTotalShare + _collateralBalance.feesEarnedShare;
        // No overflow if cast safe: fits in the BentoBox or _addTokens reverts
        // Cast safe: _addTokens does not truncate the value
        collateralBalance.userTotalShare = _collateralBalance.userTotalShare + uint128(share);
        _addTokens(collateral, share, prevTotal, skim);
        emit LogAddCollateral(skim ? address(bentoBox) : msg.sender, to, share);
    }

    /// @dev Concrete implementation of `removeCollateral`.
    function _removeCollateral(address to, uint256 share) internal {
        userCollateralShare[msg.sender] = userCollateralShare[msg.sender].sub(share);
        // No underflow: userTotalShare > userCollateralShare[msg.sender]
        // Cast safe: Bento transfer reverts if it is not.
        collateralBalance.userTotalShare -= uint128(share);
        emit LogRemoveCollateral(msg.sender, to, share);
        bentoBox.transfer(collateral, address(this), to, share);
    }

    /// @notice Removes `share` amount of collateral and transfers it to `to`.
    /// @param to The receiver of the shares.
    /// @param share Amount of shares to remove.
    function removeCollateral(address to, uint256 share) public solvent {
        // accrue must be called because we check solvency
        accrue();
        _removeCollateral(to, share);
    }

    /// @param skim True if the amount should be skimmed from the deposit balance of msg.sender.
    /// @param toReservesShare Amount of shares to reserves.
    /// @param toReservesAmount Token amount. Ignored if `toReservesShare` nonzero.
    /// @param toFeesAmount Token fee amount. Ignored if `toReservesShare` nonzero.
    function _receiveAsset(
        bool skim,
        uint256 toReservesShare,
        // (There is no case where we pass along a fee in shares)
        uint256 toReservesAmount,
        uint256 toFeesAmount
    ) internal {
        IERC20 _asset = asset;
        AssetBalance memory _assetBalance = assetBalance;
        uint256 priorAssetTotalShare = _assetBalance.reservesShare + _assetBalance.feesEarnedShare;
        Rebase memory bentoBoxTotals = bentoBox.totals(_asset);

        uint256 toFeesShare = 0;
        if (toReservesShare == 0) {
            toReservesShare = bentoBoxTotals.toBase(toReservesAmount, true);
            if (toFeesAmount > 0) {
                toFeesShare = bentoBoxTotals.toBase(toFeesAmount, false);
            }
        }
        uint256 takenShare = toReservesShare.add(toFeesShare);

        if (_assetBalance.reservesShare == 0) {
            uint256 _feesOwedAmount = feesOwedAmount;
            if (_feesOwedAmount > 0) {
                uint256 feesOwedShare = bentoBoxTotals.toBase(_feesOwedAmount, false);
                // New fees cannot pay off existing fees:
                if (toReservesShare < feesOwedShare) {
                    feesOwedAmount = bentoBoxTotals.toElastic(feesOwedShare - toReservesShare, false);
                    _assetBalance.feesEarnedShare += uint128(takenShare);
                } else {
                    feesOwedAmount = 0;
                    // No overflow: assuming the transfer at the end succeeds:
                    //     feesOwedShare <= toReservesShare <= (Bento balance),
                    _assetBalance.feesEarnedShare += uint128(feesOwedShare + toFeesShare);
                    _assetBalance.reservesShare = uint128(toReservesShare - feesOwedShare);
                }
            } else {
                _assetBalance.reservesShare = uint128(toReservesShare);
                _assetBalance.feesEarnedShare += uint128(toFeesShare);
            }
        } else {
            _assetBalance.reservesShare += uint128(toReservesShare);
            _assetBalance.feesEarnedShare += uint128(toFeesShare);
        }
        assetBalance = _assetBalance;

        _addTokens(_asset, takenShare, priorAssetTotalShare, skim);
    }

    /// @dev Concrete implementation of `addAsset`.
    function _addAsset(bool skim, uint256 share) internal {
        _receiveAsset(skim, share, 0, 0);
        emit LogAddAsset(skim ? address(bentoBox) : msg.sender, share);
    }

    /// @notice Adds assets to the lending pair.
    /// @param skim True if the amount should be skimmed from the deposit balance of msg.sender.
    /// False if tokens from msg.sender in `bentoBox` should be transferred.
    /// @param share The amount of shares to add.
    function addAsset(bool skim, uint256 share) public {
        accrue();
        _addAsset(skim, share);
    }

    /// @dev Concrete implementation of `removeAsset`.
    function _removeAsset(address to, uint256 share) internal {
        require(msg.sender == lender, "PrivatePool: not the lender");
        // Cast safe: Bento transfer reverts unless stronger condition holds
        assetBalance.reservesShare = assetBalance.reservesShare.sub(uint128(share));
        bentoBox.transfer(asset, address(this), to, share);
        emit LogRemoveAsset(to, share);
    }

    /// @notice Removes an asset from msg.sender and transfers it to `to`.
    /// @param to The address that receives the removed assets.
    /// @param share The amount of shares to remove.
    function removeAsset(address to, uint256 share) public {
        accrue();
        _removeAsset(to, share);
    }

    /// @dev Concrete implementation of `borrow`.
    function _borrow(address to, uint256 amount) internal returns (uint256 part, uint256 share) {
        require(approvedBorrowers[msg.sender], "PrivatePool: unapproved borrower");
        IERC20 _asset = asset;
        Rebase memory bentoBoxTotals = bentoBox.totals(_asset);
        AccrueInfo memory _accrueInfo = accrueInfo;

        share = bentoBoxTotals.toBase(amount, false);

        // No overflow: `share` is not modified any more, and fits in the
        // BentoBox shares total if the transfer succeeds. But then "amount"
        // must fit in the token total; at least up to some rounding error,
        // which cannot be more than 128 bits either.
        uint256 openFeeAmount = (amount * _accrueInfo.BORROW_OPENING_FEE_BPS) / BPS;
        // No overflow: Same reason. Also, we just divided by BPS..
        uint256 protocolFeeAmount = (openFeeAmount * PROTOCOL_FEE_BPS) / BPS;
        uint256 protocolFeeShare = bentoBoxTotals.toBase(protocolFeeAmount, false);

        // The protocol component of the opening fee cannot be owed:
        AssetBalance memory _assetBalance = assetBalance;
        // No overflow on the add: protocolFeeShare < share < Bento total, or
        // the transfer reverts. The transfer is independent of the results of
        // these calculations: `share` is not modified.
        // Theoretically the fee could just make it overflow 128 bits.
        // Underflow check is core business logic:
        _assetBalance.reservesShare = _assetBalance.reservesShare.sub((share + protocolFeeShare).to128());
        // Cast is safe: `share` fits. Also, the checked cast above succeeded.
        // No overflow: protocolFeeShare < reservesShare, and both balances
        // together fit in the Bento share balance,
        _assetBalance.feesEarnedShare += uint128(protocolFeeShare);
        assetBalance = _assetBalance;

        // No overflow (inner add): amount fits in 128 bits, as shown before,
        // and openFeeAmount is less.
        (totalDebt, part) = totalDebt.add(amount + openFeeAmount, true);
        // No overflow: totalDebt.base is the sum of all borrowerDebtParts,
        //              fits in 128 bits and just had "part" added to it.
        borrowerDebtPart[msg.sender] += part;
        emit LogBorrow(msg.sender, to, amount, openFeeAmount, part);

        bentoBox.transfer(_asset, address(this), to, share);
    }

    /// @notice Sender borrows `amount` and transfers it to `to`.
    /// @return part Total part of the debt held by borrowers.
    /// @return share Total amount in shares borrowed.
    function borrow(address to, uint256 amount) public solvent returns (uint256 part, uint256 share) {
        accrue();
        (part, share) = _borrow(to, amount);
    }

    /// @dev Concrete implementation of `repay`.
    function _repay(
        address to,
        bool skim,
        uint256 part
    ) internal returns (uint256 amount) {
        (totalDebt, amount) = totalDebt.sub(part, true);
        borrowerDebtPart[to] = borrowerDebtPart[to].sub(part);
        _receiveAsset(skim, 0, amount, 0);
        emit LogRepay(skim ? address(bentoBox) : msg.sender, to, amount, part);
    }

    /// @notice Repays a loan.
    /// @param to Address of the borrower this payment should go.
    /// @param skim True if the amount should be skimmed from the deposit balance of msg.sender.
    /// False if tokens from msg.sender in `bentoBox` should be transferred.
    /// @param part The amount to repay as part. See `borrowerDebtPart`.
    /// @return amount The total amount repayed.
    function repay(
        address to,
        bool skim,
        uint256 part
    ) public returns (uint256 amount) {
        accrue();
        amount = _repay(to, skim, part);
    }

    // Functions that need accrue to be called
    uint8 internal constant ACTION_ADD_ASSET = 1;
    uint8 internal constant ACTION_REPAY = 2;
    uint8 internal constant ACTION_REMOVE_ASSET = 3;
    uint8 internal constant ACTION_REMOVE_COLLATERAL = 4;
    uint8 internal constant ACTION_BORROW = 5;
    uint8 internal constant ACTION_GET_REPAY_SHARE = 6;
    uint8 internal constant ACTION_GET_REPAY_PART = 7;
    uint8 internal constant ACTION_ACCRUE = 8;

    // Functions that don't need accrue to be called
    uint8 internal constant ACTION_ADD_COLLATERAL = 10;
    uint8 internal constant ACTION_UPDATE_EXCHANGE_RATE = 11;

    // Function on BentoBox
    uint8 internal constant ACTION_BENTO_DEPOSIT = 20;
    uint8 internal constant ACTION_BENTO_WITHDRAW = 21;
    uint8 internal constant ACTION_BENTO_TRANSFER = 22;
    uint8 internal constant ACTION_BENTO_TRANSFER_MULTIPLE = 23;
    uint8 internal constant ACTION_BENTO_SETAPPROVAL = 24;

    // Any external call (except to BentoBox)
    uint8 internal constant ACTION_CALL = 30;

    int256 internal constant USE_VALUE1 = -1;
    int256 internal constant USE_VALUE2 = -2;

    /// @dev Helper function for choosing the correct value (`value1` or `value2`) depending on `inNum`.
    function _num(
        int256 inNum,
        uint256 value1,
        uint256 value2
    ) internal pure returns (uint256 outNum) {
        outNum = inNum >= 0 ? uint256(inNum) : (inNum == USE_VALUE1 ? value1 : value2);
    }

    /// @dev Helper function for depositing into `bentoBox`.
    function _bentoDeposit(
        bytes memory data,
        uint256 value,
        uint256 value1,
        uint256 value2
    ) internal returns (uint256, uint256) {
        (IERC20 token, address to, int256 amount, int256 share) = abi.decode(data, (IERC20, address, int256, int256));
        amount = int256(_num(amount, value1, value2)); // Done this way to avoid stack too deep errors
        share = int256(_num(share, value1, value2));
        return bentoBox.deposit{value: value}(token, msg.sender, to, uint256(amount), uint256(share));
    }

    /// @dev Helper function to withdraw from the `bentoBox`.
    function _bentoWithdraw(
        bytes memory data,
        uint256 value1,
        uint256 value2
    ) internal returns (uint256, uint256) {
        (IERC20 token, address to, int256 amount, int256 share) = abi.decode(data, (IERC20, address, int256, int256));
        return bentoBox.withdraw(token, msg.sender, to, _num(amount, value1, value2), _num(share, value1, value2));
    }

    /// @dev Helper function to perform a contract call and eventually extracting revert messages on failure.
    /// Calls to `bentoBox` are not allowed for obvious security reasons.
    /// This also means that calls made from this contract shall *not* be trusted.
    function _call(
        uint256 value,
        bytes memory data,
        uint256 value1,
        uint256 value2
    ) internal returns (bytes memory, uint8) {
        (address callee, bytes memory callData, bool useValue1, bool useValue2, uint8 returnValues) = abi.decode(
            data,
            (address, bytes, bool, bool, uint8)
        );

        if (useValue1 && !useValue2) {
            callData = abi.encodePacked(callData, value1);
        } else if (!useValue1 && useValue2) {
            callData = abi.encodePacked(callData, value2);
        } else if (useValue1 && useValue2) {
            callData = abi.encodePacked(callData, value1, value2);
        }

        require(callee != address(bentoBox) && callee != address(this), "PrivatePool: can't call");

        (bool success, bytes memory returnData) = callee.call{value: value}(callData);
        require(success, "PrivatePool: call failed");
        return (returnData, returnValues);
    }

    struct CookStatus {
        bool needsSolvencyCheck;
        bool hasAccrued;
    }

    /// @notice Executes a set of actions and allows composability (contract calls) to other contracts.
    /// @param actions An array with a sequence of actions to execute (see ACTION_ declarations).
    /// @param values A one-to-one mapped array to `actions`. ETH amounts to send along with the actions.
    /// Only applicable to `ACTION_CALL`, `ACTION_BENTO_DEPOSIT`.
    /// @param datas A one-to-one mapped array to `actions`. Contains abi encoded data of function arguments.
    /// @return value1 May contain the first positioned return value of the last executed action (if applicable).
    /// @return value2 May contain the second positioned return value of the last executed action which returns 2 values (if applicable).
    function cook(
        uint8[] calldata actions,
        uint256[] calldata values,
        bytes[] calldata datas
    ) external payable returns (uint256 value1, uint256 value2) {
        CookStatus memory status;
        for (uint256 i = 0; i < actions.length; i++) {
            uint8 action = actions[i];
            if (!status.hasAccrued && action < 10) {
                accrue();
                status.hasAccrued = true;
            }
            if (action == ACTION_ADD_COLLATERAL) {
                (int256 share, address to, bool skim) = abi.decode(datas[i], (int256, address, bool));
                addCollateral(to, skim, _num(share, value1, value2));
            } else if (action == ACTION_ADD_ASSET) {
                (int256 share, bool skim) = abi.decode(datas[i], (int256, bool));
                _addAsset(skim, _num(share, value1, value2));
            } else if (action == ACTION_REPAY) {
                (int256 part, address to, bool skim) = abi.decode(datas[i], (int256, address, bool));
                _repay(to, skim, _num(part, value1, value2));
            } else if (action == ACTION_REMOVE_ASSET) {
                (int256 share, address to) = abi.decode(datas[i], (int256, address));
                _removeAsset(to, _num(share, value1, value2));
            } else if (action == ACTION_REMOVE_COLLATERAL) {
                (int256 share, address to) = abi.decode(datas[i], (int256, address));
                _removeCollateral(to, _num(share, value1, value2));
                status.needsSolvencyCheck = true;
            } else if (action == ACTION_BORROW) {
                (int256 amount, address to) = abi.decode(datas[i], (int256, address));
                (value1, value2) = _borrow(to, _num(amount, value1, value2));
                status.needsSolvencyCheck = true;
            } else if (action == ACTION_UPDATE_EXCHANGE_RATE) {
                (bool must_update, uint256 minRate, uint256 maxRate) = abi.decode(datas[i], (bool, uint256, uint256));
                (bool updated, uint256 rate) = updateExchangeRate();
                require((!must_update || updated) && rate > minRate && (maxRate == 0 || rate > maxRate), "PrivatePool: rate not ok");
            } else if (action == ACTION_BENTO_SETAPPROVAL) {
                (address user, address _masterContract, bool approved, uint8 v, bytes32 r, bytes32 s) = abi.decode(
                    datas[i],
                    (address, address, bool, uint8, bytes32, bytes32)
                );
                bentoBox.setMasterContractApproval(user, _masterContract, approved, v, r, s);
            } else if (action == ACTION_BENTO_DEPOSIT) {
                (value1, value2) = _bentoDeposit(datas[i], values[i], value1, value2);
            } else if (action == ACTION_BENTO_WITHDRAW) {
                (value1, value2) = _bentoWithdraw(datas[i], value1, value2);
            } else if (action == ACTION_BENTO_TRANSFER) {
                (IERC20 token, address to, int256 share) = abi.decode(datas[i], (IERC20, address, int256));
                bentoBox.transfer(token, msg.sender, to, _num(share, value1, value2));
            } else if (action == ACTION_BENTO_TRANSFER_MULTIPLE) {
                (IERC20 token, address[] memory tos, uint256[] memory shares) = abi.decode(datas[i], (IERC20, address[], uint256[]));
                bentoBox.transferMultiple(token, msg.sender, tos, shares);
            } else if (action == ACTION_CALL) {
                (bytes memory returnData, uint8 returnValues) = _call(values[i], datas[i], value1, value2);

                if (returnValues == 1) {
                    (value1) = abi.decode(returnData, (uint256));
                } else if (returnValues == 2) {
                    (value1, value2) = abi.decode(returnData, (uint256, uint256));
                }
            } else if (action == ACTION_GET_REPAY_SHARE) {
                int256 part = abi.decode(datas[i], (int256));
                value1 = bentoBox.toShare(asset, totalDebt.toElastic(_num(part, value1, value2), true), true);
            } else if (action == ACTION_GET_REPAY_PART) {
                int256 amount = abi.decode(datas[i], (int256));
                value1 = totalDebt.toBase(_num(amount, value1, value2), false);
            }
        }

        if (status.needsSolvencyCheck) {
            require(_isSolvent(msg.sender, exchangeRate), "PrivatePool: borrower insolvent");
        }
    }

    /// @notice Handles the liquidation of borrowers' balances, once the borrowers' amount of collateral is too low.
    /// @param borrowers An array of borrower addresses.
    /// @param maxDebtParts A one-to-one mapping to `borrowers`, contains maximum part (not token amount) of the debt that will be liquidated of the respective borrower.
    /// @param to Address of the receiver if `swapper` is zero.
    /// @param swapper Contract address of the `ISimpleSwapper` implementation.
    function liquidate(
        address[] calldata borrowers,
        uint256[] calldata maxDebtParts,
        address to,
        ISimpleSwapper swapper
    ) public {
        // Oracle can fail but we still need to allow liquidations
        (, uint256 _exchangeRate) = updateExchangeRate();
        accrue();

        AccrueInfo memory _accrueInfo = accrueInfo;
        require(block.timestamp >= _accrueInfo.EXPIRATION, "PrivatePool: no liquidation yet");

        uint256 allCollateralShare;
        uint256 allDebtAmount;
        uint256 allDebtPart;
        Rebase memory _totalDebt = totalDebt;
        Rebase memory bentoBoxTotals = bentoBox.totals(collateral);
        for (uint256 i = 0; i < borrowers.length; i++) {
            address borrower = borrowers[i];
            // If we set an expiration at all, then by the above check it is
            // now past and every borrower can be liquidated at the current
            // price:
            if ((_accrueInfo.EXPIRATION > 0) || !_isSolvent(borrower, _exchangeRate)) {
                uint256 debtPart;
                {
                    uint256 availableDebtPart = borrowerDebtPart[borrower];
                    debtPart = maxDebtParts[i] > availableDebtPart ? availableDebtPart : maxDebtParts[i];
                    // No underflow: ensured by definition of debtPart
                    borrowerDebtPart[borrower] = availableDebtPart - debtPart;
                }
                uint256 debtAmount = _totalDebt.toElastic(debtPart, false);
                // No overflow (inner): debtAmount <= totalDebt.elastic < 2^128.
                // The exchange rate need not be reasonable: with an expiration
                // time set there is no _isSolvent() call.
                uint256 collateralShare = bentoBoxTotals.toBase(
                    (debtAmount * _accrueInfo.LIQUIDATION_MULTIPLIER_BPS).mul(_exchangeRate) / (BPS * EXCHANGE_RATE_PRECISION),
                    false
                );

                // This needs to be updated here so that the same user cannot
                // be liquidated more than once. (Unless it adds up to one
                // "full" liquidation or less).
                // Underflow check is business logic: the liquidator can only
                // take enough to cover the loan (and bonus).
                userCollateralShare[borrower] = userCollateralShare[borrower].sub(collateralShare);

                if (_accrueInfo.LIQUIDATION_SEIZE_COLLATERAL) {
                    emit LogSeizeCollateral(borrower, collateralShare, debtAmount, debtPart);
                } else {
                    emit LogRemoveCollateral(borrower, swapper == ISimpleSwapper(0) ? to : address(swapper), collateralShare);
                    emit LogRepay(swapper == ISimpleSwapper(0) ? msg.sender : address(swapper), borrower, debtAmount, debtPart);
                }

                // No overflow in the below three:
                //
                // share(s) / amount(s) / part(s) involved in liquidation
                //      <= total share / amount / part
                //      <= (Bento).base / totalDebt.elastic / totalDebt.base
                //      <  2^128
                //
                // Collateral share and debt part have already been
                // successfully subtracted from some user's balance (and this
                // persists across loop runs); the calculation for debt amount
                // rounds down, so it fits if debtPart fits. It follows that
                // the condition holds for the accumulated sums.
                allCollateralShare += collateralShare;
                allDebtAmount += debtAmount;
                allDebtPart += debtPart;
            }
        }
        require(allDebtAmount != 0, "PrivatePool: all are solvent");
        // No overflow (both): (liquidated debt) <= (total debt).
        // Cast is safe (both): (liquidated debt) <= (total debt) < 2^128
        _totalDebt.elastic -= uint128(allDebtAmount);
        _totalDebt.base -= uint128(allDebtPart);
        totalDebt = _totalDebt;

        if (_accrueInfo.LIQUIDATION_SEIZE_COLLATERAL) {
            // As with normal liquidations, the liquidator gets the excess, the
            // protocol gets a cut of the excess, and the lender gets 100% of
            // the value of the loan.
            // allCollateralShare already includes the bonus, which in turn
            // includes the protocol fee. We round the bonus down to favor the
            // lender, and the fee to favor the liquidator:
            // Math: All collateral fits in 128 bits (BentoBox), so the
            // multiplications are safe:
            uint256 excessShare = (allCollateralShare * (_accrueInfo.LIQUIDATION_MULTIPLIER_BPS - BPS)) /
                _accrueInfo.LIQUIDATION_MULTIPLIER_BPS;
            uint256 feeShare = (excessShare * PROTOCOL_FEE_BPS) / BPS;
            uint256 lenderShare = allCollateralShare - excessShare;
            // (Stack depth): liquidatorShare = excessShare - feeShare;

            {
                CollateralBalance memory _collateralBalance = collateralBalance;
                // No underflow: All amounts fit in the collateral Bento total
                _collateralBalance.userTotalShare -= uint128(excessShare);
                _collateralBalance.feesEarnedShare += uint128(feeShare);
                collateralBalance = _collateralBalance;
            }
            userCollateralShare[lender] += lenderShare;
            bentoBox.transfer(collateral, address(this), to, excessShare - feeShare);
        } else {
            // No underflow: allCollateralShare is the sum of quantities that
            //               have successfully been taken out of user balances.
            // Cast is safe: Above reason, and userTotalShare < 2^128
            collateralBalance.userTotalShare -= uint128(allCollateralShare);

            // Charge the protocol fee over the excess.
            // No overflow:
            //  allDebtAmount <= totalDebt.elastic < 2^128 (proof in loop)
            //  LIQUIDATION_MULTIPLIER_BPS < 2^16
            //  PROTOCOL_FEE_BPS <= 10k < 2^14 (or we have bigger problems)
            uint256 feeAmount = (allDebtAmount * (_accrueInfo.LIQUIDATION_MULTIPLIER_BPS - BPS) * PROTOCOL_FEE_BPS) / (BPS * BPS);

            // Swap using a swapper freely chosen by the caller
            // Open (flash) liquidation: get proceeds first and provide the
            // borrow after
            bentoBox.transfer(collateral, address(this), swapper == ISimpleSwapper(0) ? to : address(swapper), allCollateralShare);
            if (swapper != ISimpleSwapper(0)) {
                // TODO: Somehow split _receiveAsset to reduce loads?
                IERC20 _asset = asset;
                swapper.swap(
                    collateral,
                    _asset,
                    msg.sender,
                    bentoBox.toShare(_asset, allDebtAmount.add(feeAmount), true),
                    allCollateralShare
                );
            }
            _receiveAsset(false, 0, allDebtAmount, feeAmount);
        }
    }

    /// @notice Withdraws the fees accumulated.
    function withdrawFees() public {
        accrue();
        address to = masterContract.feeTo();

        uint256 assetShare = assetBalance.feesEarnedShare;
        if (assetShare > 0) {
            bentoBox.transfer(asset, address(this), to, assetShare);
            assetBalance.feesEarnedShare = 0;
        }

        uint256 collateralShare = collateralBalance.feesEarnedShare;
        if (collateralShare > 0) {
            bentoBox.transfer(collateral, address(this), to, collateralShare);
            collateralBalance.feesEarnedShare = 0;
        }

        emit LogWithdrawFees(to, assetShare, collateralShare);
    }

    /// @notice Sets the beneficiary of fees accrued in liquidations.
    /// MasterContract Only Admin function.
    /// @param newFeeTo The address of the receiver.
    function setFeeTo(address newFeeTo) public onlyOwner {
        feeTo = newFeeTo;
        emit LogFeeTo(newFeeTo);
    }
}
