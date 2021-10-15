// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../../interfaces/ISwapper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "../../libraries/UniswapV2Library.sol";


interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

interface IWMEMO is IERC20 {
    function wrap( uint _amount ) external returns ( uint );
    function unwrap( uint _amount ) external returns ( uint );
    function transfer(address _to, uint256 _value) external returns (bool success);
}

interface ITIME is IERC20 {
    function transfer(address _to, uint256 _value) external returns (bool success);
}

interface IStakingManager {
    function unstake( uint _amount, bool _trigger ) external;
    function stake( uint _amount, address _recipient ) external returns ( bool );
}

contract wMEMOSwapper is ISwapper {
    using BoringMath for uint256;

   // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xf4F46382C2bE1603Dc817551Ff9A7b333Ed1D18f);
    IUniswapV2Pair constant TIME_AVAX = IUniswapV2Pair(0xf64e1c5B6E17031f5504481Ac8145F4c3eab4917);
    IUniswapV2Pair constant AVAX_MIM = IUniswapV2Pair(0x781655d802670bbA3c89aeBaaEa59D3182fD755D);
    IERC20 public constant MIM = IERC20(0x130966628846BFd36ff31a822705796e8cb8C18D);
    IERC20 public constant MEMO = IERC20(0x136Acd46C134E8269052c62A67042D6bDeDde3C9);
    IWMEMO public constant WMEMO = IWMEMO(0x0da67235dD5787D67955420C84ca1cEcd4E5Bb3b);
    IStakingManager public constant STAKING_MANAGER = IStakingManager(0x4456B87Af11e87E329AB7d7C7A246ed1aC2168B9);
    ITIME public constant TIME = ITIME(0xb54f16fB19478766A268F172C9480f8da1a7c9C3);
    address private constant WAVAX = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;

    constructor(
    ) public {
        MEMO.approve(address(STAKING_MANAGER), type(uint256).max);
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
        
        uint256 amountFirst;

        {

        (uint256 amountFrom, ) = bentoBox.withdraw(fromToken, address(this), address(this), 0, shareFrom);

        amountFirst = WMEMO.unwrap(amountFrom);

        }

        STAKING_MANAGER.unstake(amountFirst, false);

        TIME.transfer(address(TIME_AVAX), amountFirst);

        uint256 amountIntermediate;

        {

            (address token0, ) = UniswapV2Library.sortTokens(address(WAVAX), address(TIME));

            (uint256 reserve0, uint256 reserve1, ) = TIME_AVAX.getReserves();

            (reserve0, reserve1) = address(TIME) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountIntermediate = getAmountOut(amountFirst, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(TIME) == token0
                    ? (uint256(0), amountIntermediate)
                    : (amountIntermediate, uint256(0));

            TIME_AVAX.swap(amount0Out, amount1Out, address(AVAX_MIM), new bytes(0));
        }

        uint256 amountTo;

        {

            (address token0, ) = UniswapV2Library.sortTokens(address(MIM), WAVAX);

            (uint256 reserve0, uint256 reserve1, ) = AVAX_MIM.getReserves();

            (reserve0, reserve1) = WAVAX == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountTo = getAmountOut(amountIntermediate, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = WAVAX == token0
                    ? (uint256(0), amountTo)
                    : (amountTo, uint256(0));

            AVAX_MIM.swap(amount0Out, amount1Out, address(bentoBox), new bytes(0));
        }

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