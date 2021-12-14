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

contract RenCrvLevSwapper {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

    // Local variables
    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    CurvePool constant public renCrv = CurvePool(0x93054188d876f558f4a66B2EF1d97d16eDf0895B);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IThreeCrypto constant public threecrypto = IThreeCrypto(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    IConvex public constant cvxRen = IConvex(0xB65eDE134521F0EFD4E943c835F450137dC6E83e);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant CurveToken = IERC20(0x49849C98ae39Fff122806C06791Fa73784FB3675);
    IERC20 public constant WBTC = IERC20(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(threecrypto), type(uint256).max);
        WBTC.approve(address(renCrv), type(uint256).max);
        CurveToken.approve(address(cvxRen), type(uint256).max);
    }


    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = bentoBox.withdraw(MIM, address(this), address(this), 0, shareFrom);

        uint256 amountOne = MIM3POOL.exchange_underlying(0, 3, amountFrom, 0, address(this));

        threecrypto.exchange(0, 1, amountOne, 0);

        uint256 amountIntermediate = WBTC.balanceOf(address(this));

        uint256[2] memory amountsAdded = [0, amountIntermediate];

        renCrv.add_liquidity(amountsAdded, 0);

        uint256 amountTo = CurveToken.balanceOf(address(this));

        cvxRen.deposit(amountTo, address(bentoBox));

        (, shareReturned) = bentoBox.deposit(cvxRen, address(bentoBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }
}