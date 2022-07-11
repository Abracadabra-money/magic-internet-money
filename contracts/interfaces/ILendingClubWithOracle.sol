// SPDX-License-Identifier: MIT

pragma solidity >=0.6.12 <0.9.0;
pragma experimental ABIEncoderV2;

import "./INFTPairWithOracle.sol";

interface ILendingClubWithOracle {
    // Per token settings.
    function willLend(uint256 tokenId, TokenLoanParamsWithOracle memory params)
        external
        view
        returns (bool);

    function lendingConditions(address nftPair, uint256 tokenId)
        external
        view
        returns (TokenLoanParamsWithOracle memory);
}

