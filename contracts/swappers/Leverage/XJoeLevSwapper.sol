// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address recipient, uint256 amount) external returns (bool);
}

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

interface JoeBar is IERC20 {
    function enter(uint256 amount) external;
}

contract XJoeLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0x1fC83f75499b7620d53757f0b01E2ae626aAE530);
    JoeBar public constant JOEBAR = JoeBar(0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33);
    IERC20 public constant JOE = IERC20(0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd);
    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);

    IUniswapV2Pair public constant MIM_WAVAX = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);
    IUniswapV2Pair public constant JOE_WAVAX = IUniswapV2Pair(0x454E67025631C065d3cFAD6d71E6892f74487a15);

    constructor() {
        JOE.approve(address(JOEBAR), type(uint256).max);
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

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amountFrom, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // Swap MIM to AVAX
        (uint256 reserve0, uint256 reserve1, ) = MIM_WAVAX.getReserves();
        uint256 avaxFromMim = _getAmountOut(amountFrom, reserve0, reserve1);
        MIM.transfer(address(MIM_WAVAX), amountFrom);
        MIM_WAVAX.swap(0, avaxFromMim, address(this), new bytes(0));

        // Swap AVAX to JOE
        (reserve0, reserve1, ) = JOE_WAVAX.getReserves();
        uint256 joeFromAvax = _getAmountOut(avaxFromMim, reserve1, reserve0);
        WAVAX.transfer(address(JOE_WAVAX), avaxFromMim);
        JOE_WAVAX.swap(joeFromAvax, 0, address(this), new bytes(0));

        JOEBAR.enter(joeFromAvax);
        uint256 amountTo = JOEBAR.balanceOf(address(this));

        JOEBAR.transfer(address(DEGENBOX), amountTo);
        (, shareReturned) = DEGENBOX.deposit(JOEBAR, address(DEGENBOX), recipient, amountTo, 0);
        extraShare = shareReturned - shareToMin;
    }
}
