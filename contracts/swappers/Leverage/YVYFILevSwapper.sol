// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

interface YearnVault {
    function withdraw() external returns (uint256);
    function deposit(uint256 amount, address recipient) external returns (uint256);
}

interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}

contract YVYFILevSwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public immutable bentoBox;
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    YearnVault public constant YFI_VAULT = YearnVault(0xE14d13d8B3b85aF791b2AADD661cDBd5E6097Db1);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IUniswapV2Pair constant YFI_WETH = IUniswapV2Pair(0x088ee5007C98a9677165D78dD2109AE4a3D04d0C);
    IUniswapV2Pair constant pair = IUniswapV2Pair(0x06da0fd433C1A5d7a4faa01111c044910A184553);
    IERC20 constant YFI = IERC20(0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    constructor(
        IBentoBoxV1 bentoBox_
    ) public {
        bentoBox = bentoBox_;
        MIM.approve(address(MIM3POOL), type(uint256).max);
        YFI.approve(address(YFI_VAULT), type(uint256).max);
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

        uint256 amountFirst;

        {

        (uint256 amountFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        amountFirst = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(pair));

        }

        uint256 amountIntermediate;
        
        {

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        
        amountIntermediate  = getAmountOut(amountFirst, reserve1, reserve0);
        pair.swap(amountIntermediate, 0, address(YFI_WETH), new bytes(0));

        }

        (uint256 reserve0, uint256 reserve1, ) = YFI_WETH.getReserves();
        
        uint256 amountInt2 = getAmountOut(amountIntermediate, reserve1, reserve0);
        
        YFI_WETH.swap(amountInt2, 0, address(this), new bytes(0));

        uint256 amountTo = YFI_VAULT.deposit(type(uint256).max, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(IERC20(address(YFI_VAULT)), address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
