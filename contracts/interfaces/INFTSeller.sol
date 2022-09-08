// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12;
import "boring-solidity-old/contracts/interfaces/IERC20.sol";
import "./IBentoBoxV1Interface.sol";
import "./IERC721.sol";

interface INFTSeller {
    // Must be ERC721-skimming. Proceeds go to `recipient`'s BentoBox account
    // Must revert on failure.
    function sell(
        IERC721 fromContract,
        uint256 fromTokenId,
        IERC20 toAsset,
        uint256 toAmount,
        address recipient
    ) external returns (uint256 toShares);
}
