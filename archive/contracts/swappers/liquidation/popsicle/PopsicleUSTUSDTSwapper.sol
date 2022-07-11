// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../../interfaces/ISwapperGeneric.sol";
import "../../../interfaces/IPopsicle.sol";
import "../../../interfaces/IBentoBoxV1.sol";
import "../../../interfaces/curve/ICurvePool.sol";
import "../../../interfaces/Tether.sol";

/// @notice UST/USDT Popsicle Swapper for Ethereum
contract PopsicleUSTUSDTSwapper is ISwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool public constant UST2POOL = CurvePool(0x55A8a39bc9694714E2874c1ce77aa1E599461E18);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant UST = IERC20(0xa47c8bf37f92aBed4A126BDA807A7b7498661acD);
    Tether public constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    IPopsicle public immutable popsicle;

    constructor(IPopsicle _popsicle) {
        popsicle = _popsicle;
        UST.approve(address(UST2POOL), type(uint256).max);
        USDT.approve(address(MIM3POOL), type(uint256).max);
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
        (uint256 ustAmount, uint256 usdtAmount) = popsicle.withdraw(amountFrom, address(this));

        // UST -> MIM
        uint256 mimAmount = UST2POOL.exchange(1, 0, ustAmount, 0, address(DEGENBOX));

        // USDT -> MIM
        mimAmount += MIM3POOL.exchange_underlying(3, 0, usdtAmount, 0, address(DEGENBOX));
        
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
