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
import "./interfaces/IERC721Receiver.sol";

/// @title PrivatePoolNFT
/// @dev This contract allows contract calls to any contract (except BentoBox)
/// from arbitrary callers thus, don't trust calls from this contract in any circumstances.
contract PrivatePoolNFT is BoringOwnable, IMasterContract, IERC721Receiver {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using RebaseLibrary for Rebase;
    using BoringERC20 for IERC20;

    event LogAddCollateral(address indexed from, address indexed to, uint256 tokenId);
    event LogAddAsset(address indexed from, uint256 share);
    event LogRemoveCollateral(address indexed from, address indexed to, uint256 tokenId);
    event LogRemoveAsset(address indexed to, uint256 share);
    event LogBorrow(address indexed from, address indexed to, uint256 tokenId);
    event LogRepay(address indexed from, uint256 tokenId);
    event LogFeeTo(address indexed newFeeTo);
    event LogWithdrawFees(address indexed feeTo, uint256 feeShare);

    // Immutables (for MasterContract and all clones)
    IBentoBoxV1 public immutable bentoBox;
    PrivatePoolNFT public immutable masterContract;

    // MasterContract variables
    address public feeTo;

    // Per clone variables
    // Clone init settings
    IERC721 public collateral;
    IERC20 public asset;

    address public lender;
    mapping(address => bool) public approvedBorrowers;

    // A note on terminology:
    // "Shares" are BentoBox shares.

    // The BentoBox balance is the sum of the below two.
    struct AssetBalance {
        uint128 reservesShare;
        uint128 feesEarnedShare;
    }
    AssetBalance public assetBalance;

    // Per token settings.
    // We might allow the lender to update these, but only to the benefit of
    // (potential) borrowers
    struct TokenLoanParams {
        uint128 valuation; // How much will you get? OK to owe until expiration.
        uint64 expiration; // Pay before this or get liquidated
        uint16 openFeeBPS; // Fixed cost of taking out the loan
        uint16 annualInterestBPS; // Variable cost of taking out the loan
        uint8 compoundInterestTerms; // Might as well. Stay under 50.
    }
    mapping(uint256 => TokenLoanParams) public tokenLoanParams;

    uint8 private constant LOAN_INITIAL = 0;
    uint8 private constant LOAN_COLLATERAL_DEPOSITED = 1;
    uint8 private constant LOAN_TAKEN = 2;
    struct TokenLoan {
        address borrower;
        uint64 startTime;
        uint8 status;
    }
    mapping(uint256 => TokenLoan) public tokenLoan;

    uint256 private constant PROTOCOL_FEE_BPS = 1000; // Do not go over 100%..
    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 3600 * 24 * 365;

    /// @notice The constructor is only used for the initial master contract.
    /// @notice Subsequent clones are initialised via `init`.
    constructor(IBentoBoxV1 bentoBox_) public {
        bentoBox = bentoBox_;
        masterContract = this;
    }

    struct InitSettings {
        IERC721 collateral;
        IERC20 asset;
        address lender;
        address[] borrowers;
        uint256[] tokenIds;
        TokenLoanParams[] loanParams;
    }

    /// @notice De facto constructor for clone contracts
    function init(bytes calldata data) public payable override {
        require(address(collateral) == address(0), "PrivatePool: already initialized");

        InitSettings memory settings = abi.decode(data, (InitSettings));
        require(address(settings.collateral) != address(0), "PrivatePool: bad pair");

        collateral = settings.collateral;
        asset = settings.asset;
        lender = settings.lender;

        for (uint256 i = 0; i < settings.borrowers.length; i++) {
            approvedBorrowers[settings.borrowers[i]] = true;
        }
        for (uint256 i = 0; i < settings.tokenIds.length; i++) {
            _updateLoanParams(settings.tokenIds[i], settings.loanParams[i]);
        }
    }

    function setApprovedBorrowers(address borrower, bool approved) external onlyOwner {
        approvedBorrowers[borrower] = approved;
    }
    
    // Enforces that settings are valid
    function _updateLoanParams(uint256 tokenId, TokenLoanParams memory params) internal {
        require(params.openFeeBPS < BPS, "PrivatePool: open fee");
        tokenLoanParams[tokenId] = params;
    }

    // Enforces that changes only benefit the borrower, if any.
    // Can be changed, but only in favour of the borrower. This includes giving
    // them another shot.
    function updateLoanParams(uint256 tokenId, TokenLoanParams memory params) public {
        require(msg.sender == lender, "PrivatePool: not the lender");
        uint8 loanStatus = tokenLoan[tokenId].status;
        if (loanStatus == LOAN_TAKEN) {
            TokenLoanParams memory current = tokenLoanParams[tokenId];
            require(
                params.expiration >= current.expiration &&
                    params.valuation <= current.valuation &&
                    params.annualInterestBPS <= current.annualInterestBPS,
                "PrivatePool: worse params"
            );
        }
        _updateLoanParams(tokenId, params);
    }

    /// @notice Adds `collateral` from msg.sender to the account `to`.
    /// @param to The receiver of the tokens.
    /// @param skim False if we need to transfer from msg.sender to the contract
    /// @param tokenId The token to add as collateral
    function addCollateral(
        uint256 tokenId,
        address to,
        bool skim
    ) public {
        require(approvedBorrowers[to], "PrivatePool: unapproved borrower");
        TokenLoanParams memory loanParams = tokenLoanParams[tokenId];
        require(loanParams.valuation > 0, "PrivatePool: loan unavailable");

        if (skim) {
            require(collateral.ownerOf(tokenId) == address(this), "PrivatePool: skim failed");
            require(tokenLoan[tokenId].status == LOAN_INITIAL, "PrivatePool: in use");
        } else {
            collateral.safeTransferFrom(msg.sender, address(this), tokenId);
        }
        TokenLoan memory loan;
        loan.borrower = to;
        loan.status = LOAN_COLLATERAL_DEPOSITED;
        tokenLoan[tokenId] = loan;
        emit LogAddCollateral(skim ? address(this) : msg.sender, to, tokenId);
    }

    // Equals to
    // `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`
    // which can be also obtained as
    // `IERC721Receiver(0).onERC721Received.selector`
    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        // We could check that this token can actually be used as collateral,
        // but we leave that to the sender and save a little gas..
        return _ERC721_RECEIVED;
    }

    /// @notice Removes `tokenId` as collateral and transfers it to `to`.
    /// @param to The receiver of the token.
    /// @param tokenId The token
    function removeCollateral(uint256 tokenId, address to) public {
        TokenLoan memory loan = tokenLoan[tokenId];
        if (loan.status == LOAN_COLLATERAL_DEPOSITED) {
            // We are withdrawing collateral that is not in use:
            require(msg.sender == loan.borrower, "PrivatePool: not the borrower");
        } else {
            // We are seizing collateral as the lender. The loan has to be
            // expired and not paid off:
            require(msg.sender == lender, "PrivatePool: not the lender");
            require(loan.status == LOAN_TAKEN, "PrivatePool: paid off");
            require(tokenLoanParams[tokenId].expiration <= block.timestamp, "PrivatePool: not expired");
        }
        emit LogRemoveCollateral(loan.borrower, to, tokenId);
        delete tokenLoan[tokenId];
        collateral.safeTransferFrom(address(this), to, tokenId);
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

        // No overflow, cast safe: takenShare is bigger and fits in 128 bits if
        // the transfer or skim succeeds
        _assetBalance.reservesShare += uint128(toReservesShare);
        _assetBalance.feesEarnedShare += uint128(toFeesShare);
        assetBalance = _assetBalance;

        if (skim) {
            require(takenShare <= bentoBox.balanceOf(_asset, address(this)).sub(priorAssetTotalShare), "PrivatePool: skim too much");
        } else {
            bentoBox.transfer(_asset, msg.sender, address(this), takenShare);
        }
    }

    /// @notice Adds assets to the lending pair.
    /// @param skim True if the amount should be skimmed from the deposit balance of msg.sender.
    /// False if tokens from msg.sender in `bentoBox` should be transferred.
    /// @param share The amount of shares to add.
    function addAsset(bool skim, uint256 share) public {
        _receiveAsset(skim, share, 0, 0);
        emit LogAddAsset(skim ? address(bentoBox) : msg.sender, share);
    }

    /// @notice Removes an asset from msg.sender and transfers it to `to`.
    /// @param to The address that receives the removed assets.
    /// @param share The amount of shares to remove.
    function removeAsset(address to, uint256 share) public {
        require(msg.sender == lender, "PrivatePool: not the lender");
        // Cast safe: Bento transfer reverts unless stronger condition holds
        assetBalance.reservesShare = assetBalance.reservesShare.sub(uint128(share));
        bentoBox.transfer(asset, address(this), to, share);
        emit LogRemoveAsset(to, share);
    }

    /// Returns the Bento shares received. Passes the entire loan parameters as
    /// a safeguard against these being "frontrun".
    function borrow(
        uint256 tokenId,
        address to,
        TokenLoanParams memory offered
    ) public returns (uint256 share, uint256 amount) {
        require(approvedBorrowers[msg.sender], "PrivatePool: unapproved borrower");

        TokenLoan memory loan = tokenLoan[tokenId];
        // If you managed to add the collateral, then you are approved. (Even
        // if we add a method to update the borrower whitelist later..)
        require(loan.status == LOAN_COLLATERAL_DEPOSITED && loan.borrower == msg.sender, "PrivatePool: no collateral");
        TokenLoanParams memory params = tokenLoanParams[tokenId];
        require(params.expiration > block.timestamp, "PrivatePool: expired");

        // Valuation has to be an exact match, everything else must be at least
        // as cheap as promised:
        require(
            params.valuation == offered.valuation &&
                params.expiration >= offered.expiration &&
                params.openFeeBPS <= offered.openFeeBPS &&
                params.annualInterestBPS <= offered.annualInterestBPS &&
                params.compoundInterestTerms <= offered.compoundInterestTerms,
            "PrivatePool: bad params"
        );

        IERC20 _asset = asset;
        Rebase memory bentoBoxTotals = bentoBox.totals(_asset);

        uint256 protocolFeeShare;
        {
            // No overflow: max 128 + 16 bits
            uint256 openFeeAmount = (uint256(params.valuation) * params.openFeeBPS) / BPS;
            // No overflow: max 144 + 16 bits
            uint256 protocolFeeAmount = (openFeeAmount * PROTOCOL_FEE_BPS) / BPS;
            // No underflow: openFeeBPS < BPS is enforced.
            amount = params.valuation - openFeeAmount;
            protocolFeeShare = bentoBoxTotals.toBase(protocolFeeAmount, false);
            share = bentoBoxTotals.toBase(amount, false);
        }

        {
            AssetBalance memory _assetBalance = assetBalance;
            // No overflow on the add: protocolFeeShare < share < Bento total,
            // or the transfer reverts. The transfer is independent of the
            // results of these calculations: `share` is not modified.
            // Theoretically the fee could just make it overflow 128 bits.
            // Underflow check is core business logic:
            _assetBalance.reservesShare = _assetBalance.reservesShare.sub((share + protocolFeeShare).to128());
            // Cast is safe: `share` fits. Also, the checked cast above
            // succeeded.  No overflow: protocolFeeShare < reservesShare, and
            // both balances together fit in the Bento share balance,
            _assetBalance.feesEarnedShare += uint128(protocolFeeShare);
            assetBalance = _assetBalance;
        }

        loan.status = LOAN_TAKEN;
        loan.startTime = uint64(block.timestamp); // Do not use in 12e10 years..
        tokenLoan[tokenId] = loan;
        bentoBox.transfer(_asset, address(this), to, share);
        emit LogBorrow(msg.sender, to, tokenId);
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
            term /= denom; // Safe until n = 251
            interest = interest.add(term); // <- Only overflow check we need
        }
    }

    function repay(uint256 tokenId, bool skim) public returns (uint256 amount) {
        TokenLoan memory loan = tokenLoan[tokenId];
        require(loan.status == LOAN_TAKEN, "PrivatePool: no loan");
        TokenLoanParams memory loanParams = tokenLoanParams[tokenId];
        require(loanParams.expiration > block.timestamp, "PrivatePool: loan expired");

        uint256 principal = loanParams.valuation;

        // No underflow: loan.startTime is only ever set to a block timestamp
        uint256 interest = calculateInterest(
            principal,
            block.timestamp - loan.startTime,
            loanParams.annualInterestBPS,
            loanParams.compoundInterestTerms
        ).to128();
        // No overflow (both lines): to128() would have reverted
        amount = principal + interest;
        uint256 fee = (interest * PROTOCOL_FEE_BPS) / BPS;

        // No underflow: PROTOCOL_FEE_BPS < BPS by construction.
        _receiveAsset(skim, 0, amount - fee, fee);
        loan.status = LOAN_COLLATERAL_DEPOSITED;
        tokenLoan[tokenId] = loan;
        emit LogRepay(skim ? address(bentoBox) : msg.sender, tokenId);
    }

    uint8 internal constant ACTION_ADD_ASSET = 1;
    uint8 internal constant ACTION_REPAY = 2;
    uint8 internal constant ACTION_REMOVE_ASSET = 3;
    uint8 internal constant ACTION_REMOVE_COLLATERAL = 4;
    uint8 internal constant ACTION_BORROW = 5;

    uint8 internal constant ACTION_ADD_COLLATERAL = 10;

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
            if (action == ACTION_ADD_COLLATERAL) {
                (uint256 tokenId, address to, bool skim) = abi.decode(datas[i], (uint256, address, bool));
                addCollateral(tokenId, to, skim);
            } else if (action == ACTION_ADD_ASSET) {
                (int256 share, bool skim) = abi.decode(datas[i], (int256, bool));
                addAsset(skim, _num(share, value1, value2));
            } else if (action == ACTION_REPAY) {
                (uint256 tokenId, bool skim) = abi.decode(datas[i], (uint256, bool));
                repay(tokenId, skim);
            } else if (action == ACTION_REMOVE_ASSET) {
                (int256 share, address to) = abi.decode(datas[i], (int256, address));
                removeAsset(to, _num(share, value1, value2));
            } else if (action == ACTION_REMOVE_COLLATERAL) {
                (uint256 tokenId, address to) = abi.decode(datas[i], (uint256, address));
                removeCollateral(tokenId, to);
            } else if (action == ACTION_BORROW) {
                (uint256 tokenId, address to, TokenLoanParams memory offered) = abi.decode(datas[i], (uint256, address, TokenLoanParams));
                (value1, value2) = borrow(tokenId, to, offered);
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

        uint256 assetShare = assetBalance.feesEarnedShare;
        if (assetShare > 0) {
            bentoBox.transfer(asset, address(this), to, assetShare);
            assetBalance.feesEarnedShare = 0;
        }

        emit LogWithdrawFees(to, assetShare);
    }

    /// @notice Sets the beneficiary of fees accrued in liquidations.
    /// MasterContract Only Admin function.
    /// @param newFeeTo The address of the receiver.
    function setFeeTo(address newFeeTo) public onlyOwner {
        feeTo = newFeeTo;
        emit LogFeeTo(newFeeTo);
    }
}
