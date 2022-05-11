// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../../../interfaces/stargate/IStargatePool.sol";
import "../../../interfaces/stargate/IStargateRouter.sol";
import "../../../interfaces/IOracle.sol";

abstract contract BaseStargateLpMimPool is Ownable {
    using SafeTransferLib for ERC20;

    event AllowedRedeemerChanged(address redeemer, bool allowed);
    event SwappingFeeChanged(uint256 feeBps);
    event Swap(address from, IStargatePool tokenIn, uint256 amountIn, uint256 amountOut, address recipient);
    event PoolChanged(IStargatePool lp, uint16 poolId, IOracle oracle);

    struct PoolInfo {
        uint16 poolId;
        IOracle oracle;
    }

    ERC20 public immutable mim;
    IStargateRouter public immutable stargateRouter;

    uint256 public swappingFeeBps;

    mapping(IStargatePool => PoolInfo) public pools;
    mapping(address => bool) public allowedRedeemers;

    modifier onlyAllowedRedeemers() {
        require(allowedRedeemers[msg.sender] == true, "not allowed");
        _;
    }

    constructor(ERC20 _mim, IStargateRouter _stargateRouter) {
        mim = _mim;
        stargateRouter = _stargateRouter;
    }

    function swapForMim(
        IStargatePool tokenIn,
        uint256 amountIn,
        address recipient
    ) external onlyAllowedRedeemers returns (uint256) {
        require(address(pools[tokenIn].oracle) != address(0), "invalid tokenIn");

        uint256 amountOut = getAmountOut(tokenIn, amountIn);

        ERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
        _redeemStargateUnderlying(tokenIn, amountIn);

        mim.transfer(recipient, amountOut);

        emit Swap(msg.sender, tokenIn, amountIn, amountOut, recipient);

        return amountOut;
    }

    function getAmountOut(IStargatePool tokenIn, uint256 amountIn) public view returns (uint256) {
        require(address(pools[tokenIn].oracle) != address(0), "invalid tokenIn");

        uint256 normalizedOraclePrice = pools[tokenIn].oracle.peekSpot("") * 10**(18 - tokenIn.decimals());

        uint256 amount = (amountIn * normalizedOraclePrice) / 1e18;
        return amount - ((amount * swappingFeeBps) / 10_000);
    }

    /*** Abstract Functions ***/
    function _redeemStargateUnderlying(IStargatePool lp, uint256 amount) internal virtual;

    /*** Admin Functions ***/
    function setAllowedRedeemer(address redeemer, bool allowed) external onlyOwner {
        allowedRedeemers[redeemer] = allowed;
        emit AllowedRedeemerChanged(redeemer, allowed);
    }

    function setSwappingFee(uint256 feeBps) external onlyOwner {
        swappingFeeBps = feeBps;
        emit SwappingFeeChanged(feeBps);
    }

    function setPool(
        IStargatePool lp,
        uint16 poolId,
        IOracle oracle
    ) external onlyOwner {
        pools[lp] = PoolInfo({poolId: poolId, oracle: oracle});

        ERC20(address(lp)).safeApprove(address(stargateRouter), type(uint256).max);

        emit PoolChanged(lp, poolId, oracle);
    }

    /*** Emergency Functions ***/
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (bool, bytes memory) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = to.call{value: value}(data);

        return (success, result);
    }

    function rescueTokens(
        ERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
