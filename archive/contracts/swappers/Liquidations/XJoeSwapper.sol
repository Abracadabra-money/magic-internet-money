// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
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

interface JoeBar {
    function leave(uint256 share) external;
}

contract XJoeSwapper is ISwapperGeneric {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0x1fC83f75499b7620d53757f0b01E2ae626aAE530);

    JoeBar public constant JOEBAR = JoeBar(0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33);
    IERC20 public constant JOE = IERC20(0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd);
    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);

    IUniswapV2Pair public constant JOE_WAVAX = IUniswapV2Pair(0x454E67025631C065d3cFAD6d71E6892f74487a15);
    IUniswapV2Pair public constant MIM_WAVAX = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);

    constructor() {
        MIM.approve(address(DEGENBOX), type(uint256).max);
    }

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

    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amountFrom, ) = DEGENBOX.withdraw(IERC20(address(JOEBAR)), address(this), address(this), 0, shareFrom);
        JOEBAR.leave(amountFrom);

        // swap JOE to AVAX
        uint256 joeAmount = JOE.balanceOf(address(this));
        (uint256 reserve0, uint256 reserve1, ) = JOE_WAVAX.getReserves();
        uint256 avaxFromJoe = _getAmountOut(joeAmount, reserve0, reserve1);
        JOE.transfer(address(JOE_WAVAX), joeAmount);
        JOE_WAVAX.swap(0, avaxFromJoe, address(this), new bytes(0));

        // swap AVAX to MIM
        (reserve0, reserve1, ) = MIM_WAVAX.getReserves();
        uint256 mimFromAvax = _getAmountOut(avaxFromJoe, reserve1, reserve0);
        WAVAX.transfer(address(MIM_WAVAX), avaxFromJoe);
        MIM_WAVAX.swap(mimFromAvax, 0, address(this), new bytes(0));

        (, shareReturned) = DEGENBOX.deposit(MIM, address(this), recipient, mimFromAvax, 0);
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
    ) public override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
