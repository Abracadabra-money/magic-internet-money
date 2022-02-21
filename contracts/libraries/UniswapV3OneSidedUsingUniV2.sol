// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";

import "./FullMath.sol";
import "./TickMath.sol";
import "./LiquidityAmounts.sol";

library UniswapV3OneSidedUsingUniV2 {
    using LowGasSafeMath for uint256;

    uint256 private constant SWAP_IMBALANCE_MAX_PASS = 10;
    uint256 constant MULTIPLIER = 1e18;

    struct Cache {
        uint160 sqrtRatioX;
        uint160 sqrtRatioAX;
        uint160 sqrtRatioBX;
        uint256 amountIn0;
        uint256 amountIn1;
        uint256 balance0Left;
        uint256 balance1Left;
        uint256 tokenIntermediate;
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

    function getAmountsToDeposit(GetAmountsToDepositParams memory parameters) internal pure returns (uint256 balance0, uint256 balance1) {
        Cache memory cache;
        cache.sqrtRatioX = parameters.sqrtRatioX;
        cache.sqrtRatioAX = TickMath.getSqrtRatioAtTick(parameters.tickLower);
        cache.sqrtRatioBX = TickMath.getSqrtRatioAtTick(parameters.tickUpper);

        uint256 distance = cache.sqrtRatioBX - cache.sqrtRatioAX;

        // The ratio of each token in the range. share0 + share1 = 1
        uint256 share0 = FullMath.mulDiv(cache.sqrtRatioBX - parameters.sqrtRatioX, MULTIPLIER, distance);
        uint256 share1 = FullMath.mulDiv(parameters.sqrtRatioX - cache.sqrtRatioAX, MULTIPLIER, distance);

        if (parameters.amountInIsToken0) {
            cache.tokenIntermediate = FullMath.mulDiv(parameters.totalAmountIn, share1, MULTIPLIER);
            balance0 = parameters.totalAmountIn.sub(cache.tokenIntermediate);
            balance1 = getAmountOut(cache.tokenIntermediate, parameters.reserve0, parameters.reserve1);

            _updateBalanceLeft(cache, balance0, balance1);

            for (uint256 i = 0; i < SWAP_IMBALANCE_MAX_PASS; i++) {
                if (cache.balance0Left <= parameters.minToken0Imbalance && cache.balance1Left <= parameters.minToken1Imbalance) {
                    break;
                }

                if (cache.balance0Left.mul(cache.amountIn1) > cache.balance1Left.mul(cache.amountIn0)) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance0Left, share1, MULTIPLIER);
                    balance0 = balance0.sub(cache.tokenIntermediate);
                    balance1 = getAmountOut(parameters.totalAmountIn.sub(balance0), parameters.reserve0, parameters.reserve1);

                    _updateBalanceLeft(cache, balance0, balance1);
                }
                if (cache.balance0Left.mul(cache.amountIn1) < cache.balance1Left.mul(cache.amountIn0)) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance1Left, share0, MULTIPLIER);
                    balance1 = balance1.sub(cache.tokenIntermediate);
                    uint256 amountIn = getAmountIn(balance1, parameters.reserve1, parameters.reserve0);
                    balance0 = parameters.totalAmountIn.sub(amountIn);

                    _updateBalanceLeft(cache, balance0, balance1);
                }
            }
        } else {
            cache.tokenIntermediate = FullMath.mulDiv(parameters.totalAmountIn, share0, MULTIPLIER);
            balance0 = getAmountOut(cache.tokenIntermediate, parameters.reserve1, parameters.reserve0);
            balance1 = parameters.totalAmountIn.sub(cache.tokenIntermediate);

            _updateBalanceLeft(cache, balance0, balance1);

            for (uint256 i = 0; i < SWAP_IMBALANCE_MAX_PASS; i++) {
                if (cache.balance0Left <= parameters.minToken0Imbalance && cache.balance1Left <= parameters.minToken1Imbalance) {
                    break;
                }

                if (cache.balance0Left.mul(cache.amountIn1) > cache.balance1Left.mul(cache.amountIn0)) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance0Left, share1, MULTIPLIER);
                    balance0 = balance0.sub(cache.tokenIntermediate);
                    uint256 amountIn = getAmountIn(balance0, parameters.reserve1, parameters.reserve0);
                    balance1 = parameters.totalAmountIn.sub(amountIn);

                    _updateBalanceLeft(cache, balance0, balance1);
                }

                if (cache.balance0Left.mul(cache.amountIn1) < cache.balance1Left.mul(cache.amountIn0)) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance1Left, share0, MULTIPLIER);
                    balance1 = balance1.sub(cache.tokenIntermediate);
                    balance0 = getAmountOut(parameters.totalAmountIn.sub(balance1), parameters.reserve1, parameters.reserve0);

                    _updateBalanceLeft(cache, balance0, balance1);
                }
            }
        }
    }

    function _updateBalanceLeft(
        Cache memory cache,
        uint256 balance0,
        uint256 balance1
    ) private pure {
        cache.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            cache.sqrtRatioX,
            cache.sqrtRatioAX,
            cache.sqrtRatioBX,
            balance0,
            balance1
        );
        (cache.amountIn0, cache.amountIn1) = LiquidityAmounts.getAmountsForLiquidity(
            cache.sqrtRatioX,
            cache.sqrtRatioAX,
            cache.sqrtRatioBX,
            cache.liquidity
        );

        cache.balance0Left = balance0.sub(cache.amountIn0);
        cache.balance1Left = balance1.sub(cache.amountIn1);
    }
}
