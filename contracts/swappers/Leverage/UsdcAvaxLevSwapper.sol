// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "../../libraries/Babylonian.sol";

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

contract UsdcAvaxLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0x1fC83f75499b7620d53757f0b01E2ae626aAE530);
    IUniswapV2Pair public constant USDCAVAX = IUniswapV2Pair(0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1);
    IUniswapV2Pair public constant MIMAVAX = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);
    IUniswapV2Router01 public constant ROUTER = IUniswapV2Router01(0x60aE616a2155Ee3d9A68541Ba4544862310933d4);

    uint256 private constant DEADLINE = 0xf000000000000000000000000000000000000000000000000000000000000000; // ~ placeholder for swap deadline

    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);
    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant USDC = IERC20(0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664);

    constructor() {
        USDCAVAX.approve(address(DEGENBOX), type(uint256).max);
        WAVAX.approve(address(ROUTER), type(uint256).max);
        USDC.approve(address(ROUTER), type(uint256).max);
    }

    function _calculateSwapInAmount(uint256 reserveIn, uint256 userIn) internal pure returns (uint256) {
        return (Babylonian.sqrt(reserveIn * ((userIn * 3988000) + (reserveIn * 3988009))) - (reserveIn * 1997)) / 1994;
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

    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amountFrom, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // Swap MIM to AVAX
        (uint256 reserve0, uint256 reserve1, ) = MIMAVAX.getReserves();
        uint256 avaxFromMim = _getAmountOut(amountFrom, reserve0, reserve1);
        MIM.transfer(address(MIMAVAX), amountFrom);
        MIMAVAX.swap(0, avaxFromMim, address(this), new bytes(0));

        // Determine optimal amount of AVAX to swap for liquidity providing
        (reserve0, reserve1, ) = USDCAVAX.getReserves();
        uint256 avaxSwapInAmount = _calculateSwapInAmount(reserve1, avaxFromMim);
        uint256 usdcAmount = _getAmountOut(avaxSwapInAmount, reserve1, reserve0);
        WAVAX.transfer(address(USDCAVAX), avaxSwapInAmount);
        USDCAVAX.swap(usdcAmount, 0, address(this), "");

        ROUTER.addLiquidity(
            address(USDC),
            address(WAVAX),
            USDC.balanceOf(address(this)),
            WAVAX.balanceOf(address(this)),
            1,
            1,
            address(this),
            DEADLINE
        );

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(USDCAVAX)), address(this), recipient, USDCAVAX.balanceOf(address(this)), 0);
        extraShare = shareReturned - shareToMin;
    }
}
