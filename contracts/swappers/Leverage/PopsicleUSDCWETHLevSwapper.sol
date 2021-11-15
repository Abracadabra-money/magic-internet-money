// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol";
import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import "../../interfaces/IPopsicle.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address recipient, uint256 amount) external returns (bool);
}

interface IBentoBoxV1 {
    function withdraw(
        IERC20 token,
        address from,
        address to,
        uint256 amount,
        uint256 share
    ) external returns (uint256, uint256);

    function deposit(
        IERC20 token,
        address from,
        address to,
        uint256 amount,
        uint256 share
    ) external returns (uint256, uint256);
}

interface CurvePool {
    function exchange_underlying(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy,
        address receiver
    ) external returns (uint256);
}

/// @notice USDC/WETH Popsicle Leverage Swapper for Ethereum
contract PopsicleUSDCWETHLevSwapper {
    using LowGasSafeMath for uint256;

    struct Cache {
        uint160 sqrtRatioAX;
        uint160 sqrtRatioBX;
        uint160 sqrtRatioX;
        uint256 amountIn0;
        uint256 amountIn1;
        uint256 balance0Left;
        uint256 balance1Left;
        uint256 usdIntermediate;
        uint256 wethIntermediate;
        uint128 liquidity;
    }

    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    IPopsicle public immutable popsicle;

    CurvePool private constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 private constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 private constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IUniswapV2Pair private constant USDCWETH = IUniswapV2Pair(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0);

    uint256 private constant MIN_USDC_IMBALANCE = 1e6;
    uint256 private constant MIN_WETH_IMBALANCE = 0.0002 ether;

    uint256 private constant SWAP_IMBALANCE_MAX_PASS = 10;
    uint256 constant MULTIPLIER = 1e18;

    IUniswapV3Pool private immutable pool;

    constructor(IPopsicle _popsicle) {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDC.approve(address(_popsicle), type(uint256).max);
        WETH.approve(address(_popsicle), type(uint256).max);
        pool = IUniswapV3Pool(_popsicle.pool());
        popsicle = _popsicle;
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

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDC on Curve MIM3POOL
        MIM3POOL.exchange_underlying(0, 2, mimAmount, 0, address(this));
        uint256 usdcAmount = USDC.balanceOf(address(this)); // cuz we have some amounts left from previous leverages // u can remove that and add some functions to withdraw res balance

        // Swap 50% USDC -> WETH can forbid deposit!!!!
        // Swap Amount USDC -> WETH to provide optimal 50/50 liquidity
        // Use UniswapV2 pair to avoid changing V3 liquidity balance

        {
            (uint256 reserve0, uint256 reserve1, ) = USDCWETH.getReserves();
            (uint256 balance0, uint256 balance1) = _getAmountsToDeposit(usdcAmount, reserve0, reserve1);
            USDC.transfer(address(USDCWETH), usdcAmount.sub(balance0));
            USDCWETH.swap(0, balance1, address(this), new bytes(0));
        }

        (uint256 shares, , ) = popsicle.deposit(USDC.balanceOf(address(this)), WETH.balanceOf(address(this)), address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(popsicle)), address(DEGENBOX), recipient, shares, 0);
        extraShare = shareReturned - shareToMin;
    }

    function _getAmountsToDeposit(
        uint256 usdcAmountTotal,
        uint256 reserve0,
        uint256 reserve1
    ) private view returns (uint256 balance0, uint256 balance1) {
        Cache memory cache;
        cache.sqrtRatioAX = TickMath.getSqrtRatioAtTick(popsicle.tickLower());
        cache.sqrtRatioBX = TickMath.getSqrtRatioAtTick(popsicle.tickUpper());
        (cache.sqrtRatioX, , , , , , ) = pool.slot0();
        uint256 distance = cache.sqrtRatioBX - cache.sqrtRatioAX;
        uint256 share0 = FullMath.mulDiv(cache.sqrtRatioBX - cache.sqrtRatioX, MULTIPLIER, distance);
        uint256 share1 = FullMath.mulDiv(cache.sqrtRatioX - cache.sqrtRatioAX, MULTIPLIER, distance);

        cache.usdIntermediate = FullMath.mulDiv(usdcAmountTotal, share1, MULTIPLIER); // to swap. cuz token0 == USDC. change to share0 if token0 == weth
        balance0 = usdcAmountTotal.sub(cache.usdIntermediate);
        balance1 = getAmountOut(cache.usdIntermediate, reserve0, reserve1);

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
        for (uint256 i = 0; i < SWAP_IMBALANCE_MAX_PASS; i++) {
            if (cache.balance0Left <= MIN_USDC_IMBALANCE && cache.balance1Left <= MIN_WETH_IMBALANCE) {
                break;
            }

            if (cache.balance0Left.mul(cache.amountIn1) > cache.balance1Left.mul(cache.amountIn0)) {
                cache.usdIntermediate = FullMath.mulDiv(cache.balance0Left, share1, MULTIPLIER);
                balance0 = balance0.sub(cache.usdIntermediate);
                balance1 = getAmountOut(usdcAmountTotal.sub(balance0), reserve0, reserve1);
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

            if (cache.balance0Left.mul(cache.amountIn1) < cache.balance1Left.mul(cache.amountIn0)) {
                cache.wethIntermediate = FullMath.mulDiv(cache.balance1Left, share0, MULTIPLIER);
                balance1 = balance1.sub(cache.wethIntermediate);
                uint256 amountForWeth = getAmountIn(balance1, reserve1, reserve0);
                balance0 = usdcAmountTotal.sub(amountForWeth);

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
    }
}
