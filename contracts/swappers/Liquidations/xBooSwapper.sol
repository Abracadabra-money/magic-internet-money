// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/ISwapper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "../../libraries/UniswapV2Library.sol";

interface IxBOO {
    function leave(uint256 share) external;
}

interface IBoo is IERC20 {
    function transfer(address _to, uint256 _value) external returns (bool success);
}

interface ICurvePool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

contract xBooSwapper is ISwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616);
    IUniswapV2Pair constant USDC_WFTM = IUniswapV2Pair(0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c);
    IERC20 constant WFTM = IERC20(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);
    IERC20 constant USDC = IERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    IxBOO constant xBOO = IxBOO(0xa48d959AE2E88f1dAA7D5F611E01908106dE7598);
    IBoo constant BOO = IBoo(0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE);
    IUniswapV2Pair constant BOO_FTM = IUniswapV2Pair(0xEc7178F4C41f346b2721907F5cF7628E388A7a58);
    IERC20 public constant MIM = IERC20(0x82f0B8B456c1A451378467398982d4834b6829c1);
    ICurvePool public constant ThreeCrypto = ICurvePool(0x2dd7C9371965472E5A5fD28fbE165007c61439E1);

    constructor() public {
        USDC.approve(address(ThreeCrypto), type(uint256).max);
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

        {
            (uint256 amountXbooFrom,) = bentoBox.withdraw(fromToken, address(this), address(this), 0, shareFrom);
            xBOO.leave(amountXbooFrom);
        }
        
        uint256 amountFirst;

        {
            uint256 amountFrom = BOO.balanceOf(address(this));

            BOO.transfer(address(BOO_FTM), amountFrom);
            
            (address token0, ) = UniswapV2Library.sortTokens(address(BOO), address(WFTM));

            (uint256 reserve0, uint256 reserve1, ) = BOO_FTM.getReserves();

            (reserve0, reserve1) = address(BOO) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountFirst = getAmountOut(amountFrom, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(BOO) == token0
                    ? (uint256(0), amountFirst)
                    : (amountFirst, uint256(0));

            BOO_FTM.swap(amount0Out, amount1Out, address(USDC_WFTM), new bytes(0));

        }

        uint256 amountIntermediate;

        {
            (address token0, ) = UniswapV2Library.sortTokens(address(WFTM), address(USDC));

            (uint256 reserve0, uint256 reserve1, ) = USDC_WFTM.getReserves();

            (reserve0, reserve1) = address(WFTM) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountIntermediate = getAmountOut(amountFirst, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(WFTM) == token0
                    ? (uint256(0), amountIntermediate)
                    : (amountIntermediate, uint256(0));

            USDC_WFTM.swap(amount0Out, amount1Out, address(this), new bytes(0));
        }

        uint256 amountTo = ThreeCrypto.exchange(2, 0, amountIntermediate, 0, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(toToken, address(bentoBox), recipient, amountTo, 0);
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
