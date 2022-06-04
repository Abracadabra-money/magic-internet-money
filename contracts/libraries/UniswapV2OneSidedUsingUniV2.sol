// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "../interfaces/IERC20.sol";
import "./Babylonian.sol";

library UniswapV2OneSidedUsingUniV2 {
    struct AddLiquidityAndOneSideRemainingParams {
        IUniswapV2Router01 router;
        IUniswapV2Pair pair;
        address token0;
        address token1;
        uint256 reserve0;
        uint256 reserve1;
        uint256 token0Amount;
        uint256 token1Amount;
        uint256 minOneSideableAmount0;
        uint256 minOneSideableAmount1;
        address recipient;
    }

    function _calculateSwapInAmount(uint256 reserveIn, uint256 userIn) internal pure returns (uint256) {
        return (Babylonian.sqrt(reserveIn * ((userIn * 3988000) + (reserveIn * 3988009))) - (reserveIn * 1997)) / 1994;
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
            params.token0Amount,
            params.token1Amount,
            0,
            0,
            address(this),
            type(uint256).max
        );

        params.token0Amount -= idealAmount0;
        params.token1Amount -= idealAmount1;

        address oneSideTokenIn;
        uint256 oneSideTokenAmount;

        if (idealAmount0 >= params.minOneSideableAmount0) {
            oneSideTokenIn = params.token0;
            oneSideTokenAmount = params.token0Amount;
        } else if (idealAmount1 >= params.minOneSideableAmount1) {
            oneSideTokenIn = params.token1;
            oneSideTokenAmount = params.token1Amount;
        }

        if (oneSideTokenAmount > 0) {
            (uint256 _idealAmount0, uint256 _idealAmount1, uint256 _liquidity) = addLiquidityFromSingleToken(
                params.router,
                params.pair,
                params.token0,
                params.token1,
                params.reserve0,
                params.reserve1,
                oneSideTokenIn,
                params.token1Amount,
                params.recipient
            );
            idealAmount0 += _idealAmount0;
            idealAmount1 += _idealAmount1;
            liquidity = _liquidity;
        }
    }

    function addLiquidityFromSingleToken(
        IUniswapV2Router01 router,
        IUniswapV2Pair pair,
        address token0,
        address token1,
        uint256 reserve0,
        uint256 reserve1,
        address tokenIn,
        uint256 tokenInAmount,
        address recipient
    )
        internal
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        if (tokenIn == token0) {
            uint256 tokenInSwapAmount = _calculateSwapInAmount(reserve0, tokenInAmount);
            tokenInAmount -= tokenInSwapAmount;
            uint256 sideTokenAmount = _getAmountOut(tokenInSwapAmount, reserve0, reserve1);
            IERC20(tokenIn).transfer(address(pair), tokenInSwapAmount);
            pair.swap(0, sideTokenAmount, address(this), "");
            return router.addLiquidity(token0, token1, sideTokenAmount, sideTokenAmount, 0, 0, recipient, type(uint256).max);
        } else {
            uint256 tokenInSwapAmount = _calculateSwapInAmount(reserve1, tokenInAmount);
            tokenInAmount -= tokenInSwapAmount;
            uint256 sideTokenAmount = _getAmountOut(tokenInSwapAmount, reserve1, reserve0);
            IERC20(tokenIn).transfer(address(pair), tokenInSwapAmount);
            pair.swap(sideTokenAmount, 0, address(this), "");
            return router.addLiquidity(token0, token1, sideTokenAmount, sideTokenAmount, 0, 0, recipient, type(uint256).max);
        }
    }
}
