// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Router01.sol";
import "../../libraries/Babylonian.sol";
import "../../interfaces/ILevSwapperGeneric.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/platypus/IPlatypusRouter01.sol";

contract UsdceAvaxLevSwapperV2 is ILevSwapperGeneric {
    IBentoBoxV1 public immutable DEGENBOX;
    IUniswapV2Pair public constant USDCEAVAX = IUniswapV2Pair(0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1);
    IUniswapV2Pair public constant MIMAVAX = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);
    IUniswapV2Router01 public constant ROUTER = IUniswapV2Router01(0x60aE616a2155Ee3d9A68541Ba4544862310933d4);
    IPlatypusRouter01 public constant PLATYPUS_ROUTER = IPlatypusRouter01(0x73256EC7575D999C360c1EeC118ECbEFd8DA7D12);

    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);
    IERC20 public constant USDC = IERC20(0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E);
    IERC20 public constant USDCE = IERC20(0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664);

    constructor(IBentoBoxV1 _DEGENBOX) {
        DEGENBOX = _DEGENBOX;
        USDCEAVAX.approve(address(_DEGENBOX), type(uint256).max);
        MIM.approve(address(PLATYPUS_ROUTER), type(uint256).max);
        WAVAX.approve(address(ROUTER), type(uint256).max);
        USDCE.approve(address(ROUTER), type(uint256).max);
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
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDC.e
        {
            address[] memory tokenPath = new address[](3);
            tokenPath[0] = address(MIM);
            tokenPath[1] = address(USDC);
            tokenPath[2] = address(USDCE);
            address[] memory poolPath = new address[](2);
            poolPath[0] = address(0x30C30d826be87Cd0A4b90855C2F38f7FcfE4eaA7); // MIM -> USDC
            poolPath[1] = address(0x66357dCaCe80431aee0A7507e2E361B7e2402370); // USDC -> USDC.e

            (amount, ) = PLATYPUS_ROUTER.swapTokensForTokens(tokenPath, poolPath, amount, 0, address(this), type(uint256).max);
        }

        // 50% USDC.e -> WAVAX
        (uint256 reserve0, uint256 reserve1, ) = USDCEAVAX.getReserves();

        // Get USDC.e amount to swap for AVAX
        uint256 amountUsdceSwapIn = _calculateSwapInAmount(reserve0, amount);
        
        // AVAX amount out
        amount = _getAmountOut(amountUsdceSwapIn, reserve0, reserve1);

        USDCE.transfer(address(USDCEAVAX), amountUsdceSwapIn);
        USDCEAVAX.swap(0, amount, address(this), "");

        ROUTER.addLiquidity(
            address(USDCE),
            address(WAVAX),
            USDCE.balanceOf(address(this)),
            WAVAX.balanceOf(address(this)),
            0,
            0,
            address(this),
            type(uint256).max
        );

        (, shareReturned) = DEGENBOX.deposit(IERC20(address(USDCEAVAX)), address(this), recipient, USDCEAVAX.balanceOf(address(this)), 0);
        extraShare = shareReturned - shareToMin;
    }
}
