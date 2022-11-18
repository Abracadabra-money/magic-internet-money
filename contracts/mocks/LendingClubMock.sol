// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "boring-solidity-old/contracts/libraries/BoringERC20.sol";
import {INFTOracle} from "../interfaces/INFTOracle.sol";
import "../interfaces/INFTPair.sol";
import "../interfaces/ILendingClub.sol";

// Minimal implementation to set up some tests.
contract LendingClubMock is ILendingClub {
    INFTPair private immutable nftPair;
    address private immutable investor;

    constructor(INFTPair _nftPair, address _investor) public {
        nftPair = _nftPair;
        investor = _investor;
    }

    function init() public {
        nftPair.bentoBox().setMasterContractApproval(address(this), address(nftPair.masterContract()), true, 0, bytes32(0), bytes32(0));
    }

    function willLend(
        uint256 tokenId,
        uint128 valuation,
        uint64 duration,
        uint16 annualInterestBPS,
        uint16 _ltvBPS,
        INFTOracle _oracle
    ) external override returns (bool) {
        if (msg.sender != address(nftPair)) {
            return false;
        }
        TokenLoanParamsWithOracle[] memory options = _lendingConditions(tokenId);
        if (options.length == 0) {
            return false;
        }
        TokenLoanParamsWithOracle memory accepted = options[0];
        // Valuation has to be an exact match, everything else must be at least
        // as good for the lender as `accepted`.

        return valuation == accepted.valuation && duration <= accepted.duration && annualInterestBPS >= accepted.annualInterestBPS;
    }

    function _lendingConditions(uint256 tokenId) private pure returns (TokenLoanParamsWithOracle[] memory) {
        // No specific conditions given, but we'll take all even-numbered
        // ones at 100% APY:
        if (tokenId % 2 == 0) {
            TokenLoanParamsWithOracle[] memory conditions = new TokenLoanParamsWithOracle[](1);
            // 256-bit addition fits by the above check.
            // Cast is.. relatively safe: this is a mock implementation,
            // production use is unlikely to follow this pattern for valuing
            // loans, and manipulating the token ID can only break the logic by
            // making the loan "safer" for the lender.
            conditions[0].valuation = uint128((tokenId + 1) * 10**18);
            conditions[0].duration = 365 days;
            conditions[0].annualInterestBPS = 10_000;
            return conditions;
        } else {
            TokenLoanParamsWithOracle[] memory conditions;
            return conditions;
        }
    }

    function lendingConditions(address _nftPair, uint256 tokenId) external view override returns (TokenLoanParamsWithOracle[] memory) {
        if (_nftPair != address(nftPair)) {
            TokenLoanParamsWithOracle[] memory empty;
            return empty;
        } else {
            return _lendingConditions(tokenId);
        }
    }

    function seizeCollateral(uint256 tokenId) external {
        nftPair.removeCollateral(tokenId, investor);
    }

    function withdrawFunds(uint256 bentoShares) external {
        nftPair.bentoBox().transfer(nftPair.asset(), address(this), investor, bentoShares);
    }
}
