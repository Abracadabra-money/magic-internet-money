// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/ISwapper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "../../libraries/UniswapV2Library.sol";


interface CurvePool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

contract ICESwapper is ISwapper {
    using BoringMath for uint256;

   // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);

    IERC20 public constant WFTM = IERC20(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);
    IUniswapV2Pair public constant ICE_FTM = IUniswapV2Pair(0x84311ECC54D7553378c067282940b0fdfb913675);
    IUniswapV2Pair public constant USDC_FTM = IUniswapV2Pair(0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c);
    IERC20 public constant ICE = IERC20(0xf16e81dce15B08F326220742020379B855B87DF9);
    IERC20 public constant USDC = IERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    IERC20 public constant MIM = IERC20(0x82f0B8B456c1A451378467398982d4834b6829c1);
    CurvePool public constant threePool = CurvePool(0x2dd7C9371965472E5A5fD28fbE165007c61439E1);

    uint8 private constant USDC_COIN = 2;
    uint8 private constant MIM_COIN = 0;

    constructor(
    ) public {
        USDC.approve(address(threePool), type(uint256).max);
    }

    // Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

    // Given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        uint256 numerator = reserveIn.mul(amountOut).mul(1000);
        uint256 denominator = reserveOut.sub(amountOut).mul(997);
        amountIn = (numerator / denominator).add(1);
    }

    // Swaps to a flexible amount, from an exact input amount
    /// @inheritdoc ISwapper
    function swap(
        IERC20 fromToken,
        IERC20 toToken,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        

        (uint256 amountFrom, ) = bentoBox.withdraw(ICE, address(this), address(ICE_FTM), 0, shareFrom);

        uint256 amountIntermediate;

        {

            (address token0, ) = UniswapV2Library.sortTokens(address(ICE), address(WFTM));

            (uint256 reserve0, uint256 reserve1, ) = ICE_FTM.getReserves();

            (reserve0, reserve1) = address(ICE) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountIntermediate = getAmountOut(amountFrom, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(ICE) == token0
                    ? (uint256(0), amountIntermediate)
                    : (amountIntermediate, uint256(0));

            ICE_FTM.swap(amount0Out, amount1Out, address(USDC_FTM), new bytes(0));
        }

        uint256 amountIntermediate2;

        {

            (address token0, ) = UniswapV2Library.sortTokens(address(USDC), address(WFTM));

            (uint256 reserve0, uint256 reserve1, ) = USDC_FTM.getReserves();

            (reserve0, reserve1) = address(WFTM) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountIntermediate2 = getAmountOut(amountIntermediate, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(WFTM) == token0
                    ? (uint256(0), amountIntermediate2)
                    : (amountIntermediate2, uint256(0));

            USDC_FTM.swap(amount0Out, amount1Out, address(this), new bytes(0));
        }

        uint256 amountTo = threePool.exchange(USDC_COIN, MIM_COIN, amountIntermediate2, 0, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(MIM, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }

    // Swaps to an exact amount, from a flexible input amount
    /// @inheritdoc ISwapper
    function swapExact(
        IERC20 fromToken,
        IERC20 toToken,
        address recipient,
        address refundTo,
        uint256 shareFromSupplied,
        uint256 shareToExact
    ) public override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0,0);
    }
}