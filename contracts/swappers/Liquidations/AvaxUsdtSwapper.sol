// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/ISwapperGeneric.sol";

interface IBentoBoxV1 {
    function withdraw(
        IERC20 token,
        address from,
        address to,
        uint256 amount,
        uint256 share
    ) external returns (uint256, uint256);

    function deposit(
        IERC20 token,
        address from,
        address to,
        uint256 amount,
        uint256 share
    ) external returns (uint256, uint256);
}

contract AvaxUsdtSwapper is ISwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0x1fC83f75499b7620d53757f0b01E2ae626aAE530);
    IUniswapV2Pair public constant AVAXUSDT = IUniswapV2Pair(0xeD8CBD9F0cE3C6986b22002F03c6475CEb7a6256);
    IUniswapV2Pair public constant MIMAVAX = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);
    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);
    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant USDT = IERC20(0xc7198437980c041c805A1EDcbA50c1Ce5db95118);

    constructor() {
        MIM.approve(address(DEGENBOX), type(uint256).max);
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
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
        (uint256 amountFrom, ) = DEGENBOX.withdraw(IERC20(address(AVAXUSDT)), address(this), address(this), 0, shareFrom);

        AVAXUSDT.transfer(address(AVAXUSDT), amountFrom);
        (uint256 avaxAmount, uint256 usdtAmount) = AVAXUSDT.burn(address(this));
        
        // swap USDT to AVAX
        (uint256 reserve0, uint256 reserve1, ) = AVAXUSDT.getReserves();
        uint256 avaxFromUsdt = _getAmountOut(usdtAmount, reserve1, reserve0);
        USDT.transfer(address(AVAXUSDT), usdtAmount);
        AVAXUSDT.swap(avaxFromUsdt, 0, address(this), new bytes(0));
        avaxAmount += avaxFromUsdt;

        // swap AVAX to MIM
        (reserve0, reserve1, ) = MIMAVAX.getReserves();
        uint256 mimFromAvax = _getAmountOut(avaxAmount, reserve1, reserve0);
        WAVAX.transfer(address(MIMAVAX), avaxAmount);
        MIMAVAX.swap(mimFromAvax, 0, address(this), new bytes(0));

        (, shareReturned) = DEGENBOX.deposit(MIM, address(this), recipient, mimFromAvax, 0);
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
    ) public override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
