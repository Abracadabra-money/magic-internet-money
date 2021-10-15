// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "../../libraries/UniswapV2Library.sol";

contract ArbEthLevSwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0x74c764D41B77DBbb4fe771daB1939B00b146894A);
    IUniswapV2Pair constant pair = IUniswapV2Pair(0xb6DD51D5425861C808Fd60827Ab6CFBfFE604959);
    IERC20 constant WETH = IERC20(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1);
    IERC20 public constant MIM = IERC20(0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A);

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

        (uint256 amountFrom, ) = bentoBox.withdraw(MIM, address(this), address(pair), 0, shareFrom);

        (address token0, ) = UniswapV2Library.sortTokens(address(MIM), address(WETH));

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();

        (reserve0, reserve1) = address(MIM) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
        
        uint256  amountTo = getAmountOut(amountFrom, reserve0, reserve1);

        (uint256 amount0Out, uint256 amount1Out) = address(MIM) == token0
                ? (uint256(0), amountTo)
                : (amountTo, uint256(0));

        pair.swap(amount0Out, amount1Out, address(bentoBox), new bytes(0));

        (, shareReturned) = bentoBox.deposit(WETH, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
