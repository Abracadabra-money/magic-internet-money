// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;
import "../../interfaces/ISwapperGeneric.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount) external;
}

interface IBentoBoxV1 {
    function withdraw(IERC20 token, address from, address to, uint256 amount, uint256 share) external returns(uint256, uint256);
    function deposit(IERC20 token, address from, address to, uint256 amount, uint256 share) external returns(uint256, uint256);
}

contract USTSwapper is ISwapperGeneric {

     // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool constant public UST3POOL = CurvePool(0x890f4e345B1dAED0367A877a1612f86A1f86985f);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant UST = IERC20(0xa47c8bf37f92aBed4A126BDA807A7b7498661acD);
    IERC20 public constant ThreePOOL = IERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);

    constructor() public {
        ThreePOOL.approve(address(MIM3POOL), type(uint256).max);
        UST.approve(address(UST3POOL), type(uint256).max);
        MIM.approve(address(bentoBox), type(uint256).max);
    }


    // Swaps to a flexible amount, from an exact input amount
    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20 fromToken,
        IERC20 toToken,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = bentoBox.withdraw(UST, address(this), address(this), 0, shareFrom);

        uint256 amountIntermediate = UST3POOL.exchange(0, 1, amountFrom, 0);

        uint256 amountTo = MIM3POOL.exchange(1, 0, amountIntermediate, 0);

        (, shareReturned) = bentoBox.deposit(MIM, address(this), recipient, amountTo, 0);
        extraShare = shareReturned - shareToMin;
    }

    // Swaps to an exact amount, from a flexible input amount
    /// @inheritdoc ISwapperGeneric
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