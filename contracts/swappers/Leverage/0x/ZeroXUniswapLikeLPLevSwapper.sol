// SPDX-License-Identifier: MIT
// solhint-disable avoid-low-level-calls
pragma solidity 0.8.10;

import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";

import "../../../interfaces/IBentoBoxV1Minimal.sol";
import "../../../interfaces/ILevSwapperV2.sol";
import "../../../libraries/UniswapV2OneSidedUsingUniV2.sol";

/// @notice Generic LP leverage swapper for Uniswap like compatible DEX using Matcha/0x aggregator
contract ZeroXUniswapLikeLPLevSwapper is ILevSwapperV2 {
    using SafeTransferLib for ERC20;

    error ErrToken0SwapFailed();
    error ErrToken1SwapFailed();

    IBentoBoxV1Minimal public immutable bentoBox;
    IUniswapV2Pair public immutable pair;
    IUniswapV2Router01 public immutable router;
    ERC20 public immutable mim;
    ERC20 public immutable token0;
    ERC20 public immutable token1;

    address public immutable zeroXExchangeProxy;

    /// @dev The minimum amount of amount0 and amount1 amounts to trigger adding extra liquidity
    // from it using one-sided
    uint256 public immutable minOneSideableAmount0;
    uint256 public immutable minOneSideableAmount1;

    constructor(
        IBentoBoxV1Minimal _bentoBox,
        IUniswapV2Router01 _router,
        IUniswapV2Pair _pair,
        ERC20 _mim,
        address _zeroXExchangeProxy,
        uint256 _minOneSideableAmount0,
        uint256 _minOneSideableAmount1
    ) {
        bentoBox = _bentoBox;
        router = _router;
        pair = _pair;
        mim = _mim;
        zeroXExchangeProxy = _zeroXExchangeProxy;
        minOneSideableAmount0 = _minOneSideableAmount0;
        minOneSideableAmount1 = _minOneSideableAmount1;

        ERC20 _token0 = ERC20(_pair.token0());
        ERC20 _token1 = ERC20(_pair.token1());
        token0 = _token0;
        token1 = _token1;

        _token0.safeApprove(address(_router), type(uint256).max);
        _token1.safeApprove(address(_router), type(uint256).max);
        _mim.approve(_zeroXExchangeProxy, type(uint256).max);
    }

    /// @inheritdoc ILevSwapperV2
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom,
        bytes calldata data
    ) external override returns (uint256 extraShare, uint256 shareReturned) {
        // 0: MIM -> token0
        // 1: MIM -> token1
        bytes[] memory swapData = abi.decode(data, (bytes[]));

        bentoBox.withdraw(address(mim), address(this), address(this), 0, shareFrom);

        // MIM -> token0
        (bool success, ) = zeroXExchangeProxy.call(swapData[0]);
        if (!success) {
            revert ErrToken0SwapFailed();
        }

        // MIM -> token1
        (success, ) = zeroXExchangeProxy.call(swapData[1]);
        if (!success) {
            revert ErrToken1SwapFailed();
        }

        uint256 liquidity;

        {
            uint256 token0Amount = token0.balanceOf(address(this));
            uint256 token1Amount = token1.balanceOf(address(this));
            (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();

            UniswapV2OneSidedUsingUniV2.AddLiquidityAndOneSideRemainingParams memory params = UniswapV2OneSidedUsingUniV2.AddLiquidityAndOneSideRemainingParams(
                router,
                pair,
                address(token0),
                address(token1),
                reserve0,
                reserve1,
                token0Amount,
                token1Amount,
                minOneSideableAmount0,
                minOneSideableAmount1,
                address(bentoBox)
            );

            (, , liquidity) = UniswapV2OneSidedUsingUniV2.addLiquidityAndOneSideRemaining(params);
        }

        (, shareReturned) = bentoBox.deposit(address(pair), address(bentoBox), recipient, liquidity, 0);
        extraShare = shareReturned - shareToMin;
    }
}
