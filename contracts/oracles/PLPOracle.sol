// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../interfaces/IAggregator.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IPopsicle.sol";

contract PLPOracle is IOracle {
    IAggregator public immutable token0Aggregator;
    IAggregator public immutable token1Aggregator;
    IPopsicle public immutable plp;

    uint256 private immutable token0NormalizeScale;
    uint256 private immutable token1NormalizeScale;

    constructor(
        IPopsicle _plp,
        IAggregator _token0Aggregator,
        IAggregator _token1Aggregator
    ) {
        plp = _plp;
        token0Aggregator = _token0Aggregator;
        token1Aggregator = _token1Aggregator;

        uint256 token0Decimals = ERC20(_plp.token0()).decimals();
        uint256 token1Decimals = ERC20(_plp.token1()).decimals();

        uint256 token0AggregatorDecimals = _token0Aggregator.decimals();
        uint256 token1AggregatorDecimals = _token1Aggregator.decimals();

        token0NormalizeScale = (10**(36 - token0Decimals - token0AggregatorDecimals));
        token1NormalizeScale = (10**(36 - token1Decimals - token1AggregatorDecimals));
    }

    // Calculates the lastest exchange rate
    function _get() internal view returns (uint256) {
        (uint256 amount0, uint256 amount1) = plp.usersAmounts();

        uint256 token0Price = amount0 * uint256(token0Aggregator.latestAnswer()) * token0NormalizeScale;
        uint256 token1Price = amount1 * uint256(token1Aggregator.latestAnswer()) * token1NormalizeScale;       
        
        uint256 plpPrice = (token0Price + token1Price) / plp.totalSupply();

        return 1e36 / plpPrice;
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
        return "Chainlink Popsicle";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/PLP";
    }
}
