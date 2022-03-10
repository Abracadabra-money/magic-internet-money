// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

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

/// @title MimFTMOracleV1
/// @author 0xCalibur
/// @notice Oracle used for getting the price of 1 MIM in AVAX using Chainlink
contract MimFTMOracleV1 is AggregatorV3Interface {
    AggregatorV3Interface public constant MIMUSD = AggregatorV3Interface(0x28de48D3291F31F839274B8d82691c77DF1c5ceD);
    AggregatorV3Interface public constant FTMUSD = AggregatorV3Interface(0xf4766552D15AE4d256Ad41B6cf2933482B0680dc);

    function decimals() external pure override returns (uint8) {
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
        (, int256 mimUsdFeed, , , ) = MIMUSD.latestRoundData();
        (, int256 ftmUsdFeed, , , ) = FTMUSD.latestRoundData();

        return (0, (mimUsdFeed * 1e18) / ftmUsdFeed, 0, 0, 0);
    }
}
