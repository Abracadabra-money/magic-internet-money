// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/yearn/IYearnVault.sol";
import "../../interfaces/ILevSwapperGeneric.sol";

contract YVDAILevSwapper is ILevSwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IYearnVault public constant DAI_VAULT = IYearnVault(0xdA816459F1AB5631232FE5e97a05BBBb94970c95);

    constructor() {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        DAI.approve(address(DAI_VAULT), type(uint256).max);
    }

    /// @inheritdoc ILevSwapperGeneric
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> DAI
        amount = MIM3POOL.exchange_underlying(0, 1, amount, 0, address(this));

        // DAI -> DAI_VAULT
        amount = DAI_VAULT.deposit(amount, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(DAI_VAULT)), address(DEGENBOX), recipient, amount, 0);
        extraShare = shareReturned - shareToMin;
    }
}
