//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "@rari-capital/solmate/src/erc20/SafeERC20.sol";

import "../boring/BoringOwnable.sol";
import "../interfaces/convex/IRewardStaking.sol";
import "../interfaces/convex/ILockedCvx.sol";
import "../interfaces/convex/IDelegation.sol";
import "../interfaces/curve/ICrvDepositor.sol";

interface IvlCvxExtraRewardDistributor {
    function getRewards(address _account, address[] calldata _tokens) external;
}

contract ConvexRewardCollector is BoringOwnable {
    using SafeERC20 for ERC20;

    IRewardStaking public constant cvxcrvStaking = IRewardStaking(0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e);
    IvlCvxExtraRewardDistributor public constant rewardDistributor =
        IvlCvxExtraRewardDistributor(0xDecc7d761496d30F30b92Bdf764fb8803c79360D);

    ILockedCvx public cvxlocker;
    address public wrappedCVX;
    mapping(address => bool) public operators;

    constructor(ILockedCvx _cvxlocker, address _wrappedCVX) {
        cvxlocker = _cvxlocker;
        wrappedCVX = _wrappedCVX;
    }

    function collectRewards(address[] calldata _tokens) public {
        rewardDistributor.getRewards(wrappedCVX, _tokens);
        cvxcrvStaking.getReward(wrappedCVX, true);
    }

    function rescueToken(ERC20 token, address destination) external onlyOwner {
        require(destination != address(0), "bad address");

        token.safeTransfer(destination, token.balanceOf(address(this)));
    }
}
