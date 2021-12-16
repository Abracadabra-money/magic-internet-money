// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

library UniswapV3OneSided {
    using LowGasSafeMath for uint256;

    uint256 private constant SWAP_IMBALANCE_MAX_PASS = 10;
    uint256 constant MULTIPLIER = 1e18;

    struct Cache {
        uint160 sqrtRatioAX;
        uint160 sqrtRatioBX;
        uint256 amountIn0;
        uint256 amountIn1;
        uint256 balance0Left;
        uint256 balance1Left;
        uint256 token0Intermediate;
        uint256 token1Intermediate;
        uint128 liquidity;
    }

    struct GetAmountsToDepositParams {
        uint160 sqrtRatioX;
        int24 tickLower;
        int24 tickUpper;
        bool amountInIsToken0;
        uint256 totalAmountIn;
        uint256 reserve0;
        uint256 reserve1;
        uint256 minToken0Imbalance;
        uint256 minToken1Imbalance;
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        uint256 numerator = reserveIn.mul(amountOut).mul(1000);
        uint256 denominator = reserveOut.sub(amountOut).mul(997);
        amountIn = (numerator / denominator).add(1);
    }

    function getAmountsToDeposit(GetAmountsToDepositParams memory parameters) internal view returns (uint256 balance0, uint256 balance1) {
        Cache memory cache;
        cache.sqrtRatioAX = TickMath.getSqrtRatioAtTick(parameters.tickLower);
        cache.sqrtRatioBX = TickMath.getSqrtRatioAtTick(parameters.tickUpper);
        uint256 distance = cache.sqrtRatioBX - cache.sqrtRatioAX;
        uint256 share0 = FullMath.mulDiv(cache.sqrtRatioBX - parameters.sqrtRatioX, MULTIPLIER, distance);
        uint256 share1 = FullMath.mulDiv(parameters.sqrtRatioX - cache.sqrtRatioAX, MULTIPLIER, distance);

        // to swap, since token0 == USDC. change to share0 if token0 == weth
        cache.token0Intermediate = FullMath.mulDiv(parameters.totalAmountIn, parameters.amountInIsToken0 ? share1 : share0, MULTIPLIER);
        balance0 = parameters.totalAmountIn.sub(cache.token0Intermediate);
        balance1 = getAmountOut(cache.token0Intermediate, parameters.reserve0, parameters.reserve1);

        cache.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            parameters.sqrtRatioX,
            cache.sqrtRatioAX,
            cache.sqrtRatioBX,
            balance0,
            balance1
        );
        (cache.amountIn0, cache.amountIn1) = LiquidityAmounts.getAmountsForLiquidity(
            parameters.sqrtRatioX,
            cache.sqrtRatioAX,
            cache.sqrtRatioBX,
            cache.liquidity
        );

        cache.balance0Left = balance0.sub(cache.amountIn0);
        cache.balance1Left = balance1.sub(cache.amountIn1);
        for (uint256 i = 0; i < SWAP_IMBALANCE_MAX_PASS; i++) {
            if (cache.balance0Left <= parameters.minToken0Imbalance && cache.balance1Left <= parameters.minToken1Imbalance) {
                break;
            }

            if (cache.balance0Left.mul(cache.amountIn1) > cache.balance1Left.mul(cache.amountIn0)) {
                cache.token0Intermediate = FullMath.mulDiv(cache.balance0Left, share1, MULTIPLIER);
                balance0 = balance0.sub(cache.token0Intermediate);
                balance1 = getAmountOut(parameters.totalAmountIn.sub(balance0), parameters.reserve0, parameters.reserve1);
                cache.liquidity = LiquidityAmounts.getLiquidityForAmounts(
                    parameters.sqrtRatioX,
                    cache.sqrtRatioAX,
                    cache.sqrtRatioBX,
                    balance0,
                    balance1
                );
                (cache.amountIn0, cache.amountIn1) = LiquidityAmounts.getAmountsForLiquidity(
                    parameters.sqrtRatioX,
                    cache.sqrtRatioAX,
                    cache.sqrtRatioBX,
                    cache.liquidity
                );
                cache.balance0Left = balance0.sub(cache.amountIn0);
                cache.balance1Left = balance1.sub(cache.amountIn1);
            }

            if (cache.balance0Left.mul(cache.amountIn1) < cache.balance1Left.mul(cache.amountIn0)) {
                cache.token1Intermediate = FullMath.mulDiv(cache.balance1Left, share0, MULTIPLIER);
                balance1 = balance1.sub(cache.token1Intermediate);
                uint256 amountForToken1 = getAmountIn(balance1, parameters.reserve1, parameters.reserve0);
                balance0 = parameters.totalAmountIn.sub(amountForToken1);

                cache.liquidity = LiquidityAmounts.getLiquidityForAmounts(
                    parameters.sqrtRatioX,
                    cache.sqrtRatioAX,
                    cache.sqrtRatioBX,
                    balance0,
                    balance1
                );
                (cache.amountIn0, cache.amountIn1) = LiquidityAmounts.getAmountsForLiquidity(
                    parameters.sqrtRatioX,
                    cache.sqrtRatioAX,
                    cache.sqrtRatioBX,
                    cache.liquidity
                );

                cache.balance0Left = balance0.sub(cache.amountIn0);
                cache.balance1Left = balance1.sub(cache.amountIn1);
            }
        }
    }
}
