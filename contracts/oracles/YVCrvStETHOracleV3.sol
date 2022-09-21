// SPDX-License-Identifier: MIT
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
}

contract YVCrvStETHOracleV3 is IOracle {
    ICurvePool public constant STETH = ICurvePool(0x828b154032950C8ff7CF8085D841723Db2696056);
    IYearnVault public constant YVSTETH = IYearnVault(0x5faF6a2D186448Dfa667c51CB3D695c7A6E52d8E);
    IAggregator public constant ETH = IAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
    IAggregator public constant STETH_ETH = IAggregator(0x86392dC19c0b719886221c78AB11eb8Cf5c52812);

    /**
     * @dev Returns the smallest of two numbers.
     */
    // FROM: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/6d97f0919547df11be9443b54af2d90631eaa733/contracts/utils/math/Math.sol
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // Calculates the lastest exchange rate
    function _get() internal view returns (uint256) {
        return
            1e62 /
            (((min(1e18, uint256(STETH_ETH.latestAnswer())) * uint256(ETH.latestAnswer())) / 1e18) *
                STETH.get_virtual_price() *
                YVSTETH.pricePerShare());
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
        return "Yearn Chainlink Curve STETH";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/yvCRVSTETH";
    }
}
