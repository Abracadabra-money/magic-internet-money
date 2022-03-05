// SPDX-License-Identifier: UNLICENSED

// Private Pool (NFT collateral)

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
import "./interfaces/IERC721.sol";

/// @title NFTPair
/// @dev This contract allows contract calls to any contract (except BentoBox)
/// from arbitrary callers thus, don't trust calls from this contract in any circumstances.
contract NFTPair is BoringOwnable, IMasterContract {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using RebaseLibrary for Rebase;
    using BoringERC20 for IERC20;

    event LogRequestLoan(
        address indexed borrower,
        uint256 indexed tokenId,
        uint128 valuation,
        uint64 expiration,
        uint16 annualInterestBPS,
        uint8 compoundInterestTerms
    );
    event LogUpdateLoanParams(
        uint256 indexed tokenId,
        uint128 valuation,
        uint64 expiration,
        uint16 annualInterestBPS,
        uint8 compoundInterestTerms
    );
    // This automatically clears the associated loan, if any
    event LogRemoveCollateral(uint256 indexed tokenId, address recipient);
    // Details are in the loan request
    event LogLend(address indexed lender, uint256 indexed tokenId);
    event LogRepay(address indexed from, uint256 tokenId);
    event LogFeeTo(address indexed newFeeTo);
    event LogWithdrawFees(address indexed feeTo, uint256 feeShare);

    // Immutables (for MasterContract and all clones)
    IBentoBoxV1 public immutable bentoBox;
    NFTPair public immutable masterContract;

    // MasterContract variables
    address public feeTo;

    // Per clone variables
    // Clone init settings
    IERC721 public collateral;
    IERC20 public asset;

    // A note on terminology:
    // "Shares" are BentoBox shares.

    // Track assets we own. Used to allow skimming the excesss.
    uint256 feesEarnedShare;

    // Per token settings.
    struct TokenLoanParams {
        uint128 valuation; // How much will you get? OK to owe until expiration.
        uint64 expiration; // Pay before this or get liquidated
        uint16 annualInterestBPS; // Variable cost of taking out the loan
        uint8 compoundInterestTerms; // Might as well. Stay under 50.
    }
    mapping(uint256 => TokenLoanParams) public tokenLoanParams;

    uint8 private constant LOAN_INITIAL = 0;
    uint8 private constant LOAN_REQUESTED = 1;
    uint8 private constant LOAN_OUTSTANDING = 2;
    struct TokenLoan {
        address borrower;
        address lender;
        uint64 startTime;
        uint8 status;
    }
    mapping(uint256 => TokenLoan) public tokenLoan;

    // Do not go over 100% on either of these..
    uint256 private constant PROTOCOL_FEE_BPS = 1000;
    uint256 private constant OPEN_FEE_BPS = 100;
    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 3600 * 24 * 365;

    /// @notice The constructor is only used for the initial master contract.
    /// @notice Subsequent clones are initialised via `init`.
    constructor(IBentoBoxV1 bentoBox_) public {
        bentoBox = bentoBox_;
        masterContract = this;
    }

    /// @notice De facto constructor for clone contracts
    function init(bytes calldata data) public payable override {
        require(address(collateral) == address(0), "NFTPair: already initialized");
        (collateral, asset) = abi.decode(data, (IERC721, IERC20));
        require(address(collateral) != address(0), "NFTPair: bad pair");
    }

    // TODO: Somehow merge this with `updateLoanParams`
    function updateLoanParams(uint256 tokenId, TokenLoanParams memory params) public {
        TokenLoan memory loan = tokenLoan[tokenId];
        if (loan.status == LOAN_OUTSTANDING) {
            // The lender can change terms so long as the changes are strictly
            // the same or better for the borrower:
            require(msg.sender == loan.lender, "NFTPair: not the lender");
            TokenLoanParams memory cur = tokenLoanParams[tokenId];
            require(
                params.expiration >= cur.expiration &&
                    params.valuation <= cur.valuation &&
                    params.annualInterestBPS <= cur.annualInterestBPS &&
                    params.compoundInterestTerms <= cur.compoundInterestTerms,
                "NFTPair: worse params"
            );
        } else if (loan.status == LOAN_REQUESTED) {
            // The borrower has already deposited the collateral and can
            // change whatever they like
            require(msg.sender == loan.borrower, "NFTPair: not the borrower");
        } else {
            // The loan has not been taken out yet; the borrower needs to
            // provide collateral. (TODO: Do that here?)
            revert("NFTPair: no collateral");
        }
        tokenLoanParams[tokenId] = params;
        emit LogUpdateLoanParams(tokenId, params.valuation, params.expiration, params.annualInterestBPS, params.compoundInterestTerms);
    }

    /// @notice Deposit an NFT as collateral and request a loan against it
    /// @param tokenId ID of the NFT
    /// @param to Address to receive the loan, or option to withdraw collateral
    /// @param params Loan conditions on offer
    /// @param skim True if the token has already been transfered
    function requestLoan(
        uint256 tokenId,
        TokenLoanParams memory params,
        address to,
        bool skim
    ) public {
        // Edge case: valuation can be zero. That effectively gifts the NFT and
        // is therefore a bad idea, but does not break the contract.
        require(tokenLoan[tokenId].status == LOAN_INITIAL, "NFTPair: loan exists");
        if (skim) {
            require(collateral.ownerOf(tokenId) == address(this), "NFTPair: skim failed");
        } else {
            collateral.transferFrom(msg.sender, address(this), tokenId);
        }
        TokenLoan memory loan;
        loan.borrower = to;
        loan.status = LOAN_REQUESTED;
        tokenLoan[tokenId] = loan;
        tokenLoanParams[tokenId] = params;

        emit LogRequestLoan(to, tokenId, params.valuation, params.expiration, params.annualInterestBPS, params.compoundInterestTerms);
    }

    /// @notice Removes `tokenId` as collateral and transfers it to `to`.
    /// @notice This destroys the loan.
    /// @param tokenId The token
    /// @param to The receiver of the token.
    function removeCollateral(uint256 tokenId, address to) public {
        TokenLoan memory loan = tokenLoan[tokenId];
        if (loan.status == LOAN_REQUESTED) {
            // We are withdrawing collateral that is not in use:
            require(msg.sender == loan.borrower, "NFTPair: not the borrower");
        } else if (loan.status == LOAN_OUTSTANDING) {
            // We are seizing collateral as the lender. The loan has to be
            // expired and not paid off:
            require(msg.sender == loan.lender, "NFTPair: not the lender");
            require(tokenLoanParams[tokenId].expiration <= block.timestamp, "NFTPair: not expired");
        }
        // If there somehow is collateral but no accompanying loan, then anyone
        // can claim it by first requesting a loan with `skim` set to true, and
        // then withdrawing. So we might as well allow it here..
        delete tokenLoan[tokenId];
        collateral.transferFrom(address(this), to, tokenId);
        emit LogRemoveCollateral(tokenId, to);
    }

    /// @notice Lends with the parameters specified by the borrower.
    /// @param tokenId ID of the token that will function as collateral
    /// @param accepted Loan parameters as the lender saw them, for security
    /// @param skim True if the assets have been transfered to the cauldron
    function lend(
        uint256 tokenId,
        TokenLoanParams memory accepted,
        bool skim
    ) public {
        TokenLoan memory loan = tokenLoan[tokenId];
        require(loan.status == LOAN_REQUESTED, "NFTPair: not available");
        TokenLoanParams memory params = tokenLoanParams[tokenId];

        // Valuation has to be an exact match, everything else must be at least
        // as good for the lender as `accepted`.
        require(
            params.valuation == accepted.valuation &&
                params.expiration <= accepted.expiration &&
                params.annualInterestBPS >= accepted.annualInterestBPS &&
                params.compoundInterestTerms >= accepted.compoundInterestTerms,
            "NFTPair: bad params"
        );

        uint256 totalShare = bentoBox.toShare(asset, params.valuation, false);
        // No overflow: at most 128 + 16 bits (fits in BentoBox)
        uint256 protocolFeeShare = (totalShare * OPEN_FEE_BPS) / BPS;

        if (skim) {
            require(bentoBox.balanceOf(asset, address(this)) >= (totalShare + feesEarnedShare), "NFTPair: skim too much");
        } else {
            bentoBox.transfer(asset, msg.sender, address(this), totalShare);
        }
        // No underflow: follows from OPEN_FEE_BPS <= BPS
        uint256 borrowerShare = totalShare - protocolFeeShare;
        bentoBox.transfer(asset, address(this), loan.borrower, borrowerShare);
        // No overflow: addends (and result) must fit in BentoBox
        feesEarnedShare += protocolFeeShare;

        loan.lender = msg.sender;
        loan.status = LOAN_OUTSTANDING;
        loan.startTime = uint64(block.timestamp); // Do not use in 12e10 years..
        tokenLoan[tokenId] = loan;

        emit LogLend(msg.sender, tokenId);
    }

    /// Approximates continuous compounding. Uses Horner's method to evaluate
    /// the truncated Maclaurin series for exp - 1, accumulating rounding
    /// errors along the way. The following is always guaranteed:
    ///
    ///   principal * time * apr <= result <= principal * (e^(time * apr) - 1),
    ///
    /// where time = t/YEAR, but once the result no longer fits in 128 bits it
    /// may be very inaccurate. Which does not matter, because the BentoBox
    /// cannot hold that high a balance.
    ///
    /// @param n Highest order term. Set n=1 (or 0) for linear interest only.
    function calculateInterest(
        uint256 principal,
        uint256 t,
        uint256 aprBPS,
        uint256 n
    ) public pure returns (uint256 interest) {
        // These calculations can, in principle, overflow, given sufficiently
        // ridiculous inputs, as shown in the following table:
        //
        //      principal = 2^128 - 1       (128 bits)
        //      t         = 30,000 years    (40 bits)
        //      interest  = 655.35% APR     (16 bits)
        //
        // Even then, we will not see an overflow until after the fifth term:
        //
        // k        denom > 2^   term * x <= 2^     term * x / denom <= 2^
        // ---------------------------------------------------------------
        // 1        38           128 + 56 = 184     184 - 38 = 146
        // 2        39           146 + 56 = 202     202 - 39 = 163
        // 3        40           163 + 56 = 219     219 - 40 = 179
        // 4        42           179 + 56 = 235     235 - 42 = 193
        // 5        45           193 + 56 = 249     249 - 45 = 204
        //
        // (Denominator bits: floor (lg (k! * 10_000 * YEAR)) )
        //
        // To be fair, five terms would not adequately capture the effects of
        // this much compound interest over this time period. On the high end
        // of actual usage we expect to see, it does, and there is no overflow:
        //
        //      principal = 1 billion ether (1e27)          (90 bits)
        //      t         = 5 years (~158 million seconds)  (28 bits)
        //      apr       = 30%                             (12 bits)
        //
        // k        denom > 2^   term * x <= 2^     term * x / denom <= 2^
        // ---------------------------------------------------------------
        // 1        38           90 + 40 = 130      130 - 38 = 92
        // 2        39           92 + 40 = 132      132 - 39 = 93
        // 3        40           93 + 40 = 133      133 - 40 = 93
        // 4        42           93 + 40 = 133      133 - 42 = 91
        //
        // ..and from here on, the terms keep getting smaller; the factorial in
        // the denominator "wins". Indeed, the result is dominated by the "2"
        // and "3" terms: the partial sums are:
        //
        // n            Σ_1..n (1.5^k / k!)
        // --------------------------------------
        // 1            1.5
        // 2            2.625
        // 3            3.1875
        // 4            3.3984375
        // 5            3.46171875
        // ...
        // (Infinity)   3.48168907... (e^1.5 - 1)
        //
        // Finally: the denominator overflows at n = 51; n = 50 is "safe"
        // but useless; if we need that many terms, interest is high enough
        // to be unpayable.
        // However, n >= 252 is not safe; 10_000 * YEAR * 252! = 0 mod 2^256.
        //
        // Since even abnormal values will result in a few "valid" terms that
        // are enough to make the interest unpayably high, it suffices to check
        // that the total cannot go down (final `add`). If that calculation
        // overflows, then reverting is no worse than anything else we may do.
        //
        uint256 x = t * aprBPS;
        uint256 denom = YEAR * BPS;
        uint256 term = (principal * x) / denom;
        interest = term;
        for (uint256 k = 2; k <= n; k++) {
            term *= x; // Safe: See above.
            denom *= k; // Fits up to k = 50; no problem after
            term /= denom; // Safe until k = 251
            interest = interest.add(term); // <- Only overflow check we need
        }
    }

    function repay(uint256 tokenId, bool skim) public returns (uint256 amount) {
        TokenLoan memory loan = tokenLoan[tokenId];
        require(loan.status == LOAN_OUTSTANDING, "NFTPair: no loan");
        TokenLoanParams memory loanParams = tokenLoanParams[tokenId];
        require(loanParams.expiration > block.timestamp, "NFTPair: loan expired");

        uint256 principal = loanParams.valuation;

        // No underflow: loan.startTime is only ever set to a block timestamp
        uint256 interest = calculateInterest(
            principal,
            block.timestamp - loan.startTime,
            loanParams.annualInterestBPS,
            loanParams.compoundInterestTerms
        ).to128();
        uint256 fee = (interest * PROTOCOL_FEE_BPS) / BPS;
        // No overflow (both lines): to128() would have reverted
        amount = principal + interest;

        uint256 totalShare = bentoBox.toShare(asset, amount, false);
        uint256 feeShare = bentoBox.toShare(asset, fee, false);

        address from;
        if (skim) {
            require(bentoBox.balanceOf(asset, address(this)) >= (totalShare + feesEarnedShare), "NFTPair: skim too much");
            from = address(this);
            // No overflow: result fits in BentoBox
        } else {
            bentoBox.transfer(asset, msg.sender, address(this), feeShare);
            from = msg.sender;
        }
        // No underflow: PROTOCOL_FEE_BPS < BPS by construction.
        feesEarnedShare += feeShare;
        delete tokenLoan[tokenId];

        bentoBox.transfer(asset, from, loan.lender, totalShare - feeShare);
        collateral.transferFrom(address(this), loan.borrower, tokenId);

        emit LogRepay(from, tokenId);
    }

    uint8 internal constant ACTION_REPAY = 2;
    uint8 internal constant ACTION_REMOVE_COLLATERAL = 4;

    uint8 internal constant ACTION_REQUEST_LOAN = 12;

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

        require(callee != address(bentoBox) && callee != address(this), "NFTPair: can't call");

        (bool success, bytes memory returnData) = callee.call{value: value}(callData);
        require(success, "NFTPair: call failed");
        return (returnData, returnValues);
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
        for (uint256 i = 0; i < actions.length; i++) {
            uint8 action = actions[i];
            if (action == ACTION_REPAY) {
                (uint256 tokenId, bool skim) = abi.decode(datas[i], (uint256, bool));
                repay(tokenId, skim);
            } else if (action == ACTION_REMOVE_COLLATERAL) {
                (uint256 tokenId, address to) = abi.decode(datas[i], (uint256, address));
                removeCollateral(tokenId, to);
            } else if (action == ACTION_REQUEST_LOAN) {
                (uint256 tokenId, TokenLoanParams memory params, address to, bool skim) = abi.decode(
                    datas[i],
                    (uint256, TokenLoanParams, address, bool)
                );
                requestLoan(tokenId, params, to, skim);
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
            }
        }
    }

    /// @notice Withdraws the fees accumulated.
    function withdrawFees() public {
        address to = masterContract.feeTo();

        uint256 _share = feesEarnedShare;
        if (_share > 0) {
            bentoBox.transfer(asset, address(this), to, _share);
            feesEarnedShare = 0;
        }

        emit LogWithdrawFees(to, _share);
    }

    /// @notice Sets the beneficiary of fees accrued in liquidations.
    /// MasterContract Only Admin function.
    /// @param newFeeTo The address of the receiver.
    function setFeeTo(address newFeeTo) public onlyOwner {
        feeTo = newFeeTo;
        emit LogFeeTo(newFeeTo);
    }
}
