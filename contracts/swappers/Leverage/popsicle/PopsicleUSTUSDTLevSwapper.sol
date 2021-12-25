// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../../../interfaces/IPopsicle.sol";
import "../../../libraries/UniswapV3OneSidedUsingCurve.sol";
import "../../../interfaces/IBentoBoxV1.sol";
import "../../../interfaces/curve/ICurvePool.sol";
import "../../../interfaces/curve/ICurveUSTPool.sol";

/// @notice UST/USDT Popsicle Leverage Swapper for Ethereum
contract PopsicleUSTUSDTLevSwapper {
    using SafeTransferLib for ERC20;

    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    IPopsicle public immutable popsicle;

    CurvePool private constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurveUSTPool private constant UST3POOL = CurveUSTPool(0x890f4e345B1dAED0367A877a1612f86A1f86985f);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    IERC20 private constant UST = IERC20(0xa47c8bf37f92aBed4A126BDA807A7b7498661acD);
    ERC20 private constant USDT = ERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    uint256 private constant MIN_UST_IMBALANCE = 1 ether;
    uint256 private constant MIN_USDT_IMBALANCE = 1e6;

    IUniswapV3Pool private immutable pool;

    constructor(IPopsicle _popsicle) {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDT.safeApprove(address(_popsicle), type(uint256).max);
        USDT.safeApprove(address(UST3POOL), type(uint256).max);
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

        // MIM -> USDT on Curve MIM3POOL
        MIM3POOL.exchange_underlying(0, 3, mimAmount, 0, address(this));
        uint256 usdtAmount = USDT.balanceOf(address(this)); // account for some amounts left from previous leverages

        // Swap Amount USDT -> WETH to provide optimal 50/50 liquidity
        // Use UniswapV2 pair to avoid changing V3 liquidity balance
        {
            (uint160 sqrtRatioX, , , , , , ) = pool.slot0();

            (, uint256 balance1) = UniswapV3OneSidedUsingCurve.getAmountsToDeposit(
                UniswapV3OneSidedUsingCurve.GetAmountsToDepositParams({
                    sqrtRatioX: sqrtRatioX,
                    tickLower: popsicle.tickLower(),
                    tickUpper: popsicle.tickUpper(),
                    totalAmountIn: usdtAmount,
                    i: 3,
                    j: 0,
                    curvePool: CurvePool(address(UST3POOL)),
                    minToken0Imbalance: MIN_UST_IMBALANCE,
                    minToken1Imbalance: MIN_USDT_IMBALANCE,
                    amountInIsToken0: false
                })
            );

            UST3POOL.exchange_underlying(3, 0, usdtAmount - balance1, 0);
        }

        (uint256 shares, , ) = popsicle.deposit(UST.balanceOf(address(this)), USDT.balanceOf(address(this)), address(DEGENBOX));
        (, shareReturned) = DEGENBOX.deposit(IERC20(address(popsicle)), address(DEGENBOX), recipient, shares, 0);
        extraShare = shareReturned - shareToMin;
    }
}
