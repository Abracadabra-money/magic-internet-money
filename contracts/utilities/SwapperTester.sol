// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "../interfaces/IBentoBoxV1Minimal.sol";

interface ISwapper {
    function swap(
        address fromToken,
        address toToken,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) external returns (uint256 extraShare, uint256 shareReturned);
}

interface ILevSwapper {
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) external returns (uint256 extraShare, uint256 shareReturned);
}

contract SwapperTester is Ownable {
    using SafeTransferLib for ERC20;

    address public mim;

    constructor(address _mim) {
        mim = _mim;
    }

    function testLiquidation(
        address degenBox,
        address swapper,
        address collateral,
        uint256 amount,
        uint256 shareToMin
    ) external onlyOwner {
        ERC20(collateral).transferFrom(msg.sender, address(degenBox), amount);
        IBentoBoxV1Minimal(degenBox).deposit(collateral, degenBox, swapper, amount, 0);

        uint256 shareFrom = IBentoBoxV1Minimal(degenBox).toShare(collateral, amount, false);
        ISwapper(swapper).swap(address(0), address(0), address(this), shareToMin, shareFrom);

        uint256 mimShare = IBentoBoxV1Minimal(degenBox).balanceOf(mim, address(this));
        IBentoBoxV1Minimal(degenBox).withdraw(mim, address(this), msg.sender, 0, mimShare);
    }

    function testLeveraging(
        address degenBox,
        address swapper,
        address collateral,
        uint256 amount,
        uint256 shareToMin
    ) external onlyOwner {
        ERC20(mim).transferFrom(msg.sender, address(degenBox), amount);
        IBentoBoxV1Minimal(degenBox).deposit(mim, degenBox, swapper, amount, 0);

        uint256 shareFrom = IBentoBoxV1Minimal(degenBox).toShare(mim, amount, false);
        ILevSwapper(swapper).swap(address(this), shareToMin, shareFrom);

        uint256 collateralShare = IBentoBoxV1Minimal(degenBox).balanceOf(collateral, address(this));
        IBentoBoxV1Minimal(degenBox).withdraw(collateral, address(this), msg.sender, 0, collateralShare);
    }

    function withdraw(
        ERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
