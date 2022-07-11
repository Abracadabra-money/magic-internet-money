// SPDX-License-Identifier: MIT

pragma solidity >=0.6.12 <0.9.0;
pragma experimental ABIEncoderV2;

import "./INFTPair.sol";

interface ILendingClub {
    // Per token settings.
    function willLend(uint256 tokenId, TokenLoanParams memory params)
        external
        view
        returns (bool);

    function lendingConditions(address nftPair, uint256 tokenId)
        external
        view
        returns (TokenLoanParams memory);
}

