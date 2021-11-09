// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;
pragma abicoder v2;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";
import "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import "../../interfaces/IPopsicle.sol";

//import "hardhat/console.sol";

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

    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool private constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IUniswapV2Pair private constant USDCWETH = IUniswapV2Pair(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0);
    ISwapRouter private constant SWAPROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 private constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 private constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    IPopsicle public immutable popsicle;
    IUniswapV3Pool private immutable pool;

    constructor(IPopsicle _popsicle) {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDC.approve(address(_popsicle), type(uint256).max);
        WETH.approve(address(_popsicle), type(uint256).max);
        USDC.approve(address(SWAPROUTER), type(uint256).max);
        WETH.approve(address(SWAPROUTER), type(uint256).max);

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

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDC on Curve MIM3POOL
        uint256 usdcAmount = MIM3POOL.exchange_underlying(0, 2, mimAmount, 0, address(this));

        // Swap Amount USDC -> WETH to provide optimal 50/50 liquidity
        // Use UniswapV2 pair to avoid changing V3 liquidity balance
        {
            (uint256 reserve0, uint256 reserve1, ) = USDCWETH.getReserves();
            uint256 wethAmount = getAmountOut(usdcAmount / 2, reserve0, reserve1);
            USDC.transfer(address(USDCWETH), usdcAmount / 2);
            USDCWETH.swap(0, wethAmount, address(this), new bytes(0));
        }

        uint256 shares = _depositInPLP();

        /*console.log("usdcAmount", usdcAmount);
        console.log("shares", shares);
        console.log("amount0", amount0);
        console.log("amount1", amount1);
        console.log("remaining USDC", USDC.balanceOf(address(this)));
        console.log("remaining WETH", WETH.balanceOf(address(this)));*/

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(popsicle)), address(DEGENBOX), recipient, shares, 0);
        extraShare = shareReturned - shareToMin;
    }

    /// @notice Deposit tokens into PLP and swap remaining balances if necessary.
    /// Adapted from https://github.com/VolumeFi/cellars/blob/main/contracts/CellarPoolShare.sol
    function _depositInPLP() private returns (uint256 totalShares) {
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();
        uint256 balance0 = USDC.balanceOf(address(this));
        uint256 balance1 = WETH.balanceOf(address(this));
        uint256 swapAmount;

        (uint256 shares, uint256 inAmount0, uint256 inAmount1) = popsicle.deposit(balance0, balance1, address(DEGENBOX));

        balance0 = balance0.sub(inAmount0);
        balance1 = balance1.sub(inAmount1);
        totalShares = totalShares.add(shares);

        // b0 / b1 > i0 / i1 means token0 will remain. swap some token0 into token1
        if (balance0.mul(inAmount1) > balance1.mul(inAmount0) || (inAmount0 == 0 && inAmount1 == 0 && balance0 > balance1)) {
            // nothing added means either token exists and price range is not out of range for the token.
            // the case is balance0 > 0, balance1 = 0, swap half amount of token0 into token1
            if (inAmount0 == 0 && inAmount1 == 0) {
                swapAmount = balance0 / 2;
            }
            // calculate swap amount from bal0, bal1, in0, in1.
            // bal0, bal1 are token balance to add. in0, in1 are added balance in the first adding liquidity.
            // approximated result because in swapping, because the price changes.
            else {
                swapAmount =
                    (balance0.mul(inAmount1) - balance1.mul(inAmount0)) /
                    (FullMath.mulDiv(FullMath.mulDiv(inAmount0, sqrtPriceX96, FixedPoint96.Q96), sqrtPriceX96, FixedPoint96.Q96) +
                        inAmount1);
            }
            try
                SWAPROUTER.exactInputSingle(
                    ISwapRouter.ExactInputSingleParams({
                        tokenIn: address(USDC),
                        tokenOut: address(WETH),
                        fee: 3000,
                        recipient: address(this),
                        deadline: block.timestamp,
                        amountIn: swapAmount,
                        amountOutMinimum: 0,
                        sqrtPriceLimitX96: 0
                    })
                )
            {} catch {}
        }

        // b0 / b1 < i0 / i1 means token1 will remain. swap some token1 into token0
        if (balance0.mul(inAmount1) < balance1.mul(inAmount0) || (inAmount0 == 0 && inAmount1 == 0 && balance0 < balance1)) {
            // nothing added means either token exists and price range is not out of range for the token.
            // the case is balance1 > 0, balance0 = 0, swap half amount of token1 into token0
            if (inAmount0 == 0 && inAmount1 == 0) {
                swapAmount = balance1 / 2;
            } else {
                swapAmount =
                    (balance1.mul(inAmount0) - balance0.mul(inAmount1)) /
                    (FullMath.mulDiv(FullMath.mulDiv(inAmount1, FixedPoint96.Q96, sqrtPriceX96), FixedPoint96.Q96, sqrtPriceX96) +
                        inAmount0);
            }
            try
                SWAPROUTER.exactInputSingle(
                    ISwapRouter.ExactInputSingleParams({
                        tokenIn: address(WETH),
                        tokenOut: address(USDC),
                        fee: 3000,
                        recipient: address(this),
                        deadline: block.timestamp,
                        amountIn: swapAmount,
                        amountOutMinimum: 0,
                        sqrtPriceLimitX96: 0
                    })
                )
            {} catch {}

            balance0 = USDC.balanceOf(address(this));
            balance1 = WETH.balanceOf(address(this));

            (shares, inAmount0, inAmount1) = popsicle.deposit(balance0, balance1, address(DEGENBOX));

            totalShares = totalShares.add(shares);
        }
    }
}
