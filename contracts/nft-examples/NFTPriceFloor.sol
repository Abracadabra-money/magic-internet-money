// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "../interfaces/INFTPair.sol";
import "../interfaces/ILendingClub.sol";
import "../interfaces/TokenLoanParams.sol";

// Not really a min price; if you "sell" to this club you get an option.

contract NFTPriceFloor is BoringOwnable, ILendingClub {
    mapping(uint256 => TokenLoanParams) private loanParams;
    INFTPair private immutable pair;

    constructor(INFTPair nftPair) public {
        pair = nftPair;
    }

    /// @param tokenId The token ID of the loan in question
    /// @param params The loan parameters to be offered
    function offer(uint256 tokenId, TokenLoanParams memory params) external onlyOwner {
        loanParams[tokenId] = params;
    }

    function willLend(
        uint256 tokenId,
        uint128 valuation,
        uint64 duration,
        uint16 annualInterestBPS,
        uint16 _ltvBPS,
        INFTOracle oracle
    ) external override returns (bool) {
        if (msg.sender != address(pair)) {
            return false;
        }
        TokenLoanParams memory params = loanParams[tokenId];
        if (valuation > params.valuation) {
            return false;
        }
        if (duration > params.duration) {
            return false;
        }
        if (annualInterestBPS < params.annualInterestBPS) {
            return false;
        }
        if (oracle != INFTOracle(address(0))) {
            return false;
        }
        // (If we don't have the funds, just let the transaction revert)

        return true;
    }

    function lendingConditions(address nftPair, uint256 tokenId) external view override returns (TokenLoanParamsWithOracle[] memory) {
        TokenLoanParams memory params = loanParams[tokenId];
        if (nftPair != address(pair) || params.valuation == 0) {
            TokenLoanParamsWithOracle[] memory empty;
            return empty;
        }
        // TODO: Cast?
        TokenLoanParamsWithOracle[] memory conditions = new TokenLoanParamsWithOracle[](1);
        conditions[0].valuation = params.valuation;
        conditions[0].duration = params.duration;
        conditions[0].annualInterestBPS = params.annualInterestBPS;
        return conditions;
    }
}
