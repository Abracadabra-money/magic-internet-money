// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "../../../interfaces/IPopsicle.sol";
import "../../../libraries/UniswapV3OneSidedUsingCurve.sol";
import "../../../interfaces/IBentoBoxV1.sol";
import "../../../interfaces/curve/ICurvePool.sol";
import "../../../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../../../interfaces/Tether.sol";

/// @notice WBTC/WETH Popsicle Leverage Swapper for Ethereum
contract PopsicleWBTCWETHLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    IPopsicle public immutable popsicle;

    CurvePool private constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurveThreeCryptoPool public constant THREECRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 private constant WBTC = IERC20(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
    IERC20 public constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    Tether private constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    uint256 private constant MIN_WBTC_IMBALANCE = 1e3; // 0.00001 wBTC
    uint256 private constant MIN_WETH_IMBALANCE = 0.0002 ether;

    IUniswapV3Pool private immutable pool;

    constructor(IPopsicle _popsicle) {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        WBTC.approve(address(_popsicle), type(uint256).max);
        WETH.approve(address(_popsicle), type(uint256).max);
        WBTC.approve(address(THREECRYPTO), type(uint256).max);
        USDT.approve(address(THREECRYPTO), type(uint256).max);
        pool = IUniswapV3Pool(_popsicle.pool());
        popsicle = _popsicle;
    }

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDT
        MIM3POOL.exchange_underlying(0, 3, mimAmount, 0, address(this));

        // USDT -> WBTC
        THREECRYPTO.exchange(0, 1, USDT.balanceOf(address(this)), 0);
        uint256 wbtcAmount = WBTC.balanceOf(address(this));

        {
            (uint160 sqrtRatioX, , , , , , ) = pool.slot0();

            (uint256 balance0, ) = UniswapV3OneSidedUsingCurve.getAmountsToDeposit(
                UniswapV3OneSidedUsingCurve.GetAmountsToDepositParams({
                    sqrtRatioX: sqrtRatioX,
                    tickLower: popsicle.tickLower(),
                    tickUpper: popsicle.tickUpper(),
                    totalAmountIn: wbtcAmount,
                    i: 1,
                    j: 2,
                    pool: address(THREECRYPTO),
                    selector: CurveThreeCryptoPool.get_dy.selector,
                    minToken0Imbalance: MIN_WBTC_IMBALANCE,
                    minToken1Imbalance: MIN_WETH_IMBALANCE,
                    amountInIsToken0: true
                })
            );

            THREECRYPTO.exchange(1, 2, wbtcAmount - balance0, 0);
        }

        (uint256 shares, , ) = popsicle.deposit(WBTC.balanceOf(address(this)), WETH.balanceOf(address(this)), address(DEGENBOX));
        (, shareReturned) = DEGENBOX.deposit(IERC20(address(popsicle)), address(DEGENBOX), recipient, shares, 0);
        extraShare = shareReturned - shareToMin;
    }
}
