// SPDX-License-Identifier: MIT

pragma solidity >=0.6.12 <0.9.0;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./IERC721.sol";

interface INFTPair {
    function collateral() external view returns (IERC721);

    function asset() external view returns (IERC20);

    function masterContract() external view returns (address);

    function bentoBox() external view returns (IBentoBoxV1);

    function removeCollateral(uint256 tokenId, address to) external;
}

struct TokenLoanParams {
    uint128 valuation; // How much will you get? OK to owe until expiration.
    uint64 duration; // Length of loan in seconds
    uint16 annualInterestBPS; // Variable cost of taking out the loan
}

struct SignatureParams {
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

