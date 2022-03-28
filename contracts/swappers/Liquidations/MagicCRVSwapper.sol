// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/ISwapperGeneric.sol";

interface IMagicCRV {
    function totalSupply() external view returns (uint256);

    function totalCRVTokens() external view returns (uint256);
}

interface IMIMMagicCrvPool {
    function exchangeToMim(uint256 amountIn, address recipient) external returns (uint256 amountOut);
}

contract MagicCRVSwapper is ISwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public immutable magicCRV;

    constructor(
        IERC20 _magicCRV
    ) {
        magicCRV = _magicCRV;

        MIM.approve(address(DEGENBOX), type(uint256).max);
    }

    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amount, ) = DEGENBOX.withdraw(magicCRV, address(this), address(this), 0, shareFrom);
        
        // TODO

        (, shareReturned) = DEGENBOX.deposit(MIM, address(DEGENBOX), recipient, amount, 0);
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
