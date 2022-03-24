// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
import "../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface IMagicCRV {
    function totalSupply() external view returns (uint256);

    function totalCRVTokens() external view returns (uint256);
}

contract MagicCRVOracle is IOracle {
    IAggregator public constant CRV = IAggregator(0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f);
    IMagicCRV public immutable magicCRV;

    constructor(IMagicCRV _magicCRV) {
        magicCRV = _magicCRV;
    }

    function _get() internal view returns (uint256) {
        uint256 totalSupply = magicCRV.totalSupply();

        if (totalSupply == 0) {
            return 1e26 / uint256(CRV.latestAnswer());
        }

        return 1e26 / ((uint256(CRV.latestAnswer()) * magicCRV.totalCRVTokens()) / totalSupply);
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
        return "Chainlink MagicCRV";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/MagicCRV";
    }
}
