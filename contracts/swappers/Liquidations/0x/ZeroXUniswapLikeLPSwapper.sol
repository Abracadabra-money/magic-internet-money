// SPDX-License-Identifier: MIT
// solhint-disable avoid-low-level-calls
pragma solidity >= 0.8.10;

import "solmate/src/tokens/ERC20.sol";
import "solmate/src/utils/SafeTransferLib.sol";

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";

import "../../../interfaces/IBentoBoxV1Minimal.sol";
import "../../../interfaces/ISwapperV2.sol";

/// @notice Generic LP liquidation/deleverage swapper for Uniswap like compatible DEX using Matcha/0x aggregator
contract ZeroXUniswapLikeLPSwapper is ISwapperV2 {
    using SafeTransferLib for ERC20;

    error ErrToken0SwapFailed();
    error ErrToken1SwapFailed();

    IBentoBoxV1Minimal public immutable bentoBox;
    IUniswapV2Pair public immutable pair;
    ERC20 public immutable mim;

    address public immutable zeroXExchangeProxy;

    constructor(
        address _bentoBox,
        address _pair,
        address _mim,
        address _zeroXExchangeProxy
    ) {
        bentoBox = IBentoBoxV1Minimal(_bentoBox);
        pair = IUniswapV2Pair(_pair);
        mim = ERC20(_mim);
        zeroXExchangeProxy = _zeroXExchangeProxy;

        ERC20(pair.token0()).safeApprove(_zeroXExchangeProxy, type(uint256).max);
        ERC20(pair.token1()).safeApprove(_zeroXExchangeProxy, type(uint256).max);

        mim.approve(address(_bentoBox), type(uint256).max);
    }

    /// @inheritdoc ISwapperV2
    function swap(
        address,
        address,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom,
        bytes calldata data
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        // 0: token0 -> MIM
        // 1: token1 -> MIM
        bytes[] memory swapData = abi.decode(data, (bytes[]));

        (uint256 amountFrom, ) = bentoBox.withdraw(address(pair), address(this), address(this), 0, shareFrom);

        pair.transfer(address(pair), amountFrom);
        pair.burn(address(this));

        // token0 -> MIM
        (bool success, ) = zeroXExchangeProxy.call(swapData[0]);
        if (!success) {
            revert ErrToken0SwapFailed();
        }

        // token1 -> MIM
        (success, ) = zeroXExchangeProxy.call(swapData[1]);
        if (!success) {
            revert ErrToken1SwapFailed();
        }

        (, shareReturned) = bentoBox.deposit(address(mim), address(this), recipient, mim.balanceOf(address(this)), 0);
        extraShare = shareReturned - shareToMin;
    }

    /// @inheritdoc ISwapperV2
    function swapExact(
        address,
        address,
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (uint256, uint256) {
        return (0, 0);
    }
}
