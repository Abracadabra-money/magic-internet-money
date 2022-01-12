// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external;
}

interface IThreeCrypto is CurvePool {
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external;
}

interface TetherToken {
    function approve(address _spender, uint256 _value) external;
}

contract WbtcLevSwapper {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

    // Local variables
    IBentoBoxV1 public constant degenBox = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IThreeCrypto constant public threecrypto = IThreeCrypto(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant WBTC = IERC20(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(threecrypto), type(uint256).max);
        WBTC.approve(address(degenBox), type(uint256).max);
    }


    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = degenBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        uint256 amountOne = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(this));

        threecrypto.exchange(0, 1, amountOne, 0);

        uint256 amountTo = WBTC.balanceOf(address(this));

        (, shareReturned) = degenBox.deposit(WBTC, address(this), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}