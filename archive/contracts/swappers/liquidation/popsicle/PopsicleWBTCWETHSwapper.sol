// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";

import "../../../interfaces/ISwapperGeneric.sol";
import "../../../interfaces/IPopsicle.sol";
import "../../../interfaces/curve/ICurvePool.sol";
import "../../../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../../../interfaces/IBentoBoxV1.sol";

/// @notice WBTC/WETH Popsicle Swapper for Ethereum
contract PopsicleWBTCWETHSwapper is ISwapperGeneric {
    using SafeTransferLib for ERC20;

    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurveThreeCryptoPool public constant THREECRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 private constant WBTC = IERC20(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
    IERC20 public constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ERC20 private constant USDT = ERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    IPopsicle public immutable popsicle;

    constructor(IPopsicle _popsicle) {
        popsicle = _popsicle;
        WBTC.approve(address(THREECRYPTO), type(uint256).max);
        WETH.approve(address(THREECRYPTO), type(uint256).max);
        USDT.safeApprove(address(MIM3POOL), type(uint256).max);
    }

    // Swaps to a flexible amount, from an exact input amount
    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amountFrom, ) = DEGENBOX.withdraw(IERC20(address(popsicle)), address(this), address(this), 0, shareFrom);
        (uint256 wbtcAmount, uint256 wethAmount) = popsicle.withdraw(amountFrom, address(this));

        // WBTC -> USDT
        THREECRYPTO.exchange(1, 0, wbtcAmount, 0);

        // WETH -> USDT
        THREECRYPTO.exchange(2, 0, wethAmount, 0);

        // USDT -> MIM
        uint256 mimAmount = MIM3POOL.exchange_underlying(3, 0, USDT.balanceOf(address(this)), 0, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(MIM, address(DEGENBOX), recipient, mimAmount, 0);
        extraShare = shareReturned - shareToMin;
    }

    // Swaps to an exact amount, from a flexible input amount
    /// @inheritdoc ISwapperGeneric
    function swapExact(
        IERC20,
        IERC20,
        address,
        address,
        uint256,
        uint256
    ) public pure virtual returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
