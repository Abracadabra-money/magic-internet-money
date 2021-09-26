// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount) external;
}

interface YearnVault {
    function withdraw() external returns (uint256);
    function deposit(uint256 amount, address recipient) external returns (uint256);
}
interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}

interface IConvex is IERC20{
    function withdrawAndUnwrap(uint256 _amount) external;
    //deposit a curve token
    function deposit(uint256 _amount, address _to) external;
}

contract ThreeCryptoLevSwapper {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

     // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool constant public threecrypto = CurvePool(0x80466c64868E1ab14a1Ddf27A676C3fcBE638Fe5);
    IConvex public constant cvx3Crypto = IConvex(0x5958A8DB7dfE0CC49382209069b00F54e17929C2);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant CurveToken = IERC20(0xcA3d75aC011BF5aD07a98d02f18225F9bD9A6BDF);

    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(threecrypto), type(uint256).max);
        CurveToken.approve(address(cvx3Crypto), type(uint256).max);
    }


    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        uint256 amountIntermediate = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(this));

        uint256[3] memory amountsAdded = [amountIntermediate, 0, 0];

        threecrypto.add_liquidity(amountsAdded, 0);

        uint256 amountTo = CurveToken.balanceOf(address(this));

        cvx3Crypto.deposit(amountTo, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(cvx3Crypto, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}