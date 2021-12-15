//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@rari-capital/solmate/src/erc20/ERC20.sol";
import "@rari-capital/solmate/src/erc20/SafeERC20.sol";

import "../interfaces/convex/IRewardStaking.sol";
import "../interfaces/convex/ILockedCvx.sol";
import "../interfaces/convex/IDelegation.sol";
import "../interfaces/curve/ICrvDepositor.sol";

contract WrappedCVX is ERC20, Ownable {
    using SafeERC20 for ERC20;

    ERC20 public constant cvxCrv = ERC20(0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7);
    ERC20 public constant cvx = ERC20(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);
    ERC20 public constant crv = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    IRewardStaking public constant cvxcrvStaking = IRewardStaking(0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e);
    ICrvDepositor public constant crvDeposit = ICrvDepositor(0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae);

    ILockedCvx public cvxlocker;
    bool public migrating;
    bool public emergencyWithdrawOpened;

    mapping(address => bool) public operators;

    modifier onlyOperators() {
        require(operators[_msgSender()], "!auth");
        _;
    }

    constructor(ILockedCvx _cvxlocker) ERC20("Wrapped CVX", "wCVX", 18) {
        cvxlocker = _cvxlocker;
    }

    function setApprovals() external {
        cvxCrv.safeApprove(address(cvxcrvStaking), type(uint256).max);
        cvx.safeApprove(address(cvxlocker), type(uint256).max);
        crv.safeApprove(address(crvDeposit), type(uint256).max);
    }

    function wrap(uint256 amount) external returns (bool) {
        require(!cvxlocker.isShutdown(), "shutdown");
        require(!migrating, "migrating");

        uint256 totalTokens = cvxlocker.lockedBalanceOf(address(this));
        uint256 shares = totalSupply == 0 ? amount : (amount * totalSupply) / totalTokens;

        cvx.safeTransferFrom(msg.sender, address(this), amount);
        cvxlocker.lock(address(this), cvx.balanceOf(address(this)), 0);

        _mint(msg.sender, shares);

        return true;
    }

    function openEmergencyWithdraw() external {
        require(cvxlocker.isShutdown(), "!shutdown");
        emergencyWithdrawOpened = true;

        // withdraw unlocked cvx + cvxCrv rewards
        processRewards(false, false, false);
    }

    /// @notice withdraw user unlocked cvx released from openEmergencyWithdraw
    /// Limitation: doesn't return the associated rewards as the constract
    /// doesn't keep track of it. 
    function emergencyWithdraw(uint256 amount) external {
        require(emergencyWithdrawOpened, "!opened");

        _burn(msg.sender, amount);
        cvx.safeTransfer(msg.sender, amount);
    }

    /// @notice Delegate all voting right from this contract locked CVX using the given
    /// delegate contract to the given delegatee for the "cvx.eth" delegating space.
    /// The delegateContract must be an implementation of Gnosis Delegate Registry used
    /// for snapshot voting. https://docs.snapshot.org/guides/delegation
    function setDelegate(IDelegation _delegateContract, address _delegate) external onlyOperators {
        _delegateContract.setDelegate("cvx.eth", _delegate);
    }

    /// @dev can be used to swap rewards
    /// Swap to CVX to accrue the wrappedCVX value
    function swapRewards1Inch(
        address inchrouter,
        ERC20 token,
        uint256 amount,
        bytes calldata data
    ) external onlyOperators {
        require(token != cvx, "denied");

        token.safeApprove(inchrouter, amount);
        (bool success, ) = inchrouter.call(data);

        require(success, "swap failed");
    }

    /// @notice Withdraw/relock all currently locked tokens where the unlock time has passed.
    /// Also receive rewards from cvxCRV and locked CVX
    /// Could also receive more reward tokens than the one specified
    function processRewards(
        bool relock,
        bool stakeCrv,
        bool stakeCvx
    ) public onlyOperators {
        // TODO: is it safe to always look for unlocked CVX and relock it? This would
        // harvest rewards at the same time, and ensure maximum voting weight for all CVX in the contract.
        cvxlocker.processExpiredLocks(relock, 0, address(this));

        // Receives cvxCRV
        cvxlocker.getReward(address(this), true);

        // Receives rewards like CRV, 3Crv and CVX
        // The CVX should stay in the contract to accrue the wrappedCVX value
        cvxcrvStaking.getReward(address(this), true);

        // Deposit CRV to receive cvxCRV
        if (stakeCrv) {
            uint256 crvBal = crv.balanceOf(address(this));
            if (crvBal > 0) {
                crvDeposit.deposit(crvBal, true); 
            }
        }

        if (stakeCvx) {
            // cvxCRV from IRewardStaking reward and ICrvDepositor deposit
            uint256 cvxcrvBal = cvxCrv.balanceOf(address(this));
            if (cvxcrvBal > 0) {
                cvxcrvStaking.stake(cvxcrvBal);
            }
        }
    }

    function withdrawCvxCrv(uint256 _amount, address _withdrawTo) external onlyOwner onlyOperators {
        require(_withdrawTo != address(0), "bad address");

        IRewardStaking(cvxcrvStaking).withdraw(_amount, true);
        uint256 cvxcrvBal = cvxCrv.balanceOf(address(this));
        if (cvxcrvBal > 0) {
            cvxCrv.safeTransfer(_withdrawTo, cvxcrvBal);
        }
    }

    function migrateStakedCvxCrv(address destination) external onlyOwner {
        require(migrating, "!migrating");
        require(destination != address(0), "bad address");

        cvxcrvStaking.withdraw(cvxcrvStaking.balanceOf(address(this)), true);
        uint256 cvxcrvBal = cvxCrv.balanceOf(address(this));

        if (cvxcrvBal > 0) {
            cvxCrv.safeTransfer(destination, cvxcrvBal);
        }
    }

    function migrateTo(ERC20 token, address destination) external onlyOwner {
        require(migrating, "!migrating");
        require(destination != address(0), "bad address");

        token.safeTransfer(destination, token.balanceOf(address(this)));
    }

    function setMigrating(bool migrating_) external onlyOwner {
        migrating = migrating_;
    }

    function setOperator(address operator, bool active) external onlyOwner {
        operators[operator] = active;
    }
}
