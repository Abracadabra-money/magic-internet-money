// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "../../libraries/UniswapV2Library.sol";

interface ICurvePool {
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

interface IxBOO is IERC20 {
    function leave(uint256 share) external;
    function enter(uint256 amount) external;
    function transfer(address _to, uint256 _value) external returns (bool success);
}

contract xBooLevSwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0x74A0BcA2eeEdf8883cb91E37e9ff49430f20a616);
    IUniswapV2Pair constant USDC_WFTM = IUniswapV2Pair(0x2b4C76d0dc16BE1C31D4C1DC53bF9B45987Fc75c);
    IERC20 constant WFTM = IERC20(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);
    IERC20 constant USDC = IERC20(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
    IxBOO constant xBOO = IxBOO(0xa48d959AE2E88f1dAA7D5F611E01908106dE7598);
    IERC20 constant BOO = IERC20(0x841FAD6EAe12c286d1Fd18d1d525DFfA75C7EFFE);
    IUniswapV2Pair constant BOO_FTM = IUniswapV2Pair(0xEc7178F4C41f346b2721907F5cF7628E388A7a58);
    IERC20 public constant MIM = IERC20(0x82f0B8B456c1A451378467398982d4834b6829c1);
    ICurvePool public constant ThreeCrypto = ICurvePool(0x2dd7C9371965472E5A5fD28fbE165007c61439E1);

    constructor() public {
        MIM.approve(address(ThreeCrypto), type(uint256).max);
        BOO.approve(address(xBOO), type(uint256).max);
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

        (uint256 amountFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);
        
        uint256 amountIntermediate;

        {
            uint256 amountFirst = ThreeCrypto.exchange(0, 2, amountFrom, 0, address(USDC_WFTM));

            (address token0, ) = UniswapV2Library.sortTokens(address(USDC), address(WFTM));

            (uint256 reserve0, uint256 reserve1, ) = USDC_WFTM.getReserves();

            (reserve0, reserve1) = address(USDC) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountIntermediate = getAmountOut(amountFirst, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(USDC) == token0
                    ? (uint256(0), amountIntermediate)
                    : (amountIntermediate, uint256(0));

            USDC_WFTM.swap(amount0Out, amount1Out, address(BOO_FTM), new bytes(0));
        }
        uint256 amountIntermediate2;

        {
            (address token0, ) = UniswapV2Library.sortTokens(address(BOO), address(WFTM));

            (uint256 reserve0, uint256 reserve1, ) = BOO_FTM.getReserves();

            (reserve0, reserve1) = address(WFTM) == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            
            amountIntermediate2 = getAmountOut(amountIntermediate, reserve0, reserve1);

            (uint256 amount0Out, uint256 amount1Out) = address(WFTM) == token0
                    ? (uint256(0), amountIntermediate2)
                    : (amountIntermediate2, uint256(0));

            BOO_FTM.swap(amount0Out, amount1Out, address(this), new bytes(0));
        }

        xBOO.enter(amountIntermediate2);
        uint256 amountTo = xBOO.balanceOf(address(this));
        xBOO.transfer(address(bentoBox), amountTo);

        (, shareReturned) = bentoBox.deposit(xBOO, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
