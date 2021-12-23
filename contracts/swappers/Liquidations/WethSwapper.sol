pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "../../interfaces/ISwapper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
interface CurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function remove_liquidity_one_coin(uint256 tokenAmount, int128 i, uint256 min_amount) external;
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
    function balanceOf(address user) external view returns (uint256);
}

interface IConvex is IERC20{
    function withdrawAndUnwrap(uint256 _amount) external;
}

contract WethSwapper is ISwapper {
    using BoringMath for uint256;

    // Local variables
    IBentoBoxV1 public constant degenBox = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IThreeCrypto constant public threecrypto = IThreeCrypto(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    TetherToken public constant TETHER = TetherToken(0xdAC17F958D2ee523a2206206994597C13D831ec7); 
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    constructor() public {
        MIM.approve(address(MIM3POOL), type(uint256).max);
        TETHER.approve(address(MIM3POOL), type(uint256).max);
        WETH.approve(address(threecrypto), type(uint256).max);
    }

    // Swaps to a flexible amount, from an exact input amount
    /// @inheritdoc ISwapper
    function swap(
        IERC20 fromToken,
        IERC20 toToken,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {

        (uint256 amountFrom, ) = degenBox.withdraw(fromToken, address(this), address(this), 0, shareFrom);

        threecrypto.exchange(2, 0, amountFrom, 0);

        uint256 amountIntermediate = TETHER.balanceOf(address(this));

        uint256 amountTo = MIM3POOL.exchange_underlying(3, 0, amountIntermediate, 0, address(degenBox));

        (, shareReturned) = degenBox.deposit(toToken, address(degenBox), recipient, amountTo, 0);
        extraShare = shareReturned.sub(shareToMin);
    }

    // Swaps to an exact amount, from a flexible input amount
    /// @inheritdoc ISwapper
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