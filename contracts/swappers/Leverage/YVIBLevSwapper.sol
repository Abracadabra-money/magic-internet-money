// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external returns (uint256);
}

interface YearnVault {
    function withdraw() external returns (uint256);
    function deposit(uint256 amount, address recipient) external returns (uint256);
}
interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}

contract YVIBLevSwapper {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

     // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool constant public IronBank = CurvePool(0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF);
    YearnVault constant public YVIB = YearnVault(0x27b7b1ad7288079A66d12350c828D3C00A6F07d7);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant CurveToken = IERC20(0x5282a4eF67D9C33135340fB3289cc1711c13638C);

    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(IronBank), type(uint256).max);
        CurveToken.approve(address(YVIB), type(uint256).max);
    }


    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        uint256 amountIntermediate = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(this));

        uint256[3] memory amountsAdded = [0,0, amountIntermediate];

        IronBank.add_liquidity(amountsAdded, 0, true);

        uint256 amountTo = YVIB.deposit(type(uint256).max, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(IERC20(address(YVIB)), address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}
