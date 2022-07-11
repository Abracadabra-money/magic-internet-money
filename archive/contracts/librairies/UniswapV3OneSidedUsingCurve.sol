// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./FullMath.sol";
import "./TickMath.sol";
import "./LiquidityAmounts.sol";
import "../interfaces/curve/ICurvePool.sol";

library UniswapV3OneSidedUsingCurve {
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
        int8 i;
        int8 j;
        address pool;
        bytes4 selector; // curve pool function selector for get_dy/get_dy_underlying.
        uint256 totalAmountIn;
        uint256 minToken0Imbalance;
        uint256 minToken1Imbalance;
    }

    function get_dy(
        address pool,
        bytes4 selector,
        int8 i,
        int8 j,
        uint256 dx
    ) internal view returns (uint256) {
        (bool success, bytes memory data) = pool.staticcall(abi.encodeWithSelector(selector, i, j, dx));
        require(success, "call failed");
        return (abi.decode(data, (uint256)));
    }

    function getAmountsToDeposit(GetAmountsToDepositParams memory parameters) internal view returns (uint256 balance0, uint256 balance1) {
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
            balance0 = parameters.totalAmountIn - cache.tokenIntermediate;
            balance1 = get_dy(parameters.pool, parameters.selector, parameters.i, parameters.j, cache.tokenIntermediate);

            _updateBalanceLeft(cache, balance0, balance1);
            for (uint256 i = 0; i < SWAP_IMBALANCE_MAX_PASS; i++) {
                if (cache.balance0Left <= parameters.minToken0Imbalance && cache.balance1Left <= parameters.minToken1Imbalance) {
                    break;
                }

                if (cache.balance0Left * cache.amountIn1 > cache.balance1Left * cache.amountIn0) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance0Left, share1, MULTIPLIER);
                    balance0 = balance0 - cache.tokenIntermediate;
                    balance1 = get_dy(
                        parameters.pool,
                        parameters.selector,
                        parameters.i,
                        parameters.j,
                        parameters.totalAmountIn - balance0
                    );

                    _updateBalanceLeft(cache, balance0, balance1);
                }

                if (cache.balance1Left * cache.amountIn0 > cache.balance0Left * cache.amountIn1) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance1Left, share0, MULTIPLIER);
                    balance1 = balance1 - cache.tokenIntermediate;

                    uint256 amount = get_dy(parameters.pool, parameters.selector, parameters.j, parameters.i, cache.tokenIntermediate);
                    balance0 += amount;

                    _updateBalanceLeft(cache, balance0, balance1);
                }
            }
        } else {
            cache.tokenIntermediate = FullMath.mulDiv(parameters.totalAmountIn, share0, MULTIPLIER);
            balance1 = parameters.totalAmountIn - cache.tokenIntermediate;
            balance0 = get_dy(parameters.pool, parameters.selector, parameters.i, parameters.j, cache.tokenIntermediate);
            _updateBalanceLeft(cache, balance0, balance1);

            for (uint256 i = 0; i < SWAP_IMBALANCE_MAX_PASS; i++) {
                if (cache.balance0Left <= parameters.minToken0Imbalance && cache.balance1Left <= parameters.minToken1Imbalance) {
                    break;
                }

                if (cache.balance0Left * cache.amountIn1 > cache.balance1Left * cache.amountIn0) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance0Left, share1, MULTIPLIER);
                    balance0 = balance0 - cache.tokenIntermediate;

                    uint256 amount = get_dy(parameters.pool, parameters.selector, parameters.j, parameters.i, cache.tokenIntermediate);
                    balance1 += amount;

                    _updateBalanceLeft(cache, balance0, balance1);
                }

                if (cache.balance1Left * cache.amountIn0 > cache.balance0Left * cache.amountIn1) {
                    cache.tokenIntermediate = FullMath.mulDiv(cache.balance1Left, share0, MULTIPLIER);
                    balance1 = balance1 - cache.tokenIntermediate;
                    balance0 = get_dy(
                        parameters.pool,
                        parameters.selector,
                        parameters.i,
                        parameters.j,
                        parameters.totalAmountIn - balance1
                    );
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

        cache.balance0Left = balance0 - cache.amountIn0;
        cache.balance1Left = balance1 - cache.amountIn1;
    }
}
