// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../../interfaces/ISwapperGeneric.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/stargate/IStargateRouter.sol";
import "../../interfaces/stargate/IStargatePool.sol";

interface IStargateLpMimPool {
    function swapForMim(
        IStargatePool tokenIn,
        uint256 amountIn,
        address recipient
    ) external returns (uint256);
}

/// @notice Liquidation Swapper for Stargate LP using Curve
contract StargateCurveSwapperV2 is ISwapperGeneric, Ownable {
    using Address for address;

    event MimPoolChanged(IStargateLpMimPool pool);

    IBentoBoxV1 public immutable degenBox;
    IStargatePool public immutable pool;
    IStargateRouter public immutable stargateRouter;
    CurvePool public immutable curvePool;
    int128 public immutable curvePoolI;
    int128 public immutable curvePoolJ;
    uint16 public immutable poolId;
    IERC20 public immutable underlyingPoolToken;
    IERC20 public immutable mim;

    IStargateLpMimPool public mimPool;

    constructor(
        IBentoBoxV1 _degenBox,
        IStargatePool _pool,
        uint16 _poolId,
        IStargateRouter _stargateRouter,
        CurvePool _curvePool,
        int128 _curvePoolI,
        int128 _curvePoolJ
    ) {
        degenBox = _degenBox;
        pool = _pool;
        poolId = _poolId;
        stargateRouter = _stargateRouter;
        curvePool = _curvePool;
        curvePoolI = _curvePoolI;
        curvePoolJ = _curvePoolJ;
        mim = IERC20(_curvePool.coins(uint128(_curvePoolJ)));

        underlyingPoolToken = IERC20(_pool.token());
        _safeApprove(underlyingPoolToken, address(_curvePool), type(uint256).max);
    }

    function setMimPool(IStargateLpMimPool _mimPool) external onlyOwner {
        if (address(mimPool) != address(0)) {
            _safeApprove(IERC20(address(pool)), address(_mimPool), 0);
        }

        if (address(_mimPool) != address(0)) {
            _safeApprove(IERC20(address(pool)), address(_mimPool), type(uint256).max);
        }

        mimPool = _mimPool;

        emit MimPoolChanged(_mimPool);
    }

    /// @inheritdoc ISwapperGeneric
    function swap(
        IERC20,
        IERC20,
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        degenBox.withdraw(IERC20(address(pool)), address(this), address(this), 0, shareFrom);

        // use the full balance so it's easier to check if everything has been redeemed.
        uint256 amount = IERC20(address(pool)).balanceOf(address(this));
        uint256 mimAmount;

        // Stargate Pool LP -> Underlying Token
        stargateRouter.instantRedeemLocal(poolId, amount, address(this));

        // Use mim pool to swap the remaining lp
        if (address(mimPool) != address(0)) {
            // Remaining lp amount
            amount = IERC20(address(pool)).balanceOf(address(this));

            if (amount > 0) {
                mimAmount += mimPool.swapForMim(pool, amount, address(degenBox));
            }
        } else {
            require(IERC20(address(pool)).balanceOf(address(this)) == 0, "Cannot fully redeem");
        }

        // Stargate Pool Underlying Token -> MIM
        mimAmount += curvePool.exchange_underlying(
            curvePoolI,
            curvePoolJ,
            underlyingPoolToken.balanceOf(address(this)),
            0,
            address(degenBox)
        );

        (, shareReturned) = degenBox.deposit(mim, address(degenBox), recipient, mimAmount, 0);
        extraShare = shareReturned - shareToMin;
    }

    /// @inheritdoc ISwapperGeneric
    function swapExact(
        IERC20,
        IERC20,
        address,
        address,
        uint256,
        uint256
    ) public pure override returns (uint256 shareUsed, uint256 shareReturned) {
        return (0, 0);
    }

    /// @dev copied from @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol to avoid IERC20 naming conflict
    function _safeApprove(
        IERC20 token,
        address spender,
        uint256 value
    ) private {
        // solhint-disable-next-line reason-string
        require((value == 0) || (token.allowance(address(this), spender) == 0), "SafeERC20: approve from non-zero to non-zero allowance");

        bytes memory returndata = address(token).functionCall(
            abi.encodeWithSelector(token.approve.selector, spender, value),
            "SafeERC20: low-level call failed"
        );
        if (returndata.length > 0) {
            // Return data is optional
            // solhint-disable-next-line reason-string
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}
