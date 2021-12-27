// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../../../interfaces/IPopsicle.sol";
import "../../../libraries/UniswapV3OneSidedUsingCurve.sol";
import "../../../interfaces/IBentoBoxV1.sol";
import "../../../interfaces/curve/ICurvePool.sol";
import "../../../interfaces/curve/ICurveUSTPool.sol";

/// @notice USDC/UST Popsicle Leverage Swapper for Ethereum
contract PopsicleUSDCUSTLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    IPopsicle public immutable popsicle;

    CurvePool private constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurveUSTPool private constant UST3POOL = CurveUSTPool(0x890f4e345B1dAED0367A877a1612f86A1f86985f);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    IERC20 private constant UST = IERC20(0xa47c8bf37f92aBed4A126BDA807A7b7498661acD);
    IERC20 private constant USDC = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    uint256 private constant MIN_USDC_IMBALANCE = 1e6;
    uint256 private constant MIN_UST_IMBALANCE = 1 ether;

    IUniswapV3Pool private immutable pool;

    constructor(IPopsicle _popsicle) {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDC.approve(address(_popsicle), type(uint256).max);
        USDC.approve(address(UST3POOL), type(uint256).max);
        UST.approve(address(_popsicle), type(uint256).max);
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
        uint256 usdcAmount = USDC.balanceOf(address(this));

        {
            (uint160 sqrtRatioX, , , , , , ) = pool.slot0();

            (uint256 balance0, ) = UniswapV3OneSidedUsingCurve.getAmountsToDeposit(
                UniswapV3OneSidedUsingCurve.GetAmountsToDepositParams({
                    sqrtRatioX: sqrtRatioX,
                    tickLower: popsicle.tickLower(),
                    tickUpper: popsicle.tickUpper(),
                    totalAmountIn: usdcAmount,
                    i: 2,
                    j: 0,
                    pool: address(UST3POOL),
                    selector: CurvePool.get_dy_underlying.selector,
                    minToken0Imbalance: MIN_USDC_IMBALANCE,
                    minToken1Imbalance: MIN_UST_IMBALANCE,
                    amountInIsToken0: true
                })
            );

            UST3POOL.exchange_underlying(2, 0, usdcAmount - balance0, 0);
        }

        (uint256 shares, , ) = popsicle.deposit(USDC.balanceOf(address(this)), UST.balanceOf(address(this)), address(DEGENBOX));
        (, shareReturned) = DEGENBOX.deposit(IERC20(address(popsicle)), address(DEGENBOX), recipient, shares, 0);
        extraShare = shareReturned - shareToMin;
    }
}
