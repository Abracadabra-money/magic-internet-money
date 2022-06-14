// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../interfaces/ILevSwapperGeneric.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/platypus/IPlatypusRouter01.sol";
import "../../interfaces/stargate/IStargateRouter.sol";
import "../../interfaces/stargate/IStargatePool.sol";

/// @notice Leverage Swapper for Stargate LP using Platypus
contract StargatePlatypusLevSwapper is ILevSwapperGeneric {
    IBentoBoxV1 public immutable degenBox;
    IStargatePool public immutable pool;
    IStargateRouter public immutable stargateRouter;
    IPlatypusRouter01 public immutable platypusRouter;
    uint256 public immutable poolId;
    address[] public tokenPath;
    address[] public poolPath;

    /// @dev _tokenPath[0] must be MIM and last one Stargate Pool Underlying Token
    constructor(
        IBentoBoxV1 _degenBox,
        IStargatePool _pool,
        uint256 _poolId,
        IStargateRouter _stargateRouter,
        IPlatypusRouter01 _platypusRouter,
        address[] memory _tokenPath,
        address[] memory _poolPath
    ) {
        degenBox = _degenBox;
        pool = _pool;
        poolId = _poolId;
        stargateRouter = _stargateRouter;
        platypusRouter = _platypusRouter;

        for (uint256 i = 0; i < _tokenPath.length; i++) {
            tokenPath.push(_tokenPath[i]);
        }
        for (uint256 i = 0; i < _poolPath.length; i++) {
            poolPath.push(_poolPath[i]);
        }

        IERC20(_tokenPath[0]).approve(address(_platypusRouter), type(uint256).max);
        IERC20(_tokenPath[_tokenPath.length - 1]).approve(address(_stargateRouter), type(uint256).max);
        IERC20(address(pool)).approve(address(_degenBox), type(uint256).max);
    }

    // Swaps to a flexible amount, from an exact input amount
    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public override returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amount, ) = degenBox.withdraw(IERC20(tokenPath[0]), address(this), address(this), 0, shareFrom);

        // MIM -> Stargate Pool Underlying Token
        (amount, ) = platypusRouter.swapTokensForTokens(tokenPath, poolPath, amount, 0, address(this), type(uint256).max);

        // Underlying Token -> Stargate Pool LP
        stargateRouter.addLiquidity(poolId, amount, address(this));
        amount = IERC20(address(pool)).balanceOf(address(this));

        (, shareReturned) = degenBox.deposit(IERC20(address(pool)), address(this), recipient, amount, 0);
        extraShare = shareReturned - shareToMin;
    }
}
