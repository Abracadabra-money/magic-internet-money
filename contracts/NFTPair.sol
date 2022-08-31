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
import "@boringcrypto/boring-solidity/contracts/libraries/BoringRebase.sol";
import "@boringcrypto/boring-solidity/contracts/Domain.sol";
import "@boringcrypto/boring-solidity/contracts/interfaces/IMasterContract.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "./interfaces/IBentoBoxV1Interface.sol";
import "./interfaces/IERC721.sol";
import "./interfaces/ILendingClub.sol";
import {INFTBuyer} from "./interfaces/INFTBuyer.sol";
import {INFTSeller} from "./interfaces/INFTSeller.sol";
import "./interfaces/INFTPair.sol";

/// @title NFTPair
/// @dev This contract allows contract calls to any contract (except BentoBox)
/// from arbitrary callers thus, don't trust calls from this contract in any circumstances.
contract NFTPair is BoringOwnable, Domain, IMasterContract {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using RebaseLibrary for Rebase;
    using BoringERC20 for IERC20;

    event LogRequestLoan(address indexed borrower, uint256 indexed tokenId, TokenLoanParams params);
    event LogUpdateLoanParams(uint256 indexed tokenId, TokenLoanParams params);
    // This automatically clears the associated loan, if any
    event LogRemoveCollateral(uint256 indexed tokenId, address recipient);
    // Details are in the loan request
    event LogLend(address indexed lender, address indexed borrower, uint256 indexed tokenId, TokenLoanParams params);
    event LogRepay(address indexed from, uint256 indexed tokenId);
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
    uint256 public feesEarnedShare;

    // Per token settings.
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
    uint256 private constant YEAR_BPS = 3600 * 24 * 365 * 10_000;

    // Highest order term in the Maclaurin series for exp used by
    // `calculateInterest`.
    // Intuitive interpretation: interest continuously accrues on the principal.
    // That interest, in turn, earns "second-order" interest-on-interest, which
    // itself earns "third-order" interest, etc. This constant determines how
    // far we take this until we stop counting.
    //
    // The error, in terms of the interest rate, is at least
    //
    //            ----- n                        ----- Infinity
    //             \           x^k                \              x^k
    //      e^x -   )          ---   , which is    )             --- ,
    //             /            k!                /               k!
    //            ----- k = 1       k            ----- k = n + 1
    //
    // where n = COMPOUND_INTEREST_TERMS, and x = rt is the total amount of
    // interest that is owed at rate r over time t. It makes no difference if
    // this is, say, 5%/year for 10 years, or 50% in one year; the calculation
    // is the same. Why "at least"? There are also rounding errors. See
    // `calculateInterest` for more detail.
    // The factorial in the denominator "wins"; for all reasonable (and quite
    // a few unreasonable) interest rates, the lower-order terms contribute the
    // most to the total. The following table lists some of the calculated
    // approximations for different values of n, along with the "true" result:
    //
    // Total:         10%    20%    50%    100%    200%      500%       1000%
    // -----------------------------------------------------------------------
    // n = 1:         10.0%  20.0%  50.0%  100.0%  200.0%    500.0%     1000.0%
    // n = 2:         10.5%  22.0%  62.5%  150.0%  400.0%   1750.0%     6000.0%
    // n = 3:         10.5%  22.1%  64.6%  166.7%  533.3%   3833.3%    22666.7%
    // n = 4:         10.5%  22.1%  64.8%  170.8%  600.0%   6437.5%    64333.3%
    // n = 5:         10.5%  22.1%  64.9%  171.7%  626.7%   9041.7%   147666.7%
    // n = 6:         10.5%  22.1%  64.9%  171.8%  635.6%  11211.8%   286555.6%
    // n = 7:         10.5%  22.1%  64.9%  171.8%  638.1%  12761.9%   484968.3%
    // n = 8:         10.5%  22.1%  64.9%  171.8%  638.7%  13730.7%   732984.1%
    // n = 9:         10.5%  22.1%  64.9%  171.8%  638.9%  14268.9%  1008557.3%
    // n = 10:        10.5%  22.1%  64.9%  171.8%  638.9%  14538.1%  1284130.5%
    //
    // (n=Infinity):  10.5%  22.1%  64.9%  171.8%  638.9%  14741.3%  2202546.6%
    //
    // For instance, calculating the compounding effects of 200% in "total"
    // interest to the sixth order results in 635.6%, whereas the true result
    // is 638.9%.
    // At 500% that difference is a little more dramatic, but it is still in
    // the same ballpark -- and of little practical consequence unless the
    // collateral can be expected to go up more than 112 times in value.
    // Still, for volatile tokens, or an asset that is somehow known to be very
    // inflationary, use a different number.
    // Zero (no interest at all) is ignored and treated as one (linear only).
    uint8 private constant COMPOUND_INTEREST_TERMS = 6;

    // For signed lend / borrow requests:
    mapping(address => uint256) public nonces;

    /// @notice The constructor is only used for the initial master contract.
    /// @notice Subsequent clones are initialised via `init`.
    constructor(IBentoBoxV1 bentoBox_) public {
        bentoBox = bentoBox_;
        masterContract = this;
    }

    /// @notice De facto constructor for clone contracts
    function init(bytes calldata data) external payable override {
        require(address(collateral) == address(0), "NFTPair: already initialized");
        (collateral, asset) = abi.decode(data, (IERC721, IERC20));
        require(address(collateral) != address(0), "NFTPair: bad pair");
    }

    /// @param tokenId The token ID of the loan in question
    /// @param params The desired new loan parameters
    function updateLoanParams(uint256 tokenId, TokenLoanParams memory params) external {
        TokenLoan memory loan = tokenLoan[tokenId];
        if (loan.status == LOAN_OUTSTANDING) {
            // The lender can change terms so long as the changes are strictly
            // the same or better for the borrower:
            require(msg.sender == loan.lender, "NFTPair: not the lender");
            TokenLoanParams memory cur = tokenLoanParams[tokenId];
            require(
                params.duration >= cur.duration && params.valuation <= cur.valuation && params.annualInterestBPS <= cur.annualInterestBPS,
                "NFTPair: worse params"
            );
        } else if (loan.status == LOAN_REQUESTED) {
            // The borrower has already deposited the collateral and can
            // change whatever they like
            require(msg.sender == loan.borrower, "NFTPair: not the borrower");
        } else {
            // The loan has not been taken out yet; the borrower needs to
            // provide collateral.
            revert("NFTPair: no collateral");
        }
        tokenLoanParams[tokenId] = params;
        emit LogUpdateLoanParams(tokenId, params);
    }

    /// @notice It is the caller's responsibility to ensure skimmed tokens get accounted for somehow so they cannot be used twice.
    /// @notice It is the caller's responsibility to ensure `provider` consented to the specific transfer. (EIR-721 approval is not good enough).
    function _requireCollateral(
        address provider,
        uint256 tokenId,
        bool skim
    ) private {
        if (skim) {
            require(collateral.ownerOf(tokenId) == address(this), "NFTPair: skim failed");
        } else {
            collateral.transferFrom(provider, address(this), tokenId);
        }
    }

    /// @notice Deposit an NFT as collateral and request a loan against it
    /// @param tokenId ID of the NFT
    /// @param to Address to receive the loan, or option to withdraw collateral
    /// @param params Loan conditions on offer
    /// @param skim True if the token has already been transferred
    function requestLoan(
        uint256 tokenId,
        TokenLoanParams memory params,
        address to,
        bool skim
    ) public {
        // Edge case: valuation can be zero. That effectively gifts the NFT and
        // is therefore a bad idea, but does not break the contract.
        TokenLoan memory loan = tokenLoan[tokenId];
        require(loan.status == LOAN_INITIAL, "NFTPair: loan exists");

        loan.borrower = to;
        loan.status = LOAN_REQUESTED;
        tokenLoan[tokenId] = loan;
        tokenLoanParams[tokenId] = params;

        emit LogRequestLoan(to, tokenId, params);
        // Skimming is safe:
        // - This method both requires loan state to be LOAN_INITIAL and sets
        //   it to something else. Every other use of _requireCollateral must
        //   uphold this same requirement; see to it.
        _requireCollateral(msg.sender, tokenId, skim);
    }

    /// @dev Assumes all checks have been done
    function _finalizeLoan(uint256 tokenId, address collateralTo) private {
        delete tokenLoan[tokenId];
        delete tokenLoanParams[tokenId];
        collateral.transferFrom(address(this), collateralTo, tokenId);
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
            require(to == loan.lender || msg.sender == loan.lender, "NFTPair: not the lender");
            require(
                // Addition is safe: both summands are smaller than 256 bits
                uint256(loan.startTime) + tokenLoanParams[tokenId].duration < block.timestamp,
                "NFTPair: not expired"
            );
        }
        // If there somehow is collateral but no accompanying loan, then anyone
        // can claim it by first requesting a loan with `skim` set to true, and
        // then withdrawing. So we might as well allow it here..
        _finalizeLoan(tokenId, to);
        emit LogRemoveCollateral(tokenId, to);
    }

    ///@notice Assumes the lender has agreed to the loan.
    ///@param borrower Receives the option to repay and get the collateral back
    ///@param initialRecipient Receives the initial funds
    function _lend(
        address lender,
        address borrower,
        address initialRecipient,
        uint256 tokenId,
        TokenLoanParams memory params,
        bool skim
    ) internal returns (uint256 borrowerShare) {
        uint256 totalShare = bentoBox.toShare(asset, params.valuation, false);
        // No overflow: at most 128 + 16 bits (fits in BentoBox)
        uint256 openFeeShare = (totalShare * OPEN_FEE_BPS) / BPS;
        uint256 protocolFeeShare = (openFeeShare * PROTOCOL_FEE_BPS) / BPS;

        if (skim) {
            require(
                bentoBox.balanceOf(asset, address(this)) >= (totalShare - openFeeShare + protocolFeeShare + feesEarnedShare),
                "NFTPair: skim too much"
            );
        } else {
            bentoBox.transfer(asset, lender, address(this), totalShare - openFeeShare + protocolFeeShare);
        }
        // No underflow: follows from OPEN_FEE_BPS <= BPS
        borrowerShare = totalShare - openFeeShare;
        bentoBox.transfer(asset, address(this), initialRecipient, borrowerShare);
        // No overflow: addends (and result) must fit in BentoBox
        feesEarnedShare += protocolFeeShare;

        TokenLoan memory loan;
        loan.lender = lender;
        loan.borrower = borrower;
        loan.status = LOAN_OUTSTANDING;
        loan.startTime = uint64(block.timestamp); // Do not use in 12e10 years..
        tokenLoan[tokenId] = loan;

        emit LogLend(lender, borrower, tokenId, params);
    }

    /// @notice Lends with the parameters specified by the borrower.
    /// @param tokenId ID of the token that will function as collateral
    /// @param accepted Loan parameters as the lender saw them, for security
    /// @param skim True if the funds have been Bento-transferred to the contract
    function lend(
        uint256 tokenId,
        TokenLoanParams memory accepted,
        bool skim
    ) public {
        TokenLoan memory loan = tokenLoan[tokenId];
        require(loan.status == LOAN_REQUESTED, "NFTPair: not available");
        TokenLoanParams memory requested = tokenLoanParams[tokenId];

        // Valuation has to be an exact match, everything else must be at least
        // as good for the lender as `accepted`.
        require(
            requested.valuation == accepted.valuation &&
                requested.duration <= accepted.duration &&
                requested.annualInterestBPS >= accepted.annualInterestBPS,
            "NFTPair: bad params"
        );
        _lend(msg.sender, loan.borrower, loan.borrower, tokenId, requested, skim);
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparator();
    }

    // NOTE on signature hashes: the domain separator only guarantees that the
    // chain ID and master contract are a match, so we explicitly include the
    // clone address

    // keccak256("Lend(address contract,uint256 tokenId,bool anyTokenId,uint128 valuation,uint64 duration,uint16 annualInterestBPS,uint256 nonce,uint256 deadline)")
    bytes32 private constant LEND_SIGNATURE_HASH = 0x06bcca6f35b7c1b98f11abbb10957d273a681069ba90358de25404f49e2430f8;

    // keccak256("Borrow(address contract,uint256 tokenId,uint128 valuation,uint64 duration,uint16 annualInterestBPS,uint256 nonce,uint256 deadline)")
    bytes32 private constant BORROW_SIGNATURE_HASH = 0xf2c9128b0fb8406af3168320897e5ff08f3bb536dd5f804c29ed276e93ec4336;

    /// @notice Request and immediately borrow from a pre-committed lender

    /// @notice Caller provides collateral; loan can go to a different address.
    /// @param tokenId ID of the token that will function as collateral
    /// @param lender Lender, whose BentoBox balance the funds will come from
    /// @param borrower Receives the funds and the option to repay
    /// @param params Loan parameters requested, and signed by the lender
    /// @param skimCollateral True if the collateral has already been transferred
    /// @param anyTokenId Set if lender agreed to any token. Must have tokenId 0 in signature.
    /// @param signature (deadline, v, r, s) of signature. (See docs)
    function requestAndBorrow(
        uint256 tokenId,
        address lender,
        address borrower,
        TokenLoanParams memory params,
        bool skimCollateral,
        bool anyTokenId,
        SignatureParams memory signature
    ) public {
        _requireSignedLendParams(lender, tokenId, params, anyTokenId, signature);
        _lend(lender, borrower, borrower, tokenId, params, false);
        // Skimming is safe:
        // - This method both requires loan state to be LOAN_INITIAL and sets
        //   it to something else. Every other use of _requireCollateral must
        //   uphold this same requirement; see to it.
        //   (The check is in `_requireSignedLendParams()`)
        _requireCollateral(msg.sender, tokenId, skimCollateral);
    }

    /// @notice Request and immediately borrow from a pre-committed lender, while buying the collateral in the same transaction.
    /// @notice Caller provides extra funds if needed; loan can go to a different address.
    /// @param tokenId ID of the token that will function as collateral
    /// @param lender Lender, whose BentoBox balance the funds will come from
    /// @param borrower Receives the funds (and excess if token is cheaper)
    /// @param params Loan parameters requested, and signed by the lender
    /// @param anyTokenId Set if lender agreed to any token. Must have tokenId 0 in signature.
    /// @param signature (deadline, v, r, s) of signature. (See docs)
    /// @param price Price of token (in wei), sent to buyer contract
    /// @param buyer INFTBuyer contract that will purchase the token
    /// @param skimShortage True if any funds needed in excess of the loan have already been Bento-transfered to the contract
    function flashRequestAndBorrow(
        uint256 tokenId,
        address lender,
        address borrower,
        TokenLoanParams memory params,
        bool anyTokenId,
        SignatureParams memory signature,
        uint256 price,
        INFTBuyer buyer,
        bool skimShortage
    ) external {
        _requireSignedLendParams(lender, tokenId, params, anyTokenId, signature);
        // Round up: this is how many Bento-shares it will take to withdraw
        // `price` tokens
        uint256 priceShare = bentoBox.toShare(asset, price, true);
        // Bento-shares received by taking out the loan. They are sent to the
        // buyer contract for skimming.
        // TODO: Allow Bento-withdrawing instead?
        uint256 borrowerShare = _lend(lender, borrower, address(this), tokenId, params, false);
        // At this point the contract has `borrowerShare` extra shares. If this
        // is too much, then the borrower gets the excess. If this is not
        // enough, we either take the rest from msg.sender, or have the amount
        // skimmed.
        if (borrowerShare > priceShare) {
            bentoBox.transfer(asset, address(this), borrower, borrowerShare - priceShare);
        } else if (borrowerShare < priceShare) {
            if (skimShortage) {
                // We have `borrowerShare`, but need `priceShare`:
                require(bentoBox.balanceOf(asset, address(this)) >= (priceShare + feesEarnedShare), "NFTPair: skim too much");
            } else {
                // We need the difference:
                bentoBox.transfer(asset, msg.sender, address(this), priceShare - borrowerShare);
            }
        }
        // The share amount taken will be exactly `priceShare`, and the token
        // amount will be exactly `price`. If we passed `priceShare` instead,
        // the token amount given could be different.
        bentoBox.withdraw(asset, address(this), address(buyer), price, 0);

        // External call is safe: At this point, the state of the contract is
        // unusual only in that it has issued a loan against the token that has
        // not been delivered yet. Any interaction that does not involve this
        // loan/token is no different from outside this call. Taking out a new
        // loan is not possible. Repaying the loan is, but requires that:
        // a) the buyer either is, or has the token sent to, the borrower;
        // b) the token is sent to the contract first -- `_repayBefore()` will
        //    try to transfer it away.
        // By (b) in particular, the buyer contract cannot exploit this
        // situation.
        buyer.buy(asset, price, collateral, tokenId, address(this));
        require(collateral.ownerOf(tokenId) == address(this), "NFTPair: buyer failed");
    }

    function _requireSignedLendParams(
        address lender,
        uint256 tokenId,
        TokenLoanParams memory params,
        bool anyTokenId,
        SignatureParams memory signature
    ) private {
        if (signature.v == 0 && signature.r == bytes32(0) && signature.s == bytes32(0)) {
            require(
                ILendingClub(lender).willLend(
                    tokenId,
                    params.valuation,
                    params.duration,
                    params.annualInterestBPS,
                    // Oracle-specific values, not relevant here:
                    0,
                    INFTOracle(address(0))
                ),
                "NFTPair: LendingClub refused"
            );
        } else {
            require(block.timestamp <= signature.deadline, "NFTPair: signature expired");
            uint256 nonce = nonces[lender]++;
            bytes32 dataHash = keccak256(
                abi.encode(
                    LEND_SIGNATURE_HASH,
                    address(this),
                    anyTokenId ? 0 : tokenId,
                    anyTokenId,
                    params.valuation,
                    params.duration,
                    params.annualInterestBPS,
                    nonce,
                    signature.deadline
                )
            );
            require(ecrecover(_getDigest(dataHash), signature.v, signature.r, signature.s) == lender, "NFTPair: signature invalid");
        }

        require(tokenLoan[tokenId].status == LOAN_INITIAL, "NFTPair: loan exists");
        tokenLoanParams[tokenId] = params;
    }

    function _requireSignedBorrowParams(
        address borrower,
        uint256 tokenId,
        TokenLoanParams memory params,
        SignatureParams memory signature
    ) private {
        require(block.timestamp <= signature.deadline, "NFTPair: signature expired");
        uint256 nonce = nonces[borrower]++;
        bytes32 dataHash = keccak256(
            abi.encode(
                BORROW_SIGNATURE_HASH,
                address(this),
                tokenId,
                params.valuation,
                params.duration,
                params.annualInterestBPS,
                nonce,
                signature.deadline
            )
        );
        require(ecrecover(_getDigest(dataHash), signature.v, signature.r, signature.s) == borrower, "NFTPair: signature invalid");
        require(tokenLoan[tokenId].status == LOAN_INITIAL, "NFTPair: loan exists");
        tokenLoanParams[tokenId] = params;
    }

    /// @notice Take collateral from a pre-commited borrower and lend against it
    /// @notice Collateral must come from the borrower, not a third party.
    /// @param tokenId ID of the token that will function as collateral
    /// @param borrower Address that provides collateral and receives the loan
    /// @param params Loan terms offered, and signed by the borrower
    /// @param skimFunds True if the funds have been Bento-transferred to the contract
    /// @param signature (deadline, v, r, s) of signature. (See docs)
    function takeCollateralAndLend(
        uint256 tokenId,
        address borrower,
        TokenLoanParams memory params,
        bool skimFunds,
        SignatureParams memory signature
    ) public {
        _requireSignedBorrowParams(borrower, tokenId, params, signature);
        _lend(msg.sender, borrower, borrower, tokenId, params, skimFunds);
        // Skimming is safe:
        // - This method both requires loan state to be LOAN_INITIAL and sets
        //   it to something else. Every other use of _requireCollateral must
        //   uphold this same requirement; see to it.
        //   (The check is in `_requireSignedBorrowParams()`)
        // Taking collateral from someone other than msg.sender is safe: the
        // borrower signed a message giving permission.
        _requireCollateral(borrower, tokenId, false);
    }

    // Approximates continuous compounding. Uses Horner's method to evaluate
    // the truncated Maclaurin series for exp - 1, accumulating rounding
    // errors along the way. The following is always guaranteed:
    //
    //   principal * time * apr <= result <= principal * (e^(time * apr) - 1),
    //
    // where time = t/YEAR, up to at most the rounding error obtained in
    // calculating linear interest.
    //
    // If the theoretical result that we are approximating (the rightmost part
    // of the above inquality) fits in 128 bits, then the function is
    // guaranteed not to revert (unless n > 250, which is way too high).
    // If even the linear interest (leftmost part of the inequality) does not
    // the function will revert.
    // Otherwise, the function may revert, return a reasonable result, or
    // return a very inaccurate result. Even then the above inequality is
    // respected.
    /// @param principal Amount owed in wei
    /// @param t Duration in seconds
    /// @param aprBPS Annual rate in basis points (1/10_000)
    function calculateInterest(
        uint256 principal,
        uint64 t,
        uint16 aprBPS
    ) public pure returns (uint256 interest) {
        // (NOTE: n is hardcoded as COMPOUND_INTEREST_TERMS)
        //
        // We calculate
        //
        //  ----- n                                       ----- n
        //   \           principal * (t * aprBPS)^k        \
        //    )          --------------------------   =:    )          term_k
        //   /                k! * YEAR_BPS^k              /
        //  ----- k = 1                                   ----- k = 1
        //
        // which approaches, but never exceeds the "theoretical" result,
        //
        //          M := principal * [ exp (t * aprBPS / YEAR_BPS) - 1 ]
        //
        // as n goes to infinity. We use the fact that
        //
        //               principal * (t * aprBPS)^(k-1) * (t * aprBPS)
        //      term_k = ---------------------------------------------
        //                  (k-1)! * k * YEAR_BPS^(k-1) * YEAR_BPS
        //
        //                             t * aprBPS
        //             = term_{k-1} * ------------                          (*)
        //                            k * YEAR_BPS
        //
        // to calculate the terms one by one. The principal affords us the
        // precision to carry out the division without resorting to fixed-point
        // math. Any rounding error is downward, which we consider acceptable.
        //
        // Since all numbers involved are positive, each term is certainly
        // bounded above by M. From (*) we see that any intermediate results
        // are at most
        //
        //                      denom_k := k * YEAR_BPS.
        //
        // times M. Since YEAR_BPS fits in 38 bits, denom_k fits in 46 bits,
        // which proves that all calculations will certainly not overflow if M
        // fits in 128 bits.
        //
        // If M does not fit, then the intermediate results for some term may
        // eventually overflow, but this cannot happen at the first term, and
        // neither can the total overflow because it uses checked math.
        //
        // This constitutes a guarantee of specified behavior when M >= 2^128.
        uint256 x = uint256(t) * aprBPS;
        uint256 term_k = (principal * x) / YEAR_BPS;
        uint256 denom_k = YEAR_BPS;

        interest = term_k;
        for (uint256 k = 2; k <= COMPOUND_INTEREST_TERMS; k++) {
            denom_k += YEAR_BPS;
            term_k = (term_k * x) / denom_k;
            interest = interest.add(term_k); // <- Only overflow check we need
        }

        if (interest >= 2**128) {
            revert("NFTPair: Interest unpayable");
        }
    }

    function _repayBefore(
        uint256 tokenId,
        uint256 principal,
        address to,
        bool skim
    )
        private
        returns (
            uint256 totalShare,
            uint256 totalAmount,
            uint256 feeShare,
            address lender
        )
    {
        TokenLoan memory loan = tokenLoan[tokenId];
        require(loan.status == LOAN_OUTSTANDING, "NFTPair: no loan");
        require(msg.sender == loan.borrower || to == loan.borrower, "NFTPair: not borrower");

        TokenLoanParams memory loanParams = tokenLoanParams[tokenId];
        require(
            // Addition is safe: both summands are smaller than 256 bits
            uint256(loan.startTime) + loanParams.duration >= block.timestamp,
            "NFTPair: loan expired"
        );

        if (principal == 0 || principal >= loanParams.valuation) {
            principal = loanParams.valuation;
            // Not following checks-effects-interaction: we are already not
            // doing that by splitting `repay()` like this; we'll have to trust
            // the collateral contract if we are to support flash repayments.
            _finalizeLoan(tokenId, to);
            emit LogRepay(skim ? address(this) : msg.sender, tokenId);
        } else {
            // Math and cast are safe: 0 < principal < loanParams.valuation
            loanParams.valuation = uint128(loanParams.valuation - principal);
            tokenLoanParams[tokenId] = loanParams;
            emit LogUpdateLoanParams(tokenId, loanParams);
        }

        // No underflow: loan.startTime is only ever set to a block timestamp
        // Cast is safe (principal): is LTE loan.valuation
        // Cast is safe: if this overflows, then all loans have expired anyway
        uint256 interest = calculateInterest(uint128(principal), uint64(block.timestamp - loan.startTime), loanParams.annualInterestBPS);
        // No overflow: multiplicands fit in 128 and 16 bits
        uint256 fee = (interest * PROTOCOL_FEE_BPS) / BPS;
        // No overflon: both terms are 128 bits
        totalAmount = principal + interest;

        Rebase memory bentoBoxTotals = bentoBox.totals(asset);

        totalShare = bentoBoxTotals.toBase(totalAmount, true);
        feeShare = bentoBoxTotals.toBase(fee, false);
        lender = loan.lender;
    }

    function _repayAfter(
        address lender,
        uint256 totalShare,
        uint256 feeShare,
        bool skim
    ) private {
        // No overflow: `totalShare - feeShare` is 90% of `totalShare`, and
        // if that exceeds 128 bits the BentoBox transfer will revert. It
        // follows that `totalShare` fits in 129 bits, and `feesEarnedShare`
        // fits in 128 as it represents a BentoBox balance.
        // Skimming is safe: the amount gets transferred to the lender later,
        // and therefore cannot be skimmed twice.
        IERC20 asset_ = asset;
        if (skim) {
            require(bentoBox.balanceOf(asset_, address(this)) >= (totalShare + feesEarnedShare), "NFTPair: skim too much");
        } else {
            bentoBox.transfer(asset_, msg.sender, address(this), totalShare);
        }
        // No overflow: result fits in BentoBox
        feesEarnedShare += feeShare;
        // No underflow: `feeShare` is 10% of part of `totalShare`
        bentoBox.transfer(asset_, address(this), lender, totalShare - feeShare);
    }

    /// @notice Repay a loan in part or in full
    /// @param tokenId Token ID of the loan in question.
    /// @param principal How much of the principal to repay. Saturates at the full loan value. Zero also taken to mean 100%.
    /// @param to Recipient of the returned collateral. Can be anyone if msg.sender is the borrower, otherwise the borrower.
    /// @param skim True if the funds have already been Bento-transfered to the contract. Take care to send enough; interest accumulates by the second.
    function repay(
        uint256 tokenId,
        uint256 principal,
        address to,
        bool skim
    ) external {
        (uint256 totalShare, , uint256 feeShare, address lender) = _repayBefore(tokenId, principal, to, skim);
        _repayAfter(lender, totalShare, feeShare, skim);
    }

    /// @notice Repay a loan in full, by selling the token in the same transaction. Must be the borrower.
    /// @param tokenId Token ID of the loan in question.
    /// @param price Sale price of the token, in wei
    /// @param seller INFTSeller contract that will perform the sale
    /// @param excessRecipient Receives any funds left over after repaying, if any
    /// @param skimShortage True if any extra funds required have already been Bento-transfered to the contract. Take care to send enough; interest accumulates by the second.
    function flashRepay(
        uint256 tokenId,
        uint256 price,
        INFTSeller seller,
        address excessRecipient,
        bool skimShortage
    ) external {
        (uint256 totalShare, , uint256 feeShare, address lender) = _repayBefore(tokenId, 0, address(seller), false);

        // External call is safe: At this point the loan is already gone, the
        // seller has the token, and an amount must be paid via skimming or the
        // entire transaction reverts.
        // Other than being owed the money, the contract is in a valid state,
        // and once payment is received it is "accounted for" by being sent
        // away (in `_repayAfter()`), so that it cannot be reused for skimming.
        // Relying on return value is safe: if the amount reported is too high,
        // then either `_repayAfter()` will fail, or the funds were sitting in
        // the contract's BentoBox balance unaccounted for, and could be freely
        // skimmed for another purpose anyway.
        IERC20 asset_ = asset;
        uint256 priceShare = seller.sell(collateral, tokenId, asset_, price, address(this));
        if (priceShare < totalShare) {
            // No overflow: `totalShare` fits or `_repayAfter()` reverts. See
            // comments there for proof.
            // If we are skimming, then we defer the check to `_repayAfter()`,
            // which checks that the full amount (`totalShare`) has been sent.
            if (!skimShortage) {
                bentoBox.transfer(asset_, msg.sender, address(this), totalShare - priceShare);
            }
        } else if (priceShare > totalShare) {
            bentoBox.transfer(asset_, address(this), excessRecipient, priceShare - totalShare);
        }
        _repayAfter(lender, totalShare, feeShare, true);
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

    //// Cook actions

    // Information only
    uint8 internal constant ACTION_GET_AMOUNT_DUE = 1;
    uint8 internal constant ACTION_GET_SHARES_DUE = 2;

    // End up owing collateral
    uint8 internal constant ACTION_REPAY = 3;
    uint8 internal constant ACTION_REMOVE_COLLATERAL = 4;

    uint8 internal constant ACTION_REQUEST_LOAN = 12;
    uint8 internal constant ACTION_LEND = 13;

    // Function on BentoBox
    uint8 internal constant ACTION_BENTO_DEPOSIT = 20;
    uint8 internal constant ACTION_BENTO_WITHDRAW = 21;
    uint8 internal constant ACTION_BENTO_TRANSFER = 22;
    uint8 internal constant ACTION_BENTO_TRANSFER_MULTIPLE = 23;
    uint8 internal constant ACTION_BENTO_SETAPPROVAL = 24;

    // Any external call (except to BentoBox)
    uint8 internal constant ACTION_CALL = 30;

    // Signed requests
    uint8 internal constant ACTION_REQUEST_AND_BORROW = 40;
    uint8 internal constant ACTION_TAKE_COLLATERAL_AND_LEND = 41;

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
    /// Calls to `bentoBox` or `collateral` are not allowed for security reasons.
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

        require(callee != address(bentoBox) && callee != address(collateral) && callee != address(this), "NFTPair: can't call");

        (bool success, bytes memory returnData) = callee.call{value: value}(callData);
        require(success, "NFTPair: call failed");
        return (returnData, returnValues);
    }

    // (For the cook action)
    function _getAmountDue(uint256 tokenId) private view returns (uint256) {
        TokenLoanParams memory params = tokenLoanParams[tokenId];
        // No underflow: startTime is always set to some block timestamp
        uint256 principal = params.valuation;
        uint256 interest = calculateInterest(principal, uint64(block.timestamp - tokenLoan[tokenId].startTime), params.annualInterestBPS);
        // No overflow: both terms are 128 bits
        return principal + interest;
    }

    function _cook(
        uint8[] calldata actions,
        uint256[] calldata values,
        bytes[] calldata datas,
        uint256 i,
        uint256[2] memory result
    ) private {
        for (; i < actions.length; i++) {
            uint8 action = actions[i];
            if (action == ACTION_GET_AMOUNT_DUE) {
                uint256 tokenId = abi.decode(datas[i], (uint256));
                result[0] = _getAmountDue(tokenId);
            } else if (action == ACTION_GET_SHARES_DUE) {
                uint256 tokenId = abi.decode(datas[i], (uint256));
                result[1] = _getAmountDue(tokenId);
                result[0] = bentoBox.toShare(asset, result[1], true);
            } else if (action == ACTION_REPAY) {
                uint256 tokenId;
                uint256 totalShare;
                uint256 feeShare;
                uint256 principal;
                address lender;
                bool skim;
                {
                    address to;
                    // No skimming, but it can sill be done
                    (tokenId, principal, to, skim) = abi.decode(datas[i], (uint256, uint256, address, bool));
                    (totalShare, result[1], feeShare, lender) = _repayBefore(tokenId, principal, to, skim);
                    // Delaying asset collection until after the rest of the
                    // cook is safe: after checking..  - `feesEarnedShare` is
                    // updated after the check - The rest (`totalShare -
                    // feeShare`) is transferred away It is therefore not
                    // possible to skim the same amount twice.
                    // (Reusing `i` slot for stack depth reasons)
                }
                result[0] = totalShare;
                _cook(actions, values, datas, ++i, result);
                _repayAfter(lender, totalShare, feeShare, skim);
                return;
            } else if (action == ACTION_REMOVE_COLLATERAL) {
                (uint256 tokenId, address to) = abi.decode(datas[i], (uint256, address));
                removeCollateral(tokenId, to);
            } else if (action == ACTION_REQUEST_LOAN) {
                (uint256 tokenId, TokenLoanParams memory params, address to, bool skim) = abi.decode(
                    datas[i],
                    (uint256, TokenLoanParams, address, bool)
                );
                requestLoan(tokenId, params, to, skim);
            } else if (action == ACTION_LEND) {
                (uint256 tokenId, TokenLoanParams memory params, bool skim) = abi.decode(datas[i], (uint256, TokenLoanParams, bool));
                lend(tokenId, params, skim);
            } else if (action == ACTION_BENTO_SETAPPROVAL) {
                (address user, address _masterContract, bool approved, uint8 v, bytes32 r, bytes32 s) = abi.decode(
                    datas[i],
                    (address, address, bool, uint8, bytes32, bytes32)
                );
                bentoBox.setMasterContractApproval(user, _masterContract, approved, v, r, s);
            } else if (action == ACTION_BENTO_DEPOSIT) {
                (result[0], result[1]) = _bentoDeposit(datas[i], values[i], result[0], result[1]);
            } else if (action == ACTION_BENTO_WITHDRAW) {
                (result[0], result[1]) = _bentoWithdraw(datas[i], result[0], result[1]);
            } else if (action == ACTION_BENTO_TRANSFER) {
                (IERC20 token, address to, int256 share) = abi.decode(datas[i], (IERC20, address, int256));
                bentoBox.transfer(token, msg.sender, to, _num(share, result[0], result[1]));
            } else if (action == ACTION_BENTO_TRANSFER_MULTIPLE) {
                (IERC20 token, address[] memory tos, uint256[] memory shares) = abi.decode(datas[i], (IERC20, address[], uint256[]));
                bentoBox.transferMultiple(token, msg.sender, tos, shares);
            } else if (action == ACTION_CALL) {
                (bytes memory returnData, uint8 returnValues) = _call(values[i], datas[i], result[0], result[1]);

                if (returnValues == 1) {
                    (result[0]) = abi.decode(returnData, (uint256));
                } else if (returnValues == 2) {
                    (result[0], result[1]) = abi.decode(returnData, (uint256, uint256));
                }
            } else if (action == ACTION_REQUEST_AND_BORROW) {
                bool skimCollateral;
                uint256 tokenId;
                {
                    address lender;
                    address borrower;
                    TokenLoanParams memory params;
                    bool anyTokenId;
                    SignatureParams memory signature;
                    (tokenId, lender, borrower, params, skimCollateral, anyTokenId, signature) = abi.decode(
                        datas[i],
                        (uint256, address, address, TokenLoanParams, bool, bool, SignatureParams)
                    );
                    _requireSignedLendParams(lender, tokenId, params, anyTokenId, signature);
                    _lend(lender, borrower, borrower, tokenId, params, false);
                }
                _cook(actions, values, datas, ++i, result);
                // Skimming is safe:
                // - This call both requires loan state to be LOAN_INITIAL and
                //   sets it to something else. Every other use of
                //   `_requireCollateral()` must uphold that same requirement;
                //   see to it.
                // Delaying until after the rest of the cook is safe:
                // - If the rest of the cook _also_ takes this collateral
                //   somehow -- either via skimming, or via just having it
                //   transferred in -- then it did so by opening a loan. But
                //   that is only possible if this one (that we are collecting
                //   the collateral for) got repaid in the mean time, which is
                //   a silly thing to do, but otherwise legitimate and not an
                //   exploit.
                _requireCollateral(msg.sender, tokenId, skimCollateral);
                return;
            } else if (action == ACTION_TAKE_COLLATERAL_AND_LEND) {
                (uint256 tokenId, address borrower, TokenLoanParams memory params, bool skimFunds, SignatureParams memory signature) = abi
                    .decode(datas[i], (uint256, address, TokenLoanParams, bool, SignatureParams));
                takeCollateralAndLend(tokenId, borrower, params, skimFunds, signature);
            }
        }
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
        uint256[2] memory result;
        _cook(actions, values, datas, 0, result);
        return (result[0], result[1]);
    }
}
