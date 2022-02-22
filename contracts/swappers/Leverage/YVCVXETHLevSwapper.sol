// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../../interfaces/yearn/IYearnVault.sol";
import "../../interfaces/Tether.sol";

contract YVCVXETHLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool public constant CVXETH = CurvePool(0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4);
    IYearnVault public constant YVCVXETH = IYearnVault(0x1635b506a88fBF428465Ad65d00e8d6B6E5846C3);
    Tether public constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    CurveThreeCryptoPool public constant THREECRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);

    constructor() {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDT.approve(address(THREECRYPTO), type(uint256).max);
        CVXETH.approve(address(YVCVXETH), type(uint256).max);
    }

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDT
        uint256 usdtAmount = MIM3POOL.exchange_underlying(0, 3, mimAmount, 0, address(this));

        // USDT -> WETH
        THREECRYPTO.exchange(0, 2, usdtAmount, 0);

        // WETH -> Curve CVXETH
        uint256[2] memory amounts = [WETH.balanceOf(address(this)), 0];
        CVXETH.add_liquidity(amounts, 0);

        // Curve CVXETH -> Yearn CVXETH
        uint256 yvCvxEthAmount = YVCVXETH.deposit(type(uint256).max, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(YVCVXETH)), address(DEGENBOX), recipient, yvCvxEthAmount, 0);
        extraShare = shareReturned - shareToMin;
    }
}
