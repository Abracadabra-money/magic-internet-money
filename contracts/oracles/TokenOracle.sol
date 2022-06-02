// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IAggregator.sol";

/// @title TokenOracle
/// @notice Oracle used for getting the price of 1 token in given denominator using Chainlink
contract TokenOracle is IAggregator {
    error NegativePriceFeed();
    
    IAggregator public immutable tokenUSD;
    IAggregator public immutable denominatorUSD;

    uint8 public immutable oracle0Decimals;
    uint8 public immutable oracle1Decimals;

    uint256 public constant WAD = 18;

    constructor(IAggregator _tokenUSD, IAggregator _denominatorUSD) {
        tokenUSD = _tokenUSD;
        denominatorUSD = _denominatorUSD;

        oracle0Decimals = _tokenUSD.decimals();
        oracle1Decimals = _denominatorUSD.decimals();
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
        
        if(tokenUSDFeed < 0 || denominatorUSDFeed < 0) {
            revert NegativePriceFeed();
        }

        uint256 normalizedTokenUSDFeed = uint256(tokenUSDFeed) * (10**(WAD - oracle0Decimals));
        uint256 normalizedDenominatorUSDFeed = uint256(denominatorUSDFeed) * (10**(WAD - oracle1Decimals));

        return (0, int256((normalizedTokenUSDFeed * 1e18) / normalizedDenominatorUSDFeed), 0, 0, 0);
    }
}
