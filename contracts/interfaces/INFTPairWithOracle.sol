// SPDX-License-Identifier: MIT

pragma solidity >=0.6.12 <0.9.0;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./IERC721.sol";
import "./INFTOracle.sol";
import "./SignatureParams.sol";

// TODO: Add more methods for LendingClubWitOracle integration..
interface INFTPairWithOracle {
    function collateral() external view returns (IERC721);

    function asset() external view returns (IERC20);

    function masterContract() external view returns (address);

    function bentoBox() external view returns (IBentoBoxV1);

    function removeCollateral(uint256 tokenId, address to) external;
}

struct TokenLoanParamsWithOracle {
    uint128 valuation; // How much will you get? OK to owe until expiration.
    uint64 duration; // Length of loan in seconds
    uint16 annualInterestBPS; // Variable cost of taking out the loan
    uint16 ltvBPS; // Required to avoid liquidation
    INFTOracle oracle; // Oracle used for price
}

