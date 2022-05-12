// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../../../interfaces/stargate/IStargatePool.sol";
import "../../../interfaces/stargate/IStargateRouter.sol";
import "../../../interfaces/IOracle.sol";
import "../../../interfaces/IAggregator.sol";

abstract contract BaseStargateLpMimPool is Ownable {
    using SafeTransferLib for ERC20;

    event AllowedRedeemerChanged(address redeemer, bool allowed);
    event SwappingFeeChanged(uint256 feeBps);
    event Swap(address from, IStargatePool tokenIn, uint256 amountIn, uint256 amountOut, address recipient);
    event PoolChanged(IStargatePool lp, uint16 poolId, IOracle oracle);

    struct PoolInfo {
        uint16 poolId; // 16 bits
        IOracle oracle; // 160 bits
        uint80 oracleDecimalsMultipler; // 80 bits
    }

    ERC20 public immutable mim;
    IAggregator public immutable mimOracle;

    IStargateRouter public immutable stargateRouter;

    uint256 public swappingFeeBps;

    mapping(IStargatePool => PoolInfo) public pools;
    mapping(address => bool) public allowedRedeemers;

    modifier onlyAllowedRedeemers() {
        require(allowedRedeemers[msg.sender] == true, "not allowed");
        _;
    }

    constructor(
        ERC20 _mim,
        IAggregator _mimOracle,
        IStargateRouter _stargateRouter
    ) {
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

        uint256 mimAmountOut = getMimAmountOut(tokenIn, amountIn);

        ERC20(address(tokenIn)).safeTransferFrom(msg.sender, address(this), amountIn);
        mim.transfer(recipient, mimAmountOut);

        emit Swap(msg.sender, tokenIn, amountIn, mimAmountOut, recipient);

        return mimAmountOut;
    }

    function getMimAmountOut(IStargatePool tokenIn, uint256 amountIn) public view returns (uint256) {
        require(address(pools[tokenIn].oracle) != address(0), "invalid tokenIn");

        uint256 mimUsd = uint256(mimOracle.latestAnswer()); // 8 decimals

        /// @dev for oracleDecimalsMultipler = 14 and tokenIn is 6 decimals -> mimAmount is 18 decimals
        uint256 mimAmount = (amountIn * pools[tokenIn].oracle.peekSpot("") * pools[tokenIn].oracleDecimalsMultipler) / mimUsd;
        return mimAmount - ((mimAmount * swappingFeeBps) / 10_000);
    }

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
