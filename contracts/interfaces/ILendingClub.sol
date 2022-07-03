// SPDX-License-Identifier: MIT

pragma solidity >=0.6.12 <0.9.0;
pragma experimental ABIEncoderV2;

import "./TokenLoanParamsWithOracle.sol";

interface ILendingClub {
    // Per token settings.
    function willLend(
        uint256 tokenId,
        uint128 valuation,
        uint64 duration,
        uint16 annualInterestBPS,
        uint16 ltvBPS,
        address oracle
    )
        external
        view
        returns (bool);

    function lendingConditions(address nftPair, uint256 tokenId)
        external
        view
        returns (TokenLoanParamsWithOracle[] memory);
}

