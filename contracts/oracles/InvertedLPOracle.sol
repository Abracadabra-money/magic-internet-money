// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IOracle.sol";
import "../interfaces/IAggregator.sol";

contract InvertedLPOracle is IOracle {
    IAggregator public immutable denominatorOracle;
    IAggregator public immutable lpOracle;

    string private desc;

    constructor(
        IAggregator _lpOracle,
        IAggregator _denominatorOracle,
        string memory _desc
    ) {
        lpOracle = _lpOracle;
        denominatorOracle = _denominatorOracle;
        desc = _desc;
    }

    /// @notice Returns 1 USD price in LP denominated in USD
    /// @dev lpOracle.latestAnswer() returns the price of 1 LP in denominator multipled by the denominator price in USD.
    /// It's then inverted so it gives how many LP can 1 USD buy.
    function _get() internal view returns (uint256) {
        uint256 lpPrice = uint256(lpOracle.latestAnswer()) * uint256(denominatorOracle.latestAnswer());
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
    function name(bytes calldata) public view override returns (string memory) {
        return desc;
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return desc;
    }
}
