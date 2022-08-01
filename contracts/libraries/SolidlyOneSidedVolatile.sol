// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interfaces/solidly/ISolidlyRouter.sol";
import "../interfaces/solidly/ISolidlyPair.sol";
import "../interfaces/IERC20.sol";
import "./Babylonian.sol";

library SolidlyOneSidedVolatile {
    struct AddLiquidityAndOneSideRemainingParams {
        ISolidlyRouter router;
        ISolidlyPair pair;
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint256 token0Amount;
        uint256 token1Amount;
        uint256 minOneSideableAmount0;
        uint256 minOneSideableAmount1;
        address recipient;
        uint256 fee;
    }

    struct AddLiquidityFromSingleTokenParams {
        ISolidlyRouter router;
        ISolidlyPair pair;
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        address tokenIn;
        uint256 tokenInAmount;
        address recipient;
        uint256 fee;
    }

    /// @dev adapted from https://blog.alphaventuredao.io/onesideduniswap/
    /// turn off fees since they are not automatically added to the pair when swapping
    /// but moved out of the pool
    function _calculateSwapInAmount(
        uint256 reserveIn,
        uint256 amountIn,
        uint256 fee
    ) internal pure returns (uint256) {
        /// @dev rought estimation to account for the fact that fees don't stay inside the pool.
        amountIn += ((amountIn * fee) / 10000) / 2;

        return (Babylonian.sqrt(4000000 * (reserveIn * reserveIn) + (4000000 * amountIn * reserveIn)) - 2000 * reserveIn) / 2000;
    }

    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function addLiquidityAndOneSideRemaining(AddLiquidityAndOneSideRemainingParams memory params)
        internal
        returns (
            uint256 idealAmount0,
            uint256 idealAmount1,
            uint256 liquidity
        )
    {
        (idealAmount0, idealAmount1, liquidity) = params.router.addLiquidity(
            params.token0,
            params.token1,
            false,
            params.token0Amount,
            params.token1Amount,
            0,
            0,
            params.recipient,
            type(uint256).max
        );

        params.token0Amount -= idealAmount0;
        params.token1Amount -= idealAmount1;

        address oneSideTokenIn;
        uint256 oneSideTokenAmount;

        if (params.token0Amount >= params.minOneSideableAmount0) {
            oneSideTokenIn = params.token0;
            oneSideTokenAmount = params.token0Amount;
        } else if (params.token1Amount > params.minOneSideableAmount1) {
            oneSideTokenIn = params.token1;
            oneSideTokenAmount = params.token1Amount;
        }

        if (oneSideTokenAmount > 0) {
            AddLiquidityFromSingleTokenParams memory _addLiquidityFromSingleTokenParams = AddLiquidityFromSingleTokenParams(
                params.router,
                params.pair,
                params.token0,
                params.token1,
                params.reserve0,
                params.reserve1,
                oneSideTokenIn,
                oneSideTokenAmount,
                params.recipient,
                params.fee
            );

            (uint256 _idealAmount0, uint256 _idealAmount1, uint256 _liquidity) = addLiquidityFromSingleToken(
                _addLiquidityFromSingleTokenParams
            );

            idealAmount0 += _idealAmount0;
            idealAmount1 += _idealAmount1;
            liquidity += _liquidity;
        }
    }

    function addLiquidityFromSingleToken(AddLiquidityFromSingleTokenParams memory params)
        internal
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        if (params.tokenIn == params.token0) {
            uint256 tokenInSwapAmount = _calculateSwapInAmount(params.reserve0, params.tokenInAmount, params.fee);
            params.tokenInAmount -= tokenInSwapAmount;
            uint256 sideTokenAmount = params.pair.getAmountOut(tokenInSwapAmount, params.token0);
            IERC20(params.tokenIn).transfer(address(params.pair), tokenInSwapAmount);
            params.pair.swap(0, sideTokenAmount, address(this), "");
            return
                params.router.addLiquidity(
                    params.token0,
                    params.token1,
                    false,
                    params.tokenInAmount,
                    sideTokenAmount,
                    0,
                    0,
                    params.recipient,
                    type(uint256).max
                );
        } else {
            uint256 tokenInSwapAmount = _calculateSwapInAmount(params.reserve1, params.tokenInAmount, params.fee);
            params.tokenInAmount -= tokenInSwapAmount;
            uint256 sideTokenAmount = params.pair.getAmountOut(tokenInSwapAmount, params.token1);
            IERC20(params.tokenIn).transfer(address(params.pair), tokenInSwapAmount);
            params.pair.swap(sideTokenAmount, 0, address(this), "");

            return
                params.router.addLiquidity(
                    params.token0,
                    params.token1,
                    false,
                    sideTokenAmount,
                    params.tokenInAmount,
                    0,
                    0,
                    params.recipient,
                    type(uint256).max
                );
        }
    }
}
