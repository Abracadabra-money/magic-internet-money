// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/ISwapperGeneric.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/platypus/IPlatypusRouter01.sol";

/// @notice Joe USDCE.e/WAVAX swapper using Platypus for swapping USDCE.e to MIM
contract UsdceAvaxSwapperV2 is ISwapperGeneric {
    IBentoBoxV1 public immutable DEGENBOX;

    IUniswapV2Pair public constant USDCEAVAX = IUniswapV2Pair(0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1);
    IUniswapV2Pair public constant MIMAVAX = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);
    IPlatypusRouter01 public constant PLATYPUS_ROUTER = IPlatypusRouter01(0x73256EC7575D999C360c1EeC118ECbEFd8DA7D12);

    IERC20 public constant WAVAX = IERC20(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);
    IERC20 public constant USDC = IERC20(0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E);
    IERC20 public constant USDCE = IERC20(0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664);

    constructor(IBentoBoxV1 _DEGENBOX) {
        DEGENBOX = _DEGENBOX;
        USDCE.approve(address(PLATYPUS_ROUTER), type(uint256).max);
        MIM.approve(address(_DEGENBOX), type(uint256).max);
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
        (uint256 amountFrom, ) = DEGENBOX.withdraw(IERC20(address(USDCEAVAX)), address(this), address(this), 0, shareFrom);
        USDCEAVAX.transfer(address(USDCEAVAX), amountFrom);
        (uint256 usdceAmount, uint256 avaxAmount) = USDCEAVAX.burn(address(this));
        uint256 mimAmount;

        // USDC.e -> MIM
        {
            address[] memory tokenPath = new address[](3);
            tokenPath[0] = address(USDCE);
            tokenPath[1] = address(USDC);
            tokenPath[2] = address(MIM);
            address[] memory poolPath = new address[](2);
            poolPath[0] = address(0x66357dCaCe80431aee0A7507e2E361B7e2402370); // USDC -> MIM pool
            poolPath[1] = address(0x30C30d826be87Cd0A4b90855C2F38f7FcfE4eaA7); // USDC.e -> USDC pool

            (mimAmount, ) = PLATYPUS_ROUTER.swapTokensForTokens(tokenPath, poolPath, usdceAmount, 0, address(this), type(uint256).max);
        }

        // swap AVAX to MIM
        (uint256 reserve0, uint256 reserve1, ) = MIMAVAX.getReserves();
        uint256 mimFromAvax = _getAmountOut(avaxAmount, reserve1, reserve0);
        WAVAX.transfer(address(MIMAVAX), avaxAmount);
        MIMAVAX.swap(mimFromAvax, 0, address(this), new bytes(0));
        mimAmount += mimFromAvax;

        (, shareReturned) = DEGENBOX.deposit(MIM, address(this), recipient, mimAmount, 0);
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
    ) public pure override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
