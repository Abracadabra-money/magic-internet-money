// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../../interfaces/yearn/IYearnVault.sol";
import "../../interfaces/Tether.sol";
import "../../interfaces/ISwapperGeneric.sol";

contract YVCVXETHSwapper is ISwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool public constant CVXETHPOOL = CurvePool(0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4);
    IYearnVault public constant YVCVXETH = IYearnVault(0x1635b506a88fBF428465Ad65d00e8d6B6E5846C3);
    Tether public constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    CurveThreeCryptoPool public constant THREECRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);

    constructor() {
        WETH.approve(address(THREECRYPTO), type(uint256).max);
        USDT.approve(address(MIM3POOL), type(uint256).max);
    }

    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        DEGENBOX.withdraw(IERC20(address(YVCVXETH)), address(this), address(this), 0, shareFrom);

        // Yearn CVXETH -> Curve CVXETH
        uint256 cvxEthAmount = YVCVXETH.withdraw();

        // Curve CVXETH -> WETH
        uint256 wethAmount = CVXETHPOOL.remove_liquidity_one_coin(cvxEthAmount, uint256(0), 0);

        // WETH -> USDT
        THREECRYPTO.exchange(2, 0, wethAmount, 0);

        // USDT -> MIM
        uint256 mimAmount = MIM3POOL.exchange_underlying(3, 0, USDT.balanceOf(address(this)), 0, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(MIM, address(DEGENBOX), recipient, mimAmount, 0);
        extraShare = shareReturned - shareToMin;
    }

    /// @inheritdoc ISwapperGeneric
    function swapExact(
        IERC20,
        IERC20,
        address,
        address,
        uint256,
        uint256
    ) public pure override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
