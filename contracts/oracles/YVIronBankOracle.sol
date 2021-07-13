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

contract YVIronBankOracle is IOracle {
    ICurvePool constant public IronBank = ICurvePool(0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF);
    IYearnVault constant public YVIB = IYearnVault(0x27b7b1ad7288079A66d12350c828D3C00A6F07d7);
    IAggregator constant public DAI = IAggregator(0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9);
    IAggregator constant public USDC = IAggregator(0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6);
    IAggregator constant public USDT = IAggregator(0x3E7d1eAB13ad0104d2750B8863b489D65364e32D);

    /**
     * @dev Returns the smallest of two numbers.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {

        uint256 minStable = min(DAI.latestAnswer(), min(USDC.latestAnswer(), USDT.latestAnswer()));

        uint256 yVCurvePrice = IronBank.get_virtual_price() * minStable * YVIB.pricePerShare();

        return 1e62 / yVCurvePrice;
    }

    // Get the latest exchange rate
    /// @inheritdoc IOracle
    function get(bytes) public override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes data) external view override returns (uint256 rate) {
        (, rate) = peek(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public view override returns (string memory) {
        return "Yearn Chainlink Curve IronBank";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return "LINK/yvIB";
    }
}
