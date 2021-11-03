// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;
import "../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface IPopsicle {
    function usersAmounts() external view returns (uint256 amount0, uint256 amount1);

    function totalSupply() external view returns (uint256 amount);
}

contract PopsicleUSDCWETHOracle is IOracle {
    IAggregator public constant USDC = IAggregator(0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6);
    IAggregator public constant ETH = IAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
    IPopsicle public constant popsicle = IPopsicle(0x51aEA310a8FFF21c09Eee4594F3dA396209Bd398);

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {
        (uint256 amount0, uint256 amount1) = popsicle.usersAmounts();
        uint256 popsiclePrice = (amount0 * 1e12 * uint256(USDC.latestAnswer()) + amount1 * uint256(ETH.latestAnswer())) /
            popsicle.totalSupply() /
            1e8;
        return 1e36 / popsiclePrice;
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
