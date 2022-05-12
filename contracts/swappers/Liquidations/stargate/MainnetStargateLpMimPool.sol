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

    IAggregator public constant MIM_ORACLE = IAggregator(0x7A364e8770418566e3eb2001A96116E6138Eb32F);
    IStargateRouter public constant ROUTER = IStargateRouter(0x8731d54E9D02c286767d56ac03e8037C07e01e98);
    ERC20 public constant MIM = ERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    CurvePool public constant MIM_3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);

    constructor(ERC20 _mim, IStargateRouter _stargateRouter) BaseStargateLpMimPool(MIM, MIM_ORACLE, ROUTER) {}

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

    function swapToMimOnCurve(uint256 amountIn, int128 i) external onlyOwner {
        ERC20(MIM_3POOL.coins(uint128(i))).safeApprove(address(MIM_3POOL), amountIn);
        MIM_3POOL.exchange_underlying(i, 0, amountIn, 0, address(this));
    }
}
