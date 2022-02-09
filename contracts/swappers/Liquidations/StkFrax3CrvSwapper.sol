// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "../../interfaces/ISwapper.sol";

interface CurvePool {
    function exchange_underlying(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy,
        address receiver
    ) external returns (uint256);

    function approve(address _spender, uint256 _value) external returns (bool);

    function remove_liquidity_one_coin(
        address pool,
        uint256 tokenAmount,
        int128 i,
        uint256 min_amount
    ) external returns (uint256);
}

interface YearnVault {
    function withdraw() external returns (uint256);

    function deposit(uint256 amount, address recipient) external returns (uint256);
}

interface TetherToken {
    function approve(address _spender, uint256 _value) external;

    function balanceOf(address user) external view returns (uint256);
}

interface IConvex is IERC20 {
    function withdrawAndUnwrap(uint256 _amount) external;
}

contract StkFrax3CrvSwapper is ISwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);

    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    address public constant FRAX3CRVPOOL = 0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
    CurvePool public constant threePool = CurvePool(0xA79828DF1850E8a3A3064576f380D90aECDD3359);

    IConvex public immutable stkFrax3Crv;
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant FRAX3CRV = IERC20(0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B);

    constructor(IConvex _stkFrax3Crv) public {
        stkFrax3Crv = _stkFrax3Crv;
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(MIM3POOL), type(uint256).max);
        FRAX3CRV.approve(address(threePool), type(uint256).max);
    }

    // Swaps to a flexible amount, from an exact input amount
    /// @inheritdoc ISwapper
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amountFrom, ) = bentoBox.withdraw(IERC20(stkFrax3Crv), address(this), address(this), 0, shareFrom);

        stkFrax3Crv.withdrawAndUnwrap(amountFrom);

        // Pool token order is FRAX, DAI, USDC, USDT
        uint256 amountUSDT = threePool.remove_liquidity_one_coin(FRAX3CRVPOOL, amountFrom, 3, 0);
        uint256 amountTo = MIM3POOL.exchange_underlying(3, 0, amountUSDT, 0, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(MIM, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }

    // Swaps to an exact amount, from a flexible input amount
    /// @inheritdoc ISwapper
    function swapExact(
        IERC20,
        IERC20,
        address,
        address,
        uint256,
        uint256
    ) public override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }
}
