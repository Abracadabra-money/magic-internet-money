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

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
}

interface IBentoBoxV1 {
    function withdraw(IERC20 token, address from, address to, uint256 amount, uint256 share) external returns(uint256, uint256);
    function deposit(IERC20 token, address from, address to, uint256 amount, uint256 share) external returns(uint256, uint256);
}

contract UsdcAvaxLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0x1fC83f75499b7620d53757f0b01E2ae626aAE530);
    IUniswapV2Pair public constant USDCAVAX = IUniswapV2Pair(0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1);
    IUniswapV2Router01 public constant ROUTER = IUniswapV2Router01(0x60aE616a2155Ee3d9A68541Ba4544862310933d4);

    uint256 private constant DEADLINE = 0xf000000000000000000000000000000000000000000000000000000000000000; // ~ placeholder for swap deadline

    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant USDC = IERC20(0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664);

    // TODO: Update addresses
    IERC20 public constant ThreePoolToken = IERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);
    CurvePool public constant MIM3POOL = CurvePool(address(0));
    CurvePool public constant THREEPOOL = CurvePool(address(0));

    constructor() {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        ThreePoolToken.approve(address(THREEPOOL), type(uint256).max);
        USDCAVAX.approve(address(DEGENBOX), type(uint256).max);
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
        uint256 amountIntermediate = MIM3POOL.exchange(0, 1, amountFrom, 0);

        // TODO: Update to right pool index for USDC
        uint256 usdcAmount = THREEPOOL.exchange(1, 0, amountIntermediate, 0);
        (uint256 reserve0, uint256 reserve1, ) = USDCAVAX.getReserves();
        uint256 usdcSwapInAmount = _calculateSwapInAmount(reserve0, usdcAmount);
        uint256 avaxAmount = _getAmountOut(usdcSwapInAmount, reserve0, reserve1);
        USDC.transfer(address(USDCAVAX), avaxAmount);
        USDCAVAX.swap(0, avaxAmount, address(this), "");

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