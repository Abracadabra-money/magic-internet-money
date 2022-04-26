// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../interfaces/ISwapperGeneric.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/curve/ICurvePool.sol";
import "../../interfaces/stargate/IStargateRouter.sol";
import "../../interfaces/stargate/IStargatePool.sol";

/// @notice Liquidation Swapper for Stargate LP using Curve
contract StargateCurveSwapper is ISwapperGeneric {
    IBentoBoxV1 public immutable degenBox;
    IStargatePool public immutable pool;
    IStargateRouter public immutable stargateRouter;
    CurvePool public immutable curvePool;
    int128 public immutable curvePoolI;
    int128 public immutable curvePoolJ;
    uint16 public immutable poolId;
    IERC20 public immutable underlyingPoolToken;
    IERC20 public immutable mim;
    
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
        underlyingPoolToken.approve(address(_curvePool), type(uint256).max);
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

        // Stargate Pool LP -> Underlying Token
        stargateRouter.instantRedeemLocal(poolId, amount, address(this));
        require(IERC20(address(pool)).balanceOf(address(this)) == 0, "Cannot fully redeem");

        amount = underlyingPoolToken.balanceOf(address(this));

        // Stargate Pool Underlying Token -> MIM
        amount = curvePool.exchange_underlying(curvePoolI, curvePoolJ, amount, 0, address(degenBox));

        (, shareReturned) = degenBox.deposit(mim, address(degenBox), recipient, amount, 0);
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
}
