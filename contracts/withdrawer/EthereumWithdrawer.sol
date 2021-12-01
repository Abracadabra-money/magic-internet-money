// SPDX-License-Identifier: MIXED
pragma solidity 0.8.10;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Audit on 5-Jan-2021 by Keno and BoringCrypto
// Source: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol + Claimable.sol
// Edited by BoringCrypto

contract BoringOwnableData {
    address public owner;
    address public pendingOwner;
}

contract BoringOwnable is BoringOwnableData {
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice `owner` defaults to msg.sender on construction.
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Transfers ownership to `newOwner`. Either directly or claimable by the new pending owner.
    /// Can only be invoked by the current `owner`.
    /// @param newOwner Address of the new owner.
    /// @param direct True if `newOwner` should be set immediately. False if `newOwner` needs to use `claimOwnership`.
    /// @param renounce Allows the `newOwner` to be `address(0)` if `direct` and `renounce` is True. Has no effect otherwise.
    function transferOwnership(
        address newOwner,
        bool direct,
        bool renounce
    ) public onlyOwner {
        if (direct) {
            // Checks
            require(newOwner != address(0) || renounce, "Ownable: zero address");

            // Effects
            emit OwnershipTransferred(owner, newOwner);
            owner = newOwner;
            pendingOwner = address(0);
        } else {
            // Effects
            pendingOwner = newOwner;
        }
    }

    /// @notice Needs to be called by `pendingOwner` to claim ownership.
    function claimOwnership() public {
        address _pendingOwner = pendingOwner;

        // Checks
        require(msg.sender == _pendingOwner, "Ownable: caller != pending owner");

        // Effects
        emit OwnershipTransferred(owner, _pendingOwner);
        owner = _pendingOwner;
        pendingOwner = address(0);
    }

    /// @notice Only allows the `owner` to execute the function.
    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }
}

interface IBentoBoxV1 {
    function balanceOf(IERC20 token, address user) external view returns (uint256 share);

    function deposit(
        IERC20 token_,
        address from,
        address to,
        uint256 amount,
        uint256 share
    ) external payable returns (uint256 amountOut, uint256 shareOut);

    function toAmount(
        IERC20 token,
        uint256 share,
        bool roundUp
    ) external view returns (uint256 amount);

    function toShare(
        IERC20 token,
        uint256 amount,
        bool roundUp
    ) external view returns (uint256 share);

    function transfer(
        IERC20 token,
        address from,
        address to,
        uint256 share
    ) external;

    function withdraw(
        IERC20 token_,
        address from,
        address to,
        uint256 amount,
        uint256 share
    ) external returns (uint256 amountOut, uint256 shareOut);
}

// License-Identifier: MIT

interface Cauldron {
    function accrue() external;

    function withdrawFees() external;

    function accrueInfo()
        external
        view
        returns (
            uint64,
            uint128,
            uint64
        );

    function bentoBox() external returns (address);

    function setFeeTo(address newFeeTo) external;

    function feeTo() external returns (address);

    function masterContract() external returns (Cauldron);
}

interface CauldronV1 {
    function accrue() external;

    function withdrawFees() external;

    function accrueInfo() external view returns (uint64, uint128);

    function setFeeTo(address newFeeTo) external;

    function feeTo() external returns (address);

    function masterContract() external returns (CauldronV1);
}

interface AnyswapRouter {
    function anySwapOutUnderlying(
        address token,
        address to,
        uint256 amount,
        uint256 toChainID
    ) external;
}

interface CurvePool {
    function exchange_underlying(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy,
        address receiver
    ) external returns (uint256);
}

contract EthereumWithdrawer is BoringOwnable {
    using SafeERC20 for IERC20;

    event SwappedMimToSpell(uint256 amountSushiswap, uint256 amountUniswap, uint256 total);

    bytes4 private constant SIG_TRANSFER = 0xa9059cbb; // transfer(address,uint256)

    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IBentoBoxV1 public constant BENTOBOX = IBentoBoxV1(0xF5BCE5077908a1b7370B9ae04AdC565EBd643966);
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);

    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant USDT = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    address public constant SPELL = 0x090185f2135308BaD17527004364eBcC2D37e5F6;
    address public constant sSPELL = 0x26FA3fFFB6EfE8c1E69103aCb4044C26B9A106a9;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    address public constant MIM_PROVIDER = 0x5f0DeE98360d8200b20812e174d139A1a633EDd2;
    address public constant TREASURY = 0x5A7C5505f3CFB9a0D9A8493EC41bf27EE48c406D;

    // Sushiswap
    IUniswapV2Pair private constant SUSHI_ETH_USDT = IUniswapV2Pair(0x06da0fd433C1A5d7a4faa01111c044910A184553);
    IUniswapV2Pair private constant SUSHI_SPELL_WETH = IUniswapV2Pair(0xb5De0C3753b6E1B4dBA616Db82767F17513E6d4E);

    // Uniswap V3
    uint24 private constant POOLFEE = 3000;
    ISwapRouter private constant SWAPROUTER = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    CauldronV1[] public bentoBoxCauldronsV1;
    Cauldron[] public bentoBoxCauldronsV2;
    Cauldron[] public degenBoxCauldrons;

    mapping(address => bool) public verified;

    constructor(
        Cauldron[] memory bentoBoxCauldronsV2_,
        CauldronV1[] memory bentoBoxCauldronsV1_,
        Cauldron[] memory degenBoxCauldrons_
    ) {
        bentoBoxCauldronsV2 = bentoBoxCauldronsV2_;
        bentoBoxCauldronsV1 = bentoBoxCauldronsV1_;
        degenBoxCauldrons = degenBoxCauldrons_;

        MIM.approve(address(MIM3POOL), type(uint256).max);

        USDT.safeApprove(address(SWAPROUTER), type(uint256).max);
        verified[msg.sender] = true;
    }

    modifier onlyVerified() {
        require(verified[msg.sender], "Only verified operators");
        _;
    }

    function withdraw() public {
        uint256 length = bentoBoxCauldronsV2.length;
        for (uint256 i = 0; i < length; i++) {
            require(bentoBoxCauldronsV2[i].masterContract().feeTo() == address(this), "wrong feeTo");

            bentoBoxCauldronsV2[i].accrue();
            (, uint256 feesEarned, ) = bentoBoxCauldronsV2[i].accrueInfo();
            if (feesEarned > (BENTOBOX.toAmount(MIM, BENTOBOX.balanceOf(MIM, address(bentoBoxCauldronsV2[i])), false))) {
                MIM.transferFrom(MIM_PROVIDER, address(BENTOBOX), feesEarned);
                BENTOBOX.deposit(MIM, address(BENTOBOX), address(bentoBoxCauldronsV2[i]), feesEarned, 0);
            }

            bentoBoxCauldronsV2[i].withdrawFees();
        }

        length = bentoBoxCauldronsV1.length;
        for (uint256 i = 0; i < length; i++) {
            require(bentoBoxCauldronsV1[i].masterContract().feeTo() == address(this), "wrong feeTo");

            bentoBoxCauldronsV1[i].accrue();
            (, uint256 feesEarned) = bentoBoxCauldronsV1[i].accrueInfo();
            if (feesEarned > (BENTOBOX.toAmount(MIM, BENTOBOX.balanceOf(MIM, address(bentoBoxCauldronsV1[i])), false))) {
                MIM.transferFrom(MIM_PROVIDER, address(BENTOBOX), feesEarned);
                BENTOBOX.deposit(MIM, address(BENTOBOX), address(bentoBoxCauldronsV1[i]), feesEarned, 0);
            }
            bentoBoxCauldronsV1[i].withdrawFees();
        }

        length = degenBoxCauldrons.length;
        for (uint256 i = 0; i < length; i++) {
            require(degenBoxCauldrons[i].masterContract().feeTo() == address(this), "wrong feeTo");

            degenBoxCauldrons[i].accrue();
            (, uint256 feesEarned, ) = degenBoxCauldrons[i].accrueInfo();
            if (feesEarned > (DEGENBOX.toAmount(MIM, DEGENBOX.balanceOf(MIM, address(degenBoxCauldrons[i])), false))) {
                MIM.transferFrom(MIM_PROVIDER, address(DEGENBOX), feesEarned);
                DEGENBOX.deposit(MIM, address(DEGENBOX), address(degenBoxCauldrons[i]), feesEarned, 0);
            }
            degenBoxCauldrons[i].withdrawFees();
        }

        BENTOBOX.withdraw(MIM, address(this), address(this), 0, BENTOBOX.balanceOf(MIM, address(this)));
        DEGENBOX.withdraw(MIM, address(this), address(this), 0, DEGENBOX.balanceOf(MIM, address(this)));
    }

    function rescueTokens(
        IERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    function swapMimForSpell(
        uint256 amountSwapOnSushi,
        uint256 amountSwapOnUniswap,
        uint256 minAmountOutOnSushi,
        uint256 minAmountOutOnUniswap,
        bool autoDepositToSSpell
    ) external onlyVerified {
        address recipient = autoDepositToSSpell ? sSPELL : address(this);
        uint256 minAmountToSwap = _getAmountToSwap(amountSwapOnSushi + amountSwapOnUniswap);
        uint256 amountUSDT = MIM3POOL.exchange_underlying(0, 3, minAmountToSwap, 0, address(this));

        uint256 percentSushi = (amountSwapOnSushi * 100) / (amountSwapOnSushi + amountSwapOnUniswap);
        uint256 amountUSDTSwapOnSushi = (amountUSDT * percentSushi) / 100;
        uint256 amountUSDTSwapOnUniswap = amountUSDT - amountUSDTSwapOnSushi;

        uint256 amountSpellOnSushi = _swapOnSushiswap(amountUSDTSwapOnSushi, minAmountOutOnSushi, recipient);
        uint256 amountSpellOnUniswap = _swapOnUniswap(amountUSDTSwapOnUniswap, minAmountOutOnUniswap, recipient);

        emit SwappedMimToSpell(amountSpellOnSushi, amountSpellOnUniswap, amountSpellOnSushi + amountSpellOnUniswap);
    }

    function setVerified(address operator, bool status) external onlyOwner {
        verified[operator] = status;
    }

    function addPool(Cauldron pool) external onlyOwner {
        _addPool(pool);
    }

    function addPoolV1(CauldronV1 pool) external onlyOwner {
        bentoBoxCauldronsV1.push(pool);
    }

    function addPools(Cauldron[] memory pools) external onlyOwner {
        for (uint256 i = 0; i < pools.length; i++) {
            _addPool(pools[i]);
        }
    }

    function _addPool(Cauldron pool) internal onlyOwner {
        require(address(pool) != address(0), "invalid cauldron");

        if (pool.bentoBox() == address(BENTOBOX)) {
            for (uint256 i = 0; i < bentoBoxCauldronsV2.length; i++) {
                require(bentoBoxCauldronsV2[i] != pool, "already added");
            }
            bentoBoxCauldronsV2.push(pool);
        } else if (pool.bentoBox() == address(DEGENBOX)) {
            for (uint256 i = 0; i < degenBoxCauldrons.length; i++) {
                require(degenBoxCauldrons[i] != pool, "already added");
            }
            degenBoxCauldrons.push(pool);
        }
    }

    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) private pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function _swapOnSushiswap(
        uint256 amountUSDT,
        uint256 minAmountSpellOut,
        address recipient
    ) private returns (uint256) {
        (uint256 reserve0, uint256 reserve1, ) = SUSHI_ETH_USDT.getReserves();
        uint256 amountOut = _getAmountOut(amountUSDT, reserve1, reserve0);

        USDT.safeTransfer(address(SUSHI_ETH_USDT), amountUSDT);
        SUSHI_ETH_USDT.swap(amountOut, 0, address(SUSHI_SPELL_WETH), new bytes(0));

        (reserve0, reserve1, ) = SUSHI_SPELL_WETH.getReserves();
        amountOut = _getAmountOut(amountOut, reserve1, reserve0);

        require(amountOut >= minAmountSpellOut, "insufficient amount");
        SUSHI_SPELL_WETH.swap(amountOut, 0, recipient, "");
        return amountOut;
    }

    function _swapOnUniswap(
        uint256 amountUSDT,
        uint256 minAmountSpellOut,
        address recipient
    ) private returns (uint256) {
        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: abi.encodePacked(USDT, POOLFEE, WETH, POOLFEE, SPELL),
            recipient: recipient,
            deadline: block.timestamp,
            amountIn: amountUSDT,
            amountOutMinimum: minAmountSpellOut
        });

        uint256 amountOut = SWAPROUTER.exactInput(params);
        require(amountOut >= minAmountSpellOut, "insufficient amount");
        return amountOut;
    }

    function _getAmountToSwap(uint256 amount) private returns (uint256) {
        uint256 treasuryShare = amount / 4;
        MIM.transfer(TREASURY, treasuryShare);
        return amount - treasuryShare;
    }
}
