// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase

pragma solidity 0.8.4;
import "../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface IYearnVault {
    function pricePerShare() external view returns (uint256 price);
}

interface ICurvePool {
    function get_virtual_price() external view returns (uint256 price);
    function lp_price() external view returns (uint256 price);
}

contract YVDAIOracle is IOracle {
    IYearnVault public constant YVDAI = IYearnVault(0xdA816459F1AB5631232FE5e97a05BBBb94970c95);

    function _get() internal view returns (uint256) {
        return 1e36 / YVDAI.pricePerShare();
    }

    /// @inheritdoc IOracle
    function get(bytes calldata) public view override returns (bool, uint256) {
        return (true, _get());
    }

    /// @inheritdoc IOracle
    function peek(bytes calldata) public view override returns (bool, uint256) {
        return (true, _get());
    }

    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        (, rate) = peek(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public pure override returns (string memory) {
        return "Chainlink YVDAI";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/YVDAI";
    }
}
