// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "../interfaces/INFTOracle.sol";

// WARNING: This oracle is only for testing
// WARNING: The `_pair` parameter is always ignored!
contract NFTOracleMock is INFTOracle {
    using BoringMath for uint256;

    mapping(uint256 => uint256) public rates;
    bool public success;

    constructor() public {
        success = true;
    }

    function set(uint256 tokenId, uint256 rate) public {
        rates[tokenId] = rate;
    }

    function setSuccess(bool val) public {
        success = val;
    }

    function get(address _pair, uint256 tokenId) external override returns (bool success, uint256 rate) {
        return (success, rates[tokenId]);
    }

    // Check the last exchange rate without any state changes
    function peek(address _pair, uint256 tokenId) public view override returns (bool, uint256) {
        return (success, rates[tokenId]);
    }

    function peekSpot(address _pair, uint256 tokenId) public view override returns (uint256) {
        return rates[tokenId];
    }
}
