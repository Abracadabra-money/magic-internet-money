// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface IERC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);
}

contract WbtcOracleMig is IOracle {
    IAggregator public constant BTCUSD = IAggregator(0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c);
    IAggregator public constant GOLD = IAggregator(0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6);
    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {
        uint256 btcPrice = uint256(BTCUSD.latestAnswer());
        uint256 goldPrice = uint256(GOLD.latestAnswer());
        return goldPrice * 1e8 / btcPrice;
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
        return "Chainlink GOLD BTC";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/GOLD/BTC";
    }
}
