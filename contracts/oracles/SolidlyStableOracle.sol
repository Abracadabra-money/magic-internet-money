// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IAggregator.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/ISolidlyPair.sol";
import "../libraries/SolidlyStableCurve.sol";

/// @title LPChainlinkOracleV2
/// @author BoringCrypto, 0xCalibur, Barry Lyndon
/// @notice Oracle used for getting the price of an LP token denominated in tokenOracle.
contract SolidlyStableOracle is IAggregator {
    ISolidlyPair public immutable pair;
    IAggregator public immutable oracle0;
    IAggregator public immutable oracle1;

    uint8 public immutable oracle0Decimals;
    uint8 public immutable oracle1Decimals;

    uint8 public immutable token0Decimals;
    uint8 public immutable token1Decimals;

    uint256 public constant WAD = 18;

    /// @param pair_ The Solidly Base-V1 compatible contract address
    /// @param oracle0_ Oracle for what the pair calls `token0`
    /// @param oracle1_ Oracle for what the pair calls `token1`
    /// @notice `oracle0_` and `oracle1_` must quote in the same token/currency
    constructor(
        ISolidlyPair pair_,
        IAggregator oracle0_,
        IAggregator oracle1_
    ) {
        pair = pair_;
        oracle0 = oracle0_;
        oracle1 = oracle1_;

        (uint256 dec0, uint256 dec1, , , bool stable, , ) = pair.metadata();
        require(stable, "Wrong curve");

        token0Decimals = uint8(dec0);
        token1Decimals = uint8(dec1);

        oracle0Decimals = oracle0.decimals();
        oracle1Decimals = oracle1.decimals();
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    /// Calculates the lastest exchange rate
    /// @return Price of 1 LP token in the same unit as `oracle0` and `oracle1`
    /// Example
    /// - For 1 AVAX = $82
    /// - Total LP Value is: $160,000,000
    /// - LP supply is 8.25
    /// - latestAnswer() returns 234420638348190662349201 / 1e18 = 234420.63 AVAX
    /// - 1 LP = 234420.63 AVAX => 234420.63 * 8.25 * 82 = ≈$160,000,000
    function latestAnswer() public view override returns (int256) {
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        uint256 totalSupply = pair.totalSupply();

        (, int256 price0, , , ) = oracle0.latestRoundData();
        (, int256 price1, , , ) = oracle1.latestRoundData();

        uint256 normalizedReserve0 = reserve0 * (10**(WAD - token0Decimals));
        uint256 normalizedReserve1 = reserve1 * (10**(WAD - token1Decimals));

        uint256 normalizedPrice0 = uint256(price0) * (10**(WAD - oracle0Decimals));
        uint256 normalizedPrice1 = uint256(price1) * (10**(WAD - oracle1Decimals));

        uint256 totalValue = SolidlyStableCurve.totalValue(normalizedReserve0, normalizedReserve1, normalizedPrice0, normalizedPrice1);

        // Cast is safe: total value is the result of a fourth root
        return int256((totalValue * 1e18) / totalSupply);
    }

    function latestRoundData()
        external
        view
        returns (
            uint80,
            int256,
            uint256,
            uint256,
            uint80
        )
    {
        return (0, latestAnswer(), 0, 0, 0);
    }
}
