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
contract YVWETHLevSwapper{
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public immutable bentoBox;

    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    YearnVault public constant WETH_VAULT = YearnVault(0xa258C4606Ca8206D8aA700cE2143D7db854D168c);
    IUniswapV2Pair constant pair = IUniswapV2Pair(0x06da0fd433C1A5d7a4faa01111c044910A184553);
    IERC20 constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    constructor(
        IBentoBoxV1 bentoBox_
    ) public {
        bentoBox = bentoBox_;
        WETH.approve(address(WETH_VAULT), type(uint256).max);
        MIM.approve(address(MIM3POOL), type(uint256).max);
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

        uint256 amountIntermediate = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(pair));

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        
        uint256  amountInt2 = getAmountOut(amountIntermediate, reserve1, reserve0);
        pair.swap(amountInt2, 0, address(this), new bytes(0));

        uint256 amountTo = WETH_VAULT.deposit(type(uint256).max, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(IERC20(address(WETH_VAULT)), address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
