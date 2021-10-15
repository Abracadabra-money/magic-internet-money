// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "../../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

/// @title UsdcAvaxOracle
/// @notice Avalanche Oracle that provides how much USDC/AVAX Trader Joe LP, 1 USDC is worth
/// @author 0xCalibur
/// @dev The aggregator is returning the price of 1 LP in USD fair price. This oracle is returning the inverse of it.
contract UsdcAvaxOracleV1 is IOracle {
    using BoringMath for uint256; // Keep everything in uint256

    IAggregator public constant aggregator = IAggregator(0x279D54aDD72935d845074675De0dbcfdc66800a3);

    // Calculates the lastest exchange rate
    function _get() internal view returns (uint256) {
        return 1e36 / uint256(aggregator.latestAnswer());
    }

    // Get the latest exchange rate
    /// @inheritdoc IOracle
    function get(bytes calldata) public override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata ) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        (, rate) = peek(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public view override returns (string memory) {
        return "USDC/AVAX LP Chainlink";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return "LINK/USDCAVAX";
    }
}
