// SPDX-License-Identifier: MIT
// Inspired by Stable Joe Staking which in turn is derived from the SushiSwap MasterChef contract

pragma solidity 0.8.10;
import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "../libraries/BoringOwnable.sol";

/**
 * @title Magic Spell Staking
 * @author 0xMerlin
 */
contract mSpellStaking is BoringOwnable {
    using SafeTransferLib for ERC20;

    /// @notice Info of each user
    struct UserInfo {
        uint128 amount;

        uint128 rewardDebt;
        uint128 lastAdded;
        /**
         * @notice We do some fancy math here. Basically, any point in time, the amount of JOEs
         * entitled to a user but is pending to be distributed is:
         *
         *   pending reward = (user.amount * accRewardPerShare) - user.rewardDebt[token]
         *
         * Whenever a user deposits or withdraws SPELL. Here's what happens:
         *   1. accRewardPerShare (and `lastRewardBalance`) gets updated
         *   2. User receives the pending reward sent to his/her address
         *   3. User's `amount` gets updated
         *   4. User's `rewardDebt[token]` gets updated
         */
    }

    ERC20 public immutable spell;
    /// @notice Array of tokens that users can claim
    ERC20 public immutable mim;
    /// @notice Last reward balance of `token`
    uint256 public lastRewardBalance;

    /// @notice amount of time that the position is locked for.
    uint256 private constant LOCK_TIME = 24 hours;
    bool public toggleLockup;

    /// @notice Accumulated `token` rewards per share, scaled to `ACC_REWARD_PER_SHARE_PRECISION`
    uint256 public accRewardPerShare;
    /// @notice The precision of `accRewardPerShare`
    uint256 public constant ACC_REWARD_PER_SHARE_PRECISION = 1e24;

    /// @dev Info of each user that stakes SPELL
    mapping(address => UserInfo) public userInfo;

    /// @notice Emitted when a user deposits SPELL
    event Deposit(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws SPELL
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Emitted when a user claims reward
    event ClaimReward(address indexed user, uint256 amount);

    /// @notice Emitted when a user emergency withdraws its SPELL
    event EmergencyWithdraw(address indexed user, uint256 amount);

    /**
     * @notice Initialize a new mSpellStaking contract
     * @dev This contract needs to receive an ERC20 `_rewardToken` in order to distribute them
     * (with MoneyMaker in our case)
     * @param _mim The address of the MIM token
     * @param _spell The address of the SPELL token
     */
    constructor(
        ERC20 _mim,
        ERC20 _spell
    ) {
        require(address(_mim) != address(0), "mSpellStaking: reward token can't be address(0)");
        require(address(_spell) != address(0), "mSpellStaking: spell can't be address(0)");

        spell = _spell;
        toggleLockup = true;

        mim = _mim;
    }

    /**
     * @notice Deposit SPELL for reward token allocation
     * @param _amount The amount of SPELL to deposit
     */
    function deposit(uint256 _amount) external {
        UserInfo storage user = userInfo[msg.sender];

        uint256 _previousAmount = user.amount;
        uint256 _newAmount = user.amount + _amount;
        user.amount = uint128(_newAmount);
        user.lastAdded = uint128(block.timestamp);

        updateReward();

        uint256 _previousRewardDebt = user.rewardDebt;
        user.rewardDebt = uint128(_newAmount * accRewardPerShare / ACC_REWARD_PER_SHARE_PRECISION);

        if (_previousAmount != 0) {
            uint256 _pending = _previousAmount * accRewardPerShare / ACC_REWARD_PER_SHARE_PRECISION - _previousRewardDebt;
            if (_pending != 0) {
                safeTokenTransfer(mim, msg.sender, _pending);
                emit ClaimReward(msg.sender, _pending);
            }
        }

        spell.safeTransferFrom(msg.sender, address(this), _amount);
        emit Deposit(msg.sender, _amount);
    }

    /**
     * @notice View function to see pending reward token on frontend
     * @param _user The address of the user
     * @return `_user`'s pending reward token
     */
    function pendingReward(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        uint256 _totalSpell = spell.balanceOf(address(this));
        uint256 _accRewardTokenPerShare = accRewardPerShare;

        uint256 _rewardBalance = mim.balanceOf(address(this));

        if (_rewardBalance != lastRewardBalance && _totalSpell != 0) {
            uint256 _accruedReward = _rewardBalance - lastRewardBalance;
            _accRewardTokenPerShare = _accRewardTokenPerShare + _accruedReward * ACC_REWARD_PER_SHARE_PRECISION / _totalSpell;
        }
        return user.amount * _accRewardTokenPerShare / ACC_REWARD_PER_SHARE_PRECISION - user.rewardDebt;
    }

    /**
     * @notice Withdraw SPELL and harvest the rewards
     * @param _amount The amount of SPELL to withdraw
     */
    function withdraw(uint256 _amount) external {
        UserInfo storage user = userInfo[msg.sender];

        require(!toggleLockup || user.lastAdded + LOCK_TIME < block.timestamp, "mSpell: Wait for LockUp");

        uint256 _previousAmount = user.amount;
        uint256 _newAmount = user.amount - _amount;
        user.amount = uint128(_newAmount);

        updateReward();

        uint256 _pending = _previousAmount * accRewardPerShare / ACC_REWARD_PER_SHARE_PRECISION - user.rewardDebt;
        user.rewardDebt = uint128(_newAmount * accRewardPerShare / ACC_REWARD_PER_SHARE_PRECISION);

        if (_pending != 0) {
            safeTokenTransfer(mim, msg.sender, _pending);
            emit ClaimReward(msg.sender, _pending);
        }

        spell.safeTransfer(msg.sender, _amount);
        emit Withdraw(msg.sender, _amount);
    }

    /**
     * @notice Withdraw without caring about rewards. EMERGENCY ONLY
     */
    function emergencyWithdraw() external {
        UserInfo storage user = userInfo[msg.sender];

        require(!toggleLockup || user.lastAdded + LOCK_TIME < block.timestamp, "mSpell: Wait for LockUp");

        uint256 _amount = user.amount;

        user.amount = 0;
        user.rewardDebt = 0;

        spell.safeTransfer(msg.sender, _amount);
        emit EmergencyWithdraw(msg.sender, _amount);
    }

    /**
     * @notice Update reward variables
     * @dev Needs to be called before any deposit or withdrawal
     */
    function updateReward() public {
        uint256 _rewardBalance = mim.balanceOf(address(this));
        uint256 _totalSpell = spell.balanceOf(address(this));

        // Did mSpellStaking receive any token
        if (_rewardBalance == lastRewardBalance || _totalSpell == 0) {
            return;
        }

        uint256 _accruedReward = _rewardBalance - lastRewardBalance;

        accRewardPerShare = accRewardPerShare + _accruedReward * ACC_REWARD_PER_SHARE_PRECISION / _totalSpell;
        lastRewardBalance = _rewardBalance;
    }

    /**
     * @notice Safe token transfer function, just in case if rounding error
     * causes pool to not have enough reward tokens
     * @param _token The address of then token to transfer
     * @param _to The address that will receive `_amount` `rewardToken`
     * @param _amount The amount to send to `_to`
     */
    function safeTokenTransfer(
        ERC20 _token,
        address _to,
        uint256 _amount
    ) internal {
        uint256 _rewardBalance = _token.balanceOf(address(this));

        if (_amount > _rewardBalance) {
            lastRewardBalance = lastRewardBalance - _rewardBalance;
            _token.safeTransfer(_to, _rewardBalance);
        } else {
            lastRewardBalance = lastRewardBalance - _amount;
            _token.safeTransfer(_to, _amount);
        }
    }

    /**
     * @notice Allows to enable and disable the lockup
     * @param status The new lockup status
     */

     function toggleLockUp(bool status) external onlyOwner {
        toggleLockup = status;
     }
}
