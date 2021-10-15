// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/// @title UsdcAvaxOracle
/// @author 0xCalibur
/// @notice Oracle used for getting the price of 1 USDC in AVAX using Chainlink
contract UsdcAvaxOracleV1 is AggregatorV3Interface {
    using BoringMath for uint256;

    AggregatorV3Interface public constant usdcUsd = AggregatorV3Interface(0xF096872672F44d6EBA71458D74fe67F9a77a23B9);
    AggregatorV3Interface public constant avaxUsd = AggregatorV3Interface(0x0A77230d17318075983913bC2145DB16C7366156);

    constructor() public {}

    function decimals() external override view returns (uint8) {
        return 18;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        (,int256 usdcUsdFeed,,,) = usdcUsd.latestRoundData();
        (,int256 avaxUsdFeed,,,) = avaxUsd.latestRoundData();

        return (0, (usdcUsdFeed * 1e18) / avaxUsdFeed, 0, 0, 0);
    }
}
