// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;
import "@boringcrypto/boring-solidity/contracts/interfaces/IERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "./IERC721.sol";

interface INFTBuyer {
    // Must be ERC20-skimming (not Bento).
    // Must revert on failure.
    // Transfers the NFT to `recipient`.
    function buy(
        IERC20 fromAsset,
        uint256 fromAmount,
        IERC721 toContract,
        uint256 toTokenId,
        address recipient
    ) external;
}