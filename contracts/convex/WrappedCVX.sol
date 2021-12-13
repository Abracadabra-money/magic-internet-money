//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../token/WrappedShareToken.sol";
import "../interfaces/convex/IRewardStaking.sol";
import "../interfaces/convex/ILockedCvx.sol";
import "../interfaces/convex/IDelegation.sol";
import "../interfaces/curve/ICrvDepositor.sol";

contract WrappedCVX is WrappedShareToken, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public constant cvxCrv = IERC20(0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7);
    IERC20 public constant cvx = IERC20(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    IERC20 public constant crv = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address public constant cvxcrvStaking = address(0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e);
    address public constant crvDeposit = address(0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae);

    ILockedCvx public cvxlocker;
    bool public migrating;
    mapping(address => bool) public operators;

    modifier onlyOperators() {
        require(operators[_msgSender()], "!auth");
        _;
    }

    modifier whenNotMigrating() {
        require(!migrating, "migrating");
        _;
    }

    constructor(ILockedCvx _cvxlocker) WrappedShareToken(cvx) {
        cvxlocker = _cvxlocker;
    }

    function setApprovals() external {
        cvxCrv.safeApprove(cvxcrvStaking, type(uint256).max);
        cvx.safeApprove(address(cvxlocker), type(uint256).max);
        crv.safeApprove(crvDeposit, type(uint256).max);
    }

    function wrap(uint256 amount) external whenNotMigrating {
        mint(amount);

        cvxlocker.lock(address(this), cvx.balanceOf(address(this)), 0);
    }

    /// TODO: Should we keep track of each user's unlocked deposit or also return CVX from wrappedCVX/CVX pair.
    /// Being able to withdraw at anytime using the pair, even if the underlying is theorically locked
    /// would allow liquidation to work at anytime as well,
    function unwrap(uint256 amount) external whenNotMigrating {
        burn(address(0), amount);
    }

    /// @notice Delegate all voting right from this contract locked CVX using the given
    /// delegate contract to the given delegatee for the "cvx.eth" delegating space.
    /// The delegateContract must be an implementation of Gnosis Delegate Registry used
    /// for snapshot voting. https://docs.snapshot.org/guides/delegation
    function setDelegate(address _delegateContract, address _delegate) external onlyOperators {
        IDelegation(_delegateContract).setDelegate("cvx.eth", _delegate);
    }

    /// @dev can be used to swap rewards
    /// Swap to CVX to accrue the wrappedCVX value
    function swapRewards1Inch(
        address inchrouter,
        IERC20 token,
        uint256 percent,
        bytes calldata data
    ) external onlyOperators {
        uint256 amount = (token.balanceOf(address(this)) * percent) / 100;
        token.safeApprove(inchrouter, amount);
        (bool success, ) = inchrouter.call(data);

        require(success, "swap failed");
    }

    /// @notice Withdraw/relock all currently locked tokens where the unlock time has passed.
    /// Also receive rewards from cvxCRV and locked CVX
    /// Could also receive more reward tokens than the one specified
    function processRewards(bool _relock) external onlyOperators {
        // TODO: is it safe to always look for unlocked CVX and relock it? This would
        // harvest rewards at the same time, and ensure maximum voting weight for all CVX in the contract.
        cvxlocker.processExpiredLocks(_relock, 0, address(this));

        // Receives cvxCRV
        cvxlocker.getReward(address(this), true);

        // Receives rewards like CRV, 3Crv and CVX
        // The CVX should stay in the contract to accrue the wrappedCVX value
        IRewardStaking(cvxcrvStaking).getReward(address(this), true);

        // Deposit CRV to receive cvxCRV
        uint256 crvBal = crv.balanceOf(address(this));
        if (crvBal > 0) {
            ICrvDepositor(crvDeposit).deposit(crvBal, true);
        }

        // cvxCRV from IRewardStaking reward and ICrvDepositor deposit
        uint256 cvxcrvBal = cvxCrv.balanceOf(address(this));
        if (cvxcrvBal > 0) {
            IRewardStaking(cvxcrvStaking).stake(cvxcrvBal);
        }
    }

    function rescueTokens(
        IERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    function emergencyWithdrawUnlockedCVX() external onlyOwner {}

    function migrate(IERC20 token, address destination) external onlyOwner {
        require(migrating, "!migrating");

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
