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
