// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "../../../interfaces/stargate/IStargateRouter.sol";
import "../../../interfaces/stargate/IStargatePool.sol";
import "../../../interfaces/curve/ICurvePool.sol";

import "./BaseStargateLpMimPool.sol";

contract MainnetStargateLpMimPool is BaseStargateLpMimPool {
    using SafeTransferLib for ERC20;

    IStargateRouter public constant ROUTER = IStargateRouter(0x8731d54E9D02c286767d56ac03e8037C07e01e98);
    ERC20 public constant MIM = ERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);

    constructor(ERC20 _mim, IStargateRouter _stargateRouter) BaseStargateLpMimPool(MIM, ROUTER) {}

    function _redeemStargateUnderlying(IStargatePool lp, uint256 amount) internal override {
        PoolInfo memory info = pools[lp];
        IStargateRouter.lzTxObj memory txParams = IStargateRouter.lzTxObj({dstGasForCall: 0, dstNativeAmount: 0, dstNativeAddr: ""});

        stargateRouter.redeemLocal(1, info.poolId, info.poolId, payable(address(this)), amount, abi.encodePacked(address(this)), txParams);
    }

    function swapToMimOn1Inch(
        address inchrouter,
        ERC20 tokenIn,
        bytes calldata data
    ) external onlyOwner {
        tokenIn.safeApprove(inchrouter, type(uint256).max);

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = inchrouter.call(data);
        require(success, "1inch swap unsucessful");

        tokenIn.safeApprove(inchrouter, 0);
    }

    function swapToMimOnCurve(
        uint256 amountIn,
        int128 i
    ) external onlyOwner {
        ERC20(MIM3POOL.coins(uint128(i))).safeApprove(address(MIM3POOL), amountIn);
        MIM3POOL.exchange_underlying(i, 0, amountIn, 0, address(this));
    }
}
