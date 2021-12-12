//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../token/WrappedShareToken.sol";
import "../interfaces/convex/IRewardStaking.sol";
import "../interfaces/convex/ILockedCvx.sol";
import "../interfaces/convex/IDelegation.sol";
import "../interfaces/curve/ICrvDepositor.sol";

contract WrappedCVX is WrappedShareToken, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public constant cvxCrv = IERC20(0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7);
    IERC20 public constant cvx = IERC20(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    IERC20 public constant crv = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address public constant cvxcrvStaking = address(0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e);
    address public constant crvDeposit = address(0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae);

    ILockedCvx public cvxlocker;

    uint256 public treasuryShare;

    mapping(address => bool) public operators;

    modifier onlyOperators() {
        require(operators[_msgSender()], "!auth");
        _;
    }

    constructor(ILockedCvx _cvxlocker) WrappedShareToken(cvx) {
        cvxlocker = _cvxlocker;

        cvxCrv.safeApprove(cvxcrvStaking, type(uint256).max);
        cvx.safeApprove(address(cvxlocker), type(uint256).max);
        crv.safeApprove(crvDeposit, type(uint256).max);
    }

    function wrap(uint256 amount) external nonReentrant {
        mint(amount);
    }

    // check unlock amount
    // if not enough then use market to swap out the remaining amount
    function unwrap(uint256 amount) external nonReentrant {
        burn(address(0), amount);
    }

    function swapRewards1Inch(
        address inchrouter,
        IERC20 token,
        uint256 percent,
        bytes calldata data
    ) external onlyOperators nonReentrant {
        uint256 amount = (token.balanceOf(address(this)) * percent) / 100;
        token.safeApprove(inchrouter, amount);
        (bool success, ) = inchrouter.call(data);

        require(success, "swap failed");
    }

    function processRewards() external onlyOperators {
        cvxlocker.getReward(address(this), true);
        IRewardStaking(cvxcrvStaking).getReward(address(this), true);

        uint256 crvBal = crv.balanceOf(address(this));
        if (crvBal > 0) {
            ICrvDepositor(crvDeposit).deposit(crvBal, true);
        }

        uint256 cvxcrvBal = cvxCrv.balanceOf(address(this));
        if (cvxcrvBal > 0) {
            IRewardStaking(cvxcrvStaking).stake(cvxcrvBal);
        }
    }

    function setTreasuryShare(uint256 share) external onlyOwner {
        treasuryShare = share;
    }

    function emergencyWithdrawUnlockedCVX() external onlyOwner {}

    function migrate(IERC20 token, address destination) external onlyOwner {
        token.safeTransfer(destination, token.balanceOf(address(this)));
    }

    function symbol() public pure override returns (string memory) {
        return "wCVX";
    }

    function name() public pure override returns (string memory) {
        return "Wrapped CVX";
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function setOperator(address operator, bool active) external onlyOwner {
        operators[operator] = active;
    }
}
