// SPDX-License-Identifier: MIXED
pragma solidity 0.8.10;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";

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

interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);
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
}

interface CauldronV1 {
    function accrue() external;

    function withdrawFees() external;

    function accrueInfo() external view returns (uint64, uint128);

    function setFeeTo(address newFeeTo) external;

    function feeTo() external returns (address);
}

interface AnyswapRouter {
    function anySwapOutUnderlying(
        address token,
        address to,
        uint256 amount,
        uint256 toChainID
    ) external;
}

contract MultiChainWithdrawer is BoringOwnable {
    bytes4 private constant SIG_TRANSFER = 0xa9059cbb; // transfer(address,uint256)

    IBentoBoxV1 public immutable bentoBox;
    IBentoBoxV1 public immutable degenBox;
    IERC20 public immutable MIM;
    IERC20 public immutable SPELL;

    AnyswapRouter public immutable anyswapRouter;
    
    address public immutable mimProvider;
    address public immutable ethereumRecipient;

    CauldronV1[] public bentoBoxCauldronsV1;
    Cauldron[] public bentoBoxCauldronsV2;
    Cauldron[] public degenBoxCauldrons;

    constructor(
        IBentoBoxV1 bentoBox_,
        IBentoBoxV1 degenBox_,
        IERC20 mim,
        IERC20 spell,
        AnyswapRouter anyswapRouter_,
        address mimProvider_,
        address ethereumRecipient_,
        Cauldron[] memory bentoBoxCauldronsV2_,
        CauldronV1[] memory bentoBoxCauldronsV1_,
        Cauldron[] memory degenBoxCauldrons_
    ) {
        bentoBox = bentoBox_;
        degenBox = degenBox_;
        MIM = mim;
        SPELL = spell;
        anyswapRouter = anyswapRouter_;
        mimProvider = mimProvider_;
        ethereumRecipient = ethereumRecipient_;

        bentoBoxCauldronsV2 = bentoBoxCauldronsV2_;
        bentoBoxCauldronsV1 = bentoBoxCauldronsV1_;
        degenBoxCauldrons = degenBoxCauldrons_;
    }

    function withdrawToEthereum() public {
        uint256 length = bentoBoxCauldronsV2.length;
        for (uint256 i = 0; i < length; i++) {
            require(bentoBoxCauldronsV2[i].feeTo() == address(this), "wrong feeTo");

            bentoBoxCauldronsV2[i].accrue();
            (, uint256 feesEarned, ) = bentoBoxCauldronsV2[i].accrueInfo();
            if (feesEarned > (bentoBox.toAmount(MIM, bentoBox.balanceOf(MIM, address(bentoBoxCauldronsV2[i])), false))) {
                MIM.transferFrom(mimProvider, address(bentoBox), feesEarned);
                bentoBox.deposit(MIM, address(bentoBox), address(bentoBoxCauldronsV2[i]), feesEarned, 0);
            }

            bentoBoxCauldronsV2[i].withdrawFees();
        }

        length = bentoBoxCauldronsV1.length;
        for (uint256 i = 0; i < length; i++) {
            require(bentoBoxCauldronsV1[i].feeTo() == address(this), "wrong feeTo");

            bentoBoxCauldronsV1[i].accrue();
            (, uint256 feesEarned) = bentoBoxCauldronsV1[i].accrueInfo();
            if (feesEarned > (bentoBox.toAmount(MIM, bentoBox.balanceOf(MIM, address(bentoBoxCauldronsV1[i])), false))) {
                MIM.transferFrom(mimProvider, address(bentoBox), feesEarned);
                bentoBox.deposit(MIM, address(bentoBox), address(bentoBoxCauldronsV1[i]), feesEarned, 0);
            }
            bentoBoxCauldronsV1[i].withdrawFees();
        }

        length = degenBoxCauldrons.length;
        for (uint256 i = 0; i < length; i++) {
            require(degenBoxCauldrons[i].feeTo() == address(this), "wrong feeTo");

            degenBoxCauldrons[i].accrue();
            (, uint256 feesEarned, ) = degenBoxCauldrons[i].accrueInfo();
            if (feesEarned > (degenBox.toAmount(MIM, degenBox.balanceOf(MIM, address(degenBoxCauldrons[i])), false))) {
                MIM.transferFrom(mimProvider, address(degenBox), feesEarned);
                degenBox.deposit(MIM, address(degenBox), address(degenBoxCauldrons[i]), feesEarned, 0);
            }
            degenBoxCauldrons[i].withdrawFees();
        }

        bentoBox.withdraw(MIM, address(this), address(this), 0, bentoBox.balanceOf(MIM, address(this)));
        degenBox.withdraw(MIM, address(this), address(this), 0, degenBox.balanceOf(MIM, address(this)));

        anyswapRouter.anySwapOutUnderlying(address(SPELL), ethereumRecipient, SPELL.balanceOf(address(this)), 1);
    }

    function rescueTokens(
        IERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        _safeTransfer(token, to, amount);
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

        if (pool.bentoBox() == address(bentoBox)) {
            //do not allow doubles
            for (uint256 i = 0; i < bentoBoxCauldronsV2.length; i++) {
                require(bentoBoxCauldronsV2[i] != pool, "already added");
            }
            bentoBoxCauldronsV2.push(pool);
        } else if (pool.bentoBox() == address(degenBox)) {
            for (uint256 i = 0; i < degenBoxCauldrons.length; i++) {
                require(degenBoxCauldrons[i] != pool, "already added");
            }
            degenBoxCauldrons.push(pool);
        }
    }

    function _safeTransfer(
        IERC20 token,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(SIG_TRANSFER, to, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}
