// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
import "../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

contract UsdcAvaxLPOracle is IOracle {
    IAggregator constant public AVAX = IAggregator(0x0A77230d17318075983913bC2145DB16C7366156);
    IAggregator constant public LPAVAX = IAggregator(0xD5d0f5d872ed4eB74AA3E8fa6D833d6f7603D2EC);

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {

        uint256 lpPrice = uint256(LPAVAX.latestAnswer()) * uint256(AVAX.latestAnswer());

        return 1e44 / lpPrice;
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
        return "LP AVAX/USDC";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LP AVAX/USDC";
    }
}
