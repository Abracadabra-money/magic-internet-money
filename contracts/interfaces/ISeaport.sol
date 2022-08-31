// SPDX-License-Identifier: MIT
pragma solidity >=0.8.13;

interface ISeaport {

    // prettier-ignore
    enum OrderType {
        // 0: no partial fills, anyone can execute
        FULL_OPEN,

        // 1: partial fills supported, anyone can execute
        PARTIAL_OPEN,

        // 2: no partial fills, only offerer or zone can execute
        FULL_RESTRICTED,

        // 3: partial fills supported, only offerer or zone can execute
        PARTIAL_RESTRICTED
    }

    // prettier-ignore
    enum ItemType {
        // 0: ETH on mainnet, MATIC on polygon, etc.
        NATIVE,

        // 1: ERC20 items (ERC777 and ERC20 analogues could also technically work)
        ERC20,

        // 2: ERC721 items
        ERC721,

        // 3: ERC1155 items
        ERC1155,

        // 4: ERC721 items where a number of tokenIds are supported
        ERC721_WITH_CRITERIA,

        // 5: ERC1155 items where a number of ids are supported
        ERC1155_WITH_CRITERIA
    }

    /**
    * @dev An offer item has five components: an item type (ETH or other native
    *      tokens, ERC20, ERC721, and ERC1155, as well as criteria-based ERC721 and
    *      ERC1155), a token address, a dual-purpose "identifierOrCriteria"
    *      component that will either represent a tokenId or a merkle root
    *      depending on the item type, and a start and end amount that support
    *      increasing or decreasing amounts over the duration of the respective
    *      order.
    */
    struct OfferItem {
        ItemType itemType;
        address token;
        uint256 identifierOrCriteria;
        uint256 startAmount;
        uint256 endAmount;
    }

    /**
    * @dev A consideration item has the same five components as an offer item and
    *      an additional sixth component designating the required recipient of the
    *      item.
    */
    struct ConsiderationItem {
        ItemType itemType;
        address token;
        uint256 identifierOrCriteria;
        uint256 startAmount;
        uint256 endAmount;
        address payable recipient;
    }

    struct OrderParameters {
        address offerer;
        address zone;
        OfferItem[] offer;
        ConsiderationItem[] consideration;
        OrderType orderType;
        uint256 startTime;
        uint256 endTime;
        bytes32 zoneHash;
        uint256 salt;
        bytes32 conduitKey;
        uint256 totalOriginalConsiderationItems;
    }
    struct Order {
        OrderParameters parameters;
        bytes signature;
    }

    function validate(Order[] calldata orders)
        external
        returns (bool validated);
}
