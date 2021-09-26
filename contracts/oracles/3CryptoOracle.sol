// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
import "../interfaces/IOracle.sol";

// Chainlink Aggregator


interface ILPOracle {
    function lp_price() external view returns (uint256 price);
}

contract ThreeCryptoOracle is IOracle {
    ILPOracle constant public LP_ORACLE = ILPOracle(0xE8b2989276E2Ca8FDEA2268E3551b2b4B2418950);

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {
        return 1e36 / LP_ORACLE.lp_price();
    }

    // Get the latest exchange rate
    /// @inheritdoc IOracle
    function get(bytes calldata) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        (, rate) = peek(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public pure override returns (string memory) {
        return "3Crv";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "3crv";
    }
}