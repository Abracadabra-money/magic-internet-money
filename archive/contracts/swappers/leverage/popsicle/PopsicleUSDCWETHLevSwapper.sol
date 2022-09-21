// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/LowGasSafeMath.sol";

import "../../../interfaces/IPopsicle.sol";
import "../../../libraries/UniswapV3OneSidedUsingUniV2.sol";

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
    IPopsicle public immutable popsicle;

    CurvePool private constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    IERC20 private constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 private constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IUniswapV2Pair private constant USDCWETH = IUniswapV2Pair(0x397FF1542f962076d0BFE58eA045FfA2d347ACa0);

    uint256 private constant MIN_USDC_IMBALANCE = 1e6;
    uint256 private constant MIN_WETH_IMBALANCE = 0.0002 ether;

    IUniswapV3Pool private immutable pool;

    constructor(IPopsicle _popsicle) {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDC.approve(address(_popsicle), type(uint256).max);
        WETH.approve(address(_popsicle), type(uint256).max);
        pool = IUniswapV3Pool(_popsicle.pool());
        popsicle = _popsicle;
    }

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDC on Curve MIM3POOL
        MIM3POOL.exchange_underlying(0, 2, mimAmount, 0, address(this));
        uint256 usdcAmount = USDC.balanceOf(address(this)); // account for some amounts left from previous leverages

        // Swap Amount USDC -> WETH to provide optimal 50/50 liquidity
        // Use UniswapV2 pair to avoid changing V3 liquidity balance
        {
            (uint256 reserve0, uint256 reserve1, ) = USDCWETH.getReserves();
            (uint160 sqrtRatioX, , , , , , ) = pool.slot0();

            (uint256 balance0, uint256 balance1) = UniswapV3OneSidedUsingUniV2.getAmountsToDeposit(
                UniswapV3OneSidedUsingUniV2.GetAmountsToDepositParams({
                    sqrtRatioX: sqrtRatioX,
                    tickLower: popsicle.tickLower(),
                    tickUpper: popsicle.tickUpper(),
                    totalAmountIn: usdcAmount,
                    reserve0: reserve0,
                    reserve1: reserve1,
                    minToken0Imbalance: MIN_USDC_IMBALANCE,
                    minToken1Imbalance: MIN_WETH_IMBALANCE,
                    amountInIsToken0: true
                })
            );
            USDC.transfer(address(USDCWETH), usdcAmount.sub(balance0));
            USDCWETH.swap(0, balance1, address(this), new bytes(0));
        }

        (uint256 shares, , ) = popsicle.deposit(USDC.balanceOf(address(this)), WETH.balanceOf(address(this)), address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(popsicle)), address(DEGENBOX), recipient, shares, 0);
        extraShare = shareReturned - shareToMin;
    }
}
