// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase, var-name-mixedcase
pragma solidity 0.8.10;

import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/yearn/IYearnVault.sol";
import "../../interfaces/ISwapperGeneric.sol";

contract YVDAISwapper is ISwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IERC20 public constant DAI = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IYearnVault public constant DAI_VAULT = IYearnVault(0xdA816459F1AB5631232FE5e97a05BBBb94970c95);

    constructor() {
        DAI.approve(address(MIM3POOL), type(uint256).max);
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
        DEGENBOX.withdraw(IERC20(address(DAI_VAULT)), address(this), address(this), 0, shareFrom);

        // yvDAI -> DAI
        uint256 amount = DAI_VAULT.withdraw();

        // DAI -> MIM
        amount = MIM3POOL.exchange_underlying(1, 0, amount, 0, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(MIM, address(DEGENBOX), recipient, amount, 0);
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
    ) public pure override returns (uint256 shareUsed, uint256 shareReturned) {
        return (1, 1);
    }
}
