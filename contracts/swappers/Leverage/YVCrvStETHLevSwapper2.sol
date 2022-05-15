// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external returns (uint256);
    function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external returns (uint256);
}

interface YearnVault {
    function withdraw() external returns (uint256);
    function deposit(uint256 amount, address recipient) external returns (uint256);
}
interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}
interface IWETH is IERC20 {
    function transfer(address _to, uint256 _value) external returns (bool success);
    function deposit() external payable;
    function withdraw(uint wad) external;
}
interface IThreeCrypto is CurvePool {
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external;
}
contract YVCrvStETHLevSwapper2 {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

     // Local variables
    IBentoBoxV1 public constant degenBox = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool constant public STETH = CurvePool(0x828b154032950C8ff7CF8085D841723Db2696056);
    YearnVault constant public YVSTETH = YearnVault(0x5faF6a2D186448Dfa667c51CB3D695c7A6E52d8E);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant CurveToken = IERC20(0x828b154032950C8ff7CF8085D841723Db2696056);
    IWETH public constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IThreeCrypto constant public threecrypto = IThreeCrypto(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);

    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(threecrypto), type(uint256).max);
        WETH.approve(address(STETH), type(uint256).max);
        CurveToken.approve(address(YVSTETH), type(uint256).max);
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

    receive() external payable {}

    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = degenBox.withdraw(MIM, address(this), address(this), 0, shareFrom);
        uint256 amountThird;
        {
            uint256 amountSecond = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(this));
    
            threecrypto.exchange(0, 2, amountSecond, 0);

            amountThird = WETH.balanceOf(address(this));
        }
        
        uint256[2] memory amountsAdded = [amountThird,0];

        STETH.add_liquidity(amountsAdded, 0);

        uint256 amountTo = YVSTETH.deposit(type(uint256).max, address(degenBox));

        (, shareReturned) = degenBox.deposit(IERC20(address(YVSTETH)), address(degenBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
