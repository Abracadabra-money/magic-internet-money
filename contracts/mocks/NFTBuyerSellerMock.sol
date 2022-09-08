// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "boring-solidity-old/contracts/libraries/BoringERC20.sol";
import "../interfaces/IBentoBoxV1Interface.sol";
import "./NFTMarketMock.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/INFTBuyer.sol";
import "../interfaces/INFTSeller.sol";

// NFT version of swappers. We could of course make our mock "market" conform
// to this pattern, but this serves as an illustration of how an abitrary
// external contract might be used.
contract NFTBuyerSellerMock is INFTBuyer, INFTSeller {
    using BoringERC20 for IERC20;

    IBentoBoxV1 private immutable bentoBox;
    NFTMarketMock private immutable market;

    constructor(IBentoBoxV1 _bentoBox, NFTMarketMock _market) public {
        bentoBox = _bentoBox;
        market = _market;
    }

    function buy(
        IERC20 fromAsset,
        uint256 fromAmount,
        IERC721 toContract,
        uint256 toTokenId,
        address recipient
    ) external override {
        require(fromAsset == market.money(), "Buyer: wrong token");
        require(toContract == market.nfts(), "Buyer: wrong contract");
        fromAsset.safeTransfer(address(market), fromAmount);
        market.buy(toTokenId, fromAmount, recipient, true);
    }

    function sell(
        IERC721 fromContract,
        uint256 fromTokenId,
        IERC20 toAsset,
        uint256 toAmount,
        address recipient
    ) external override returns (uint256 toShares) {
        // (Ignore these and/or make them specific to the contract?)
        require(fromContract == market.nfts(), "Seller: wrong contract");
        require(toAsset == market.money(), "Seller: wrong token");
        // We assume we have been transfered the NFT. We also use skimming to
        // interact with the market contract, to avoid having to approve it:
        fromContract.transferFrom(address(this), address(market), fromTokenId);
        // We will use (Bento-)skimming to send the funds back to the
        // recipient's BentoBox balance:
        market.sell(fromTokenId, toAmount, address(bentoBox), true);
        (, toShares) = bentoBox.deposit(toAsset, address(bentoBox), recipient, toAmount, 0);
    }
}
