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

contract MimFtmLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616);
    IUniswapV2Pair public constant MIMFTM = IUniswapV2Pair(0xB32b31DfAfbD53E310390F641C7119b5B9Ea0488);
    IUniswapV2Router01 public constant ROUTER = IUniswapV2Router01(0x16327E3FbDaCA3bcF7E38F5Af2599D2DDc33aE52);

    uint256 private constant DEADLINE = 0xf000000000000000000000000000000000000000000000000000000000000000; // ~ placeholder for swap deadline

    IERC20 public constant MIM = IERC20(0x82f0B8B456c1A451378467398982d4834b6829c1);
    IERC20 public constant WFTM = IERC20(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);

    constructor() {
        MIMFTM.approve(address(DEGENBOX), type(uint256).max);
        MIM.approve(address(ROUTER), type(uint256).max);
        WFTM.approve(address(ROUTER), type(uint256).max);
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

        // Determine optimal amount of AVAX to swap for liquidity providing
        (uint256 reserve1, uint256 reserve0, ) = MIMFTM.getReserves();
        uint256 mimSwapInAmount = _calculateSwapInAmount(reserve1, amountFrom);
        uint256 avaxAmount = _getAmountOut(mimSwapInAmount, reserve0, reserve1);
        MIM.transfer(address(MIMFTM), mimSwapInAmount);
        MIMFTM.swap(avaxAmount, 0, address(this), "");

        ROUTER.addLiquidity(
            address(MIM),
            address(WFTM),
            MIM.balanceOf(address(this)),
            WFTM.balanceOf(address(this)),
            1,
            1,
            address(this),
            DEADLINE
        );

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(MIMFTM)), address(this), recipient, MIMFTM.balanceOf(address(this)), 0);
        extraShare = shareReturned - shareToMin;
    }
}
