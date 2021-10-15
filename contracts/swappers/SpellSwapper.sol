// License-Identifier: MIT
pragma solidity 0.6.12;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "../libraries/UniswapV2Library.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}

contract SpellSwapper is BoringOwnable {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7);    
    IERC20 public constant SPELL = IERC20(0x090185f2135308BaD17527004364eBcC2D37e5F6);
    address public constant sSPELL = 0x26FA3fFFB6EfE8c1E69103aCb4044C26B9A106a9;
    IUniswapV2Pair constant SPELL_WETH = IUniswapV2Pair(0xb5De0C3753b6E1B4dBA616Db82767F17513E6d4E);
    IUniswapV2Pair constant pair = IUniswapV2Pair(0x06da0fd433C1A5d7a4faa01111c044910A184553);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    address public constant treasury = 0x5A7C5505f3CFB9a0D9A8493EC41bf27EE48c406D;
    mapping (address => bool) public verified;

    constructor(
    ) public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        verified[msg.sender] = true;
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

    modifier onlyVerified {
        require(verified[msg.sender], "Only verified operators");
        _;
    }

    function setVerified(address operator, bool status) public onlyOwner {
        verified[operator] = status;
    }

    // Swaps to a flexible amount, from an exact input amount
    function swap(
        uint256 amountToMin
    ) public onlyVerified{

        uint256 amountFirst;
        uint256 amountIntermediate;

        {

        uint256 shareFrom = bentoBox.balanceOf(MIM, address(this));

        uint256 treasuryShare = shareFrom / 4;

        bentoBox.withdraw(MIM, address(this), treasury, 0, treasuryShare);

        (uint256 amountMIMFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom.sub(treasuryShare));

        amountFirst = MIM3POOL.exchange_underlying(0, 3, amountMIMFrom, 0, address(pair));

        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        amountIntermediate = getAmountOut(amountFirst, reserve1, reserve0);

        }

        uint256 amountThird;

        {
        
        pair.swap(amountIntermediate, 0, address(SPELL_WETH), new bytes(0));

        (uint256 reserve0, uint256 reserve1, ) = SPELL_WETH.getReserves();
        
        amountThird = getAmountOut(amountIntermediate, reserve1, reserve0);
        
        require(amountThird >= amountToMin, "Minimum must be reached");

        }

        SPELL_WETH.swap(amountThird, 0, sSPELL, new bytes(0));
    }

}