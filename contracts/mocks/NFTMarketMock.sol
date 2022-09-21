// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/INFTPair.sol";

contract NFTMarketMock {
    using BoringERC20 for IERC20;

    IERC721 public immutable nfts;
    IERC20 public immutable money;
    uint256 public reserves;
    mapping(uint256 => bool) public inventory;

    constructor(IERC721 _nfts, IERC20 _money) public {
        money = _money;
        nfts = _nfts;
    }

    function fund(uint256 amount) external {
        money.safeTransferFrom(msg.sender, address(this), amount);
        reserves += amount;
    }

    function stock(uint256 tokenId) external {
        inventory[tokenId] = true;
        nfts.transferFrom(msg.sender, address(this), tokenId);
    }

    function sell(
        uint256 tokenId,
        uint256 price,
        address to,
        bool skim
    ) external {
        require(price <= reserves, "expensive");
        if (skim) {
            require(inventory[tokenId] == false, "scam");
            require(nfts.ownerOf(tokenId) == address(this), "skim");
        } else {
            nfts.transferFrom(msg.sender, address(this), tokenId);
        }
        reserves -= price;
        inventory[tokenId] = true;
        money.safeTransfer(to, price);
    }

    function buy(
        uint256 tokenId,
        uint256 price,
        address to,
        bool skim
    ) external {
        require(inventory[tokenId] == true, "n/a");
        if (skim) {
            require(money.balanceOf(address(this)) >= price + reserves, "skim");
        } else {
            money.safeTransferFrom(msg.sender, address(this), price);
        }
        reserves += price;
        inventory[tokenId] = false;
        nfts.transferFrom(address(this), to, tokenId);
    }
}
