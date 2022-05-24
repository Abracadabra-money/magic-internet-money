// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IAggregator.sol";

/// @title TokenOracle
/// @notice Oracle used for getting the price of 1 token in given denominator using Chainlink
contract TokenOracle is IAggregator {
    IAggregator public immutable tokenUSD;
    IAggregator public immutable denominatorUSD;

    constructor(IAggregator _tokenUSD, IAggregator _denominatorUSD) {
        tokenUSD = _tokenUSD;
        denominatorUSD = _denominatorUSD;
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    function latestAnswer() external view override returns (int256 answer) {
        (, answer, , , ) = latestRoundData();
    }

    function latestRoundData()
        public
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
        (, int256 tokenUSDFeed, , , ) = tokenUSD.latestRoundData();
        (, int256 denominatorUSDFeed, , , ) = denominatorUSD.latestRoundData();

        return (0, (tokenUSDFeed * 1e18) / denominatorUSDFeed, 0, 0, 0);
    }
}
