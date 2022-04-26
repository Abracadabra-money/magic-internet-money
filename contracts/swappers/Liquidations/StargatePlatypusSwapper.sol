// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../interfaces/ISwapperGeneric.sol";
import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/platypus/IPlatypusRouter01.sol";
import "../../interfaces/stargate/IStargateRouter.sol";
import "../../interfaces/stargate/IStargatePool.sol";

/// @notice Liquidation Swapper for Stargate LP using Platypus
contract StargatePlatypusSwapper is ISwapperGeneric {
    IBentoBoxV1 public immutable degenBox;
    IStargatePool public immutable pool;
    IStargateRouter public immutable stargateRouter;
    IPlatypusRouter01 public immutable platypusRouter;
    uint16 public immutable poolId;

    address[] public tokenPath;
    address[] public poolPath;

    /// @dev _tokenPath[0] must be Stargate Pool Underlying Token and last one MIM
    constructor(
        IBentoBoxV1 _degenBox,
        IStargatePool _pool,
        uint16 _poolId,
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

        amount = IERC20(address(tokenPath[0])).balanceOf(address(this));

        // Stargate Pool Underlying Token -> MIM
        (amount, ) = platypusRouter.swapTokensForTokens(tokenPath, poolPath, amount, 0, address(degenBox), type(uint256).max);

        (, shareReturned) = degenBox.deposit(IERC20(tokenPath[tokenPath.length - 1]), address(degenBox), recipient, amount, 0);
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
