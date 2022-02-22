// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/yearn/IYearnVault.sol";
import "../../interfaces/ILevSwapperGeneric.sol";

interface CurvePool {
    function add_liquidity(
        address pool,
        uint256[4] memory amounts,
        uint256 _min_mint_amount
    ) external returns (uint256);
}

contract YVMIM3CrvLevSwapper is ILevSwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant THREEPOOL = CurvePool(0xA79828DF1850E8a3A3064576f380D90aECDD3359);
    IERC20 public constant MIM3CRV = IERC20(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IYearnVault public constant YVMIM3CRV = IYearnVault(0x2DfB14E32e2F8156ec15a2c21c3A6c053af52Be8);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    constructor() {
        MIM.approve(address(THREEPOOL), type(uint256).max);
        MIM3CRV.approve(address(YVMIM3CRV), type(uint256).max);
    }

    /// @inheritdoc ILevSwapperGeneric
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 mimAmount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> MIM3CRV
        // MIM, DAI, USDC, USDT
        uint256[4] memory amounts = [mimAmount, 0, 0, 0];
        uint256 mim3CrvAmount = THREEPOOL.add_liquidity(address(MIM3CRV), amounts, 0);

        // MIM3CRV -> YVMIM3CRV
        uint256 yvMim3CrvAmount = YVMIM3CRV.deposit(mim3CrvAmount, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(YVMIM3CRV)), address(DEGENBOX), recipient, yvMim3CrvAmount, 0);
        extraShare = shareReturned - shareToMin;
    }
}
