// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
}

interface IWOHM is IERC20 {
    function wrap( uint _amount ) external returns ( uint );
    function unwrap( uint _amount ) external returns ( uint );
    function transfer(address _to, uint256 _value) external returns (bool success);
}

interface IStakingManager {
    function unstake( uint _amount, bool _trigger ) external;
    function stake( uint _amount, address _recipient ) external returns ( bool );
    function claim ( address _recipient ) external;
}

contract wOHMLevSwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IUniswapV2Pair constant OHM_DAI = IUniswapV2Pair(0x34d7d7Aaf50AD4944B70B320aCB24C95fa2def7c);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant SOHM = IERC20(0x04F2694C8fcee23e8Fd0dfEA1d4f5Bb8c352111F);
    IWOHM public constant WOHM = IWOHM(0xCa76543Cf381ebBB277bE79574059e32108e3E65);
    IStakingManager public constant STAKING_MANAGER = IStakingManager(0xFd31c7d00Ca47653c6Ce64Af53c1571f9C36566a);
    IERC20 public constant OHM = IERC20(0x383518188C0C6d7730D91b2c03a03C837814a899);
    constructor(
    ) public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        OHM.approve(address(STAKING_MANAGER), type(uint256).max);
        SOHM.approve(address(WOHM), type(uint256).max);
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
        uint256 amountIntermediate;

        {

        (uint256 amountMIMFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        amountFirst = MIM3POOL.exchange_underlying(0, 1, amountMIMFrom, 0, address(OHM_DAI));

        (uint256 reserve0, uint256 reserve1, ) = OHM_DAI.getReserves();
        amountIntermediate = getAmountOut(amountFirst, reserve1, reserve0);
        }
        
        OHM_DAI.swap(amountIntermediate, 0, address(this), new bytes(0));

        STAKING_MANAGER.stake(amountIntermediate, address(this));

        STAKING_MANAGER.claim(address(this));

        uint256 amountTo = WOHM.wrap(amountIntermediate);

        WOHM.transfer(address(bentoBox), amountTo);

        (, shareReturned) = bentoBox.deposit(WOHM, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }

}