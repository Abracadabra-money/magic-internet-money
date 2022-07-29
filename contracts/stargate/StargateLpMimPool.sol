// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "solmate/src/utils/SafeTransferLib.sol";
import "solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/stargate/IStargatePool.sol";
import "../interfaces/stargate/IStargateRouter.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IAggregator.sol";

contract StargateLpMimPool is Ownable {
    using SafeTransferLib for ERC20;

    error ErrSwapFailed();

    event AllowedRedeemerChanged(address redeemer, bool allowed);
    event AllowedExecutorChanged(address redeemer, bool allowed);
    event Swap(address from, IStargatePool tokenIn, uint256 amountIn, uint256 amountOut, address recipient);
    event PoolChanged(IStargatePool lp, uint16 poolId, IOracle oracle);
    event FeeChanged(uint256 feeBps);

    struct PoolInfo {
        uint16 poolId; // 16 bits
        IOracle oracle; // 160 bits
        uint80 oracleDecimalsMultipler; // 80 bits
    }

    ERC20 public immutable mim;
    IAggregator public immutable mimOracle;

    IStargateRouter public immutable stargateRouter;

    uint256 public feeBps;

    mapping(IStargatePool => PoolInfo) public pools;
    mapping(address => bool) public allowedRedeemers;
    mapping(address => bool) public allowedExecutors;

    modifier onlyAllowedRedeemers() {
        require(allowedRedeemers[msg.sender] == true, "not allowed");
        _;
    }

    modifier onlyAllowedExecutors() {
        require(allowedExecutors[msg.sender] == true, "not allowed");
        _;
    }

    constructor(
        ERC20 _mim,
        IAggregator _mimOracle,
        IStargateRouter _stargateRouter
    ) {
        feeBps = 20;
        mim = _mim;
        mimOracle = _mimOracle;
        stargateRouter = _stargateRouter;
    }

    function swapForMim(
        IStargatePool tokenIn,
        uint256 amountIn,
        address recipient
    ) external onlyAllowedRedeemers returns (uint256) {
        require(address(pools[tokenIn].oracle) != address(0), "invalid tokenIn");

        uint256 amount = getMimAmountOut(tokenIn, amountIn);

        ERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
        mim.transfer(recipient, amount);

        emit Swap(msg.sender, tokenIn, amountIn, amount, recipient);

        return amount;
    }

    function getMimAmountOut(IStargatePool tokenIn, uint256 amountIn) public view returns (uint256) {
        require(address(pools[tokenIn].oracle) != address(0), "invalid tokenIn");

        uint256 mimUsd = uint256(mimOracle.latestAnswer()); // 8 decimals

        /// @dev for oracleDecimalsMultipler = 14 and tokenIn is 6 decimals -> mimAmount is 18 decimals
        uint256 amount = ((amountIn * 10**pools[tokenIn].oracleDecimalsMultipler) / pools[tokenIn].oracle.peekSpot("")) / mimUsd;
        return amount - ((amount * feeBps) / 10_000);
    }

    /*** Admin Functions ***/
    function setAllowedRedeemer(address redeemer, bool allowed) external onlyOwner {
        allowedRedeemers[redeemer] = allowed;
        emit AllowedRedeemerChanged(redeemer, allowed);
    }

    function setAllowedExecutor(address executor, bool allowed) external onlyOwner {
        allowedExecutors[executor] = allowed;
        emit AllowedExecutorChanged(executor, allowed);
    }

    function setFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 10_000, "max fee is 10000");
        feeBps = _feeBps;

        emit FeeChanged(_feeBps);
    }

    function setPool(
        IStargatePool lp,
        uint16 poolId,
        IOracle oracle,
        uint80 oracleDecimalsMultipler
    ) external onlyOwner {
        pools[lp] = PoolInfo({poolId: poolId, oracle: oracle, oracleDecimalsMultipler: oracleDecimalsMultipler});

        ERC20(address(lp)).safeApprove(address(stargateRouter), type(uint256).max);

        emit PoolChanged(lp, poolId, oracle);
    }

    function getMaximumInstantRedeemable(IStargatePool lp) internal view returns (uint256) {
        uint256 totalLiquidity = lp.totalLiquidity();

        require(totalLiquidity > 0, "totalLiquidity is 0");
        uint256 amountSD = lp.deltaCredit();

        return (amountSD * lp.totalSupply()) / totalLiquidity;
    }

    /// @param dstChainId the chainId to remove liquidity
    /// @param srcPoolId the source poolId
    /// @param dstPoolId the destination poolId
    /// @param amount quantity of LP tokens to redeem
    /// @param txParams adpater parameters
    /// https://layerzero.gitbook.io/docs/technical-reference/mainnet/supported-chain-ids
    function redeemLocal(
        uint16 dstChainId,
        uint256 srcPoolId,
        uint256 dstPoolId,
        uint256 amount,
        IStargateRouter.lzTxObj memory txParams
    ) external payable onlyAllowedExecutors {
        stargateRouter.redeemLocal{value: msg.value}(
            dstChainId,
            srcPoolId,
            dstPoolId,
            payable(msg.sender),
            amount,
            abi.encodePacked(address(this)),
            txParams
        );
    }

    function instantRedeemLocalMax(IStargatePool lp) external onlyAllowedExecutors {
        PoolInfo memory info = pools[lp];

        uint256 amount = ERC20(address(lp)).balanceOf(address(this));
        uint256 max = getMaximumInstantRedeemable(lp);

        stargateRouter.instantRedeemLocal(info.poolId, amount > max ? max : amount, address(this));
    }

    function instantRedeemLocal(IStargatePool lp, uint256 amount) external onlyAllowedExecutors {
        PoolInfo memory info = pools[lp];
        stargateRouter.instantRedeemLocal(info.poolId, amount, address(this));
    }

    /// @dev Swap internal tokens using an aggregator, for example, 1inch, 0x.
    function swapOnAggregator(
        address aggreagtorRouter,
        ERC20 tokenIn,
        bytes calldata data
    ) external onlyAllowedExecutors {
        tokenIn.safeApprove(aggreagtorRouter, type(uint256).max);

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = aggreagtorRouter.call(data);
        if (!success) {
            revert ErrSwapFailed();
        }

        tokenIn.safeApprove(aggreagtorRouter, 0);
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
