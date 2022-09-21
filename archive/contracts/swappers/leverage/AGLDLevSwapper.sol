// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.6.12;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';



interface IBentoBoxV1 {
    function withdraw(IERC20 token, address from, address to, uint256 amount, uint256 share) external returns(uint256, uint256);
    function deposit(IERC20 token, address from, address to, uint256 amount, uint256 share) external returns(uint256, uint256);
}
interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}

contract AGLDLevSwapper is IUniswapV3SwapCallback {
    using BoringERC20 for IERC20;
    using SafeCast for uint256;
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 private constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    IUniswapV3Pool private constant pool = IUniswapV3Pool(0x5d752F322beFB038991579972e912B02F61A3DDA);
    IERC20 private constant AGLD = IERC20(0x32353A6C91143bfd6C7d363B546e62a9A2489A20);
    IERC20 private constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IUniswapV2Pair constant pair = IUniswapV2Pair(0x06da0fd433C1A5d7a4faa01111c044910A184553);
    IERC20 constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        uint256 amount = abi.decode(data, (uint256));
        WETH.safeTransfer(address(pool), amount);
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
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {

        uint256 amountIntermediate;

        {

        (uint256 amountMIMFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        uint256 amountFirst = MIM3POOL.exchange_underlying(0, 3, amountMIMFrom, 0, address(pair));

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        amountIntermediate = getAmountOut(amountFirst, reserve1, reserve0);

        }

        pair.swap(amountIntermediate, 0, address(this), new bytes(0));

        bool zeroForOne = address(WETH) < address(AGLD);

        (int256 amount0, int256 amount1) =
            pool.swap(
                address(bentoBox),
                zeroForOne,
                amountIntermediate.toInt256(),
                (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1),
                abi.encode(amountIntermediate)
            );

        uint256 amountTo = uint256(-(zeroForOne ? amount1 : amount0));

        (, shareReturned) = bentoBox.deposit(AGLD, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
