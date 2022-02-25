// SPDX-License-Identifier: MIT
// Inspired by Stable Joe Staking which in turn is derived from the SushiSwap MasterChef contract

pragma solidity 0.8.10;
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/math/SafeMath.sol";
import "../libraries/BoringOwnable.sol";

/**
 * @title Magic Spell Staking
 * @author 0xMerlin
 */
contract mSpellStaking is BoringOwnable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// @notice Info of each user
    struct UserInfo {
        uint256 amount;
        mapping(IERC20 => uint256) rewardDebt;
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

    IERC20 public immutable spell;
    /// @notice Array of tokens that users can claim
    IERC20[] public rewardTokens;
    mapping(IERC20 => bool) public isRewardToken;
    /// @notice Last reward balance of `token`
    mapping(IERC20 => uint256) public lastRewardBalance;

    address public feeCollector;

    /// @notice The deposit fee, scaled to `DEPOSIT_FEE_PERCENT_PRECISION`
    uint256 public depositFeePercent;
    /// @notice The precision of `depositFeePercent`
    uint256 public constant DEPOSIT_FEE_PERCENT_PRECISION = 1e18;

    /// @notice Accumulated `token` rewards per share, scaled to `ACC_REWARD_PER_SHARE_PRECISION`
    mapping(IERC20 => uint256) public accRewardPerShare;
    /// @notice The precision of `accRewardPerShare`
    uint256 public ACC_REWARD_PER_SHARE_PRECISION = 1e24;

    /// @dev Info of each user that stakes SPELL
    mapping(address => UserInfo) private userInfo;

    /// @notice Emitted when a user deposits SPELL
    event Deposit(address indexed user, uint256 amount, uint256 fee);

    /// @notice Emitted when owner changes the deposit fee percentage
    event DepositFeeChanged(uint256 newFee, uint256 oldFee);

    /// @notice Emitted when a user withdraws SPELL
    event Withdraw(address indexed user, uint256 amount);

    /// @notice Emitted when a user claims reward
    event ClaimReward(address indexed user, address indexed rewardToken, uint256 amount);

    /// @notice Emitted when a user emergency withdraws its SPELL
    event EmergencyWithdraw(address indexed user, uint256 amount);

    /// @notice Emitted when owner adds a token to the reward tokens list
    event RewardTokenAdded(address token);

    /// @notice Emitted when owner removes a token from the reward tokens list
    event RewardTokenRemoved(address token);

    /**
     * @notice Initialize a new mSpellStaking contract
     * @dev This contract needs to receive an ERC20 `_rewardToken` in order to distribute them
     * (with MoneyMaker in our case)
     * @param _rewardToken The address of the ERC20 reward token
     * @param _spell The address of the SPELL token
     * @param _feeCollector The address where deposit fees will be sent
     * @param _depositFeePercent The deposit fee percent, scalled to 1e18, e.g. 3% is 3e16
     */
    constructor (
        IERC20 _rewardToken,
        IERC20 _spell,
        address _feeCollector,
        uint256 _depositFeePercent
    ) external initializer {
        require(address(_rewardToken) != address(0), "mSpellStaking: reward token can't be address(0)");
        require(address(_spell) != address(0), "mSpellStaking: spell can't be address(0)");
        require(_feeCollector != address(0), "mSpellStaking: fee collector can't be address(0)");
        require(_depositFeePercent <= 5e17, "mSpellStaking: max deposit fee can't be greater than 50%");

        spell = _spell;
        depositFeePercent = _depositFeePercent;
        feeCollector = _feeCollector;

        isRewardToken[_rewardToken] = true;
        rewardTokens.push(_rewardToken);
    }

    /**
     * @notice Deposit SPELL for reward token allocation
     * @param _amount The amount of SPELL to deposit
     */
    function deposit(uint256 _amount) external {
        UserInfo storage user = userInfo[msg.sender];

        uint256 _fee = _amount.mul(depositFeePercent).div(DEPOSIT_FEE_PERCENT_PRECISION);
        uint256 _amountMinusFee = _amount.sub(_fee);

        uint256 _previousAmount = user.amount;
        uint256 _newAmount = user.amount.add(_amountMinusFee);
        user.amount = _newAmount;

        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            IERC20 _token = rewardTokens[i];
            updateReward(_token);

            uint256 _previousRewardDebt = user.rewardDebt[_token];
            user.rewardDebt[_token] = _newAmount.mul(accRewardPerShare[_token]).div(ACC_REWARD_PER_SHARE_PRECISION);

            if (_previousAmount != 0) {
                uint256 _pending = _previousAmount
                    .mul(accRewardPerShare[_token])
                    .div(ACC_REWARD_PER_SHARE_PRECISION)
                    .sub(_previousRewardDebt);
                if (_pending != 0) {
                    safeTokenTransfer(_token, msg.sender, _pending);
                    emit ClaimReward(msg.sender, address(_token), _pending);
                }
            }
        }

        spell.safeTransferFrom(msg.sender, feeCollector, _fee);
        spell.safeTransferFrom(msg.sender, address(this), _amountMinusFee);
        emit Deposit(msg.sender, _amountMinusFee, _fee);
    }

    /**
     * @notice Get user info
     * @param _user The address of the user
     * @param _rewardToken The address of the reward token
     * @return The amount of SPELL user has deposited
     * @return The reward debt for the chosen token
     */
    function getUserInfo(address _user, IERC20 _rewardToken) external view returns (uint256, uint256) {
        UserInfo storage user = userInfo[_user];
        return (user.amount, user.rewardDebt[_rewardToken]);
    }

    /**
     * @notice Get the number of reward tokens
     * @return The length of the array
     */
    function rewardTokensLength() external view returns (uint256) {
        return rewardTokens.length;
    }

    /**
     * @notice Add a reward token
     * @param _rewardToken The address of the reward token
     */
    function addRewardToken(IERC20 _rewardToken) external onlyOwner {
        require(
            !isRewardToken[_rewardToken] && address(_rewardToken) != address(0) && _rewardToken != spell,
            "mSpellStaking: token can't be added"
        );
        require(rewardTokens.length < 25, "mSpellStaking: list of token too big");
        rewardTokens.push(_rewardToken);
        isRewardToken[_rewardToken] = true;
        updateReward(_rewardToken);
        emit RewardTokenAdded(address(_rewardToken));
    }

    /**
     * @notice Remove a reward token
     * @param _rewardToken The address of the reward token
     */
    function removeRewardToken(IERC20 _rewardToken) external onlyOwner {
        require(isRewardToken[_rewardToken], "mSpellStaking: token can't be removed");
        updateReward(_rewardToken);
        isRewardToken[_rewardToken] = false;
        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            if (rewardTokens[i] == _rewardToken) {
                rewardTokens[i] = rewardTokens[_len - 1];
                rewardTokens.pop();
                break;
            }
        }
        emit RewardTokenRemoved(address(_rewardToken));
    }

    /**
     * @notice Set the deposit fee percent
     * @param _depositFeePercent The new deposit fee percent
     */
    function setDepositFeePercent(uint256 _depositFeePercent) external onlyOwner {
        require(_depositFeePercent <= 5e17, "mSpellStaking: deposit fee can't be greater than 50%");
        uint256 oldFee = depositFeePercent;
        depositFeePercent = _depositFeePercent;
        emit DepositFeeChanged(_depositFeePercent, oldFee);
    }

    /**
     * @notice View function to see pending reward token on frontend
     * @param _user The address of the user
     * @param _token The address of the token
     * @return `_user`'s pending reward token
     */
    function pendingReward(address _user, IERC20 _token) external view returns (uint256) {
        require(isRewardToken[_token], "mSpellStaking: wrong reward token");
        UserInfo storage user = userInfo[_user];
        uint256 _totalSpell = spell.balanceOf(address(this));
        uint256 _accRewardTokenPerShare = accRewardPerShare[_token];

        uint256 _rewardBalance = _token.balanceOf(address(this));

        if (_rewardBalance != lastRewardBalance[_token] && _totalSpell != 0) {
            uint256 _accruedReward = _rewardBalance.sub(lastRewardBalance[_token]);
            _accRewardTokenPerShare = _accRewardTokenPerShare.add(
                _accruedReward.mul(ACC_REWARD_PER_SHARE_PRECISION).div(_totalSpell)
            );
        }
        return
            user.amount.mul(_accRewardTokenPerShare).div(ACC_REWARD_PER_SHARE_PRECISION).sub(user.rewardDebt[_token]);
    }

    /**
     * @notice Withdraw SPELL and harvest the rewards
     * @param _amount The amount of SPELL to withdraw
     */
    function withdraw(uint256 _amount) external {
        UserInfo storage user = userInfo[msg.sender];
        uint256 _previousAmount = user.amount;
        require(_amount <= _previousAmount, "mSpellStaking: withdraw amount exceeds balance");
        uint256 _newAmount = user.amount.sub(_amount);
        user.amount = _newAmount;

        uint256 _len = rewardTokens.length;
        if (_previousAmount != 0) {
            for (uint256 i; i < _len; i++) {
                IERC20 _token = rewardTokens[i];
                updateReward(_token);

                uint256 _pending = _previousAmount
                    .mul(accRewardPerShare[_token])
                    .div(ACC_REWARD_PER_SHARE_PRECISION)
                    .sub(user.rewardDebt[_token]);
                user.rewardDebt[_token] = _newAmount.mul(accRewardPerShare[_token]).div(ACC_REWARD_PER_SHARE_PRECISION);

                if (_pending != 0) {
                    safeTokenTransfer(_token, msg.sender, _pending);
                    emit ClaimReward(msg.sender, address(_token), _pending);
                }
            }
        }

        internalJoeBalance = internalJoeBalance.sub(_amount);
        spell.safeTransfer(msg.sender, _amount);
        emit Withdraw(msg.sender, _amount);
    }

    /**
     * @notice Withdraw without caring about rewards. EMERGENCY ONLY
     */
    function emergencyWithdraw() external {
        UserInfo storage user = userInfo[msg.sender];

        uint256 _amount = user.amount;
        user.amount = 0;
        uint256 _len = rewardTokens.length;
        for (uint256 i; i < _len; i++) {
            IERC20 _token = rewardTokens[i];
            user.rewardDebt[_token] = 0;
        }
        spell.safeTransfer(msg.sender, _amount);
        emit EmergencyWithdraw(msg.sender, _amount);
    }

    /**
     * @notice Update reward variables
     * @param _token The address of the reward token
     * @dev Needs to be called before any deposit or withdrawal
     */
    function updateReward(IERC20 _token) public {
        require(isRewardToken[_token], "mSpellStaking: wrong reward token");

        uint256 _rewardBalance = _token.balanceOf(address(this));
        uint256 _totalSpell = spell.balanceOf(address(this));

        // Did mSpellStaking receive any token
        if (_rewardBalance == lastRewardBalance[_token] || _totalSpell == 0) {
            return;
        }

        uint256 _accruedReward = _rewardBalance.sub(lastRewardBalance[_token]);

        accRewardPerShare[_token] = accRewardPerShare[_token].add(
            _accruedReward.mul(ACC_REWARD_PER_SHARE_PRECISION).div(_totalSpell)
        );
        lastRewardBalance[_token] = _rewardBalance;
    }

    /**
     * @notice Safe token transfer function, just in case if rounding error
     * causes pool to not have enough reward tokens
     * @param _token The address of then token to transfer
     * @param _to The address that will receive `_amount` `rewardToken`
     * @param _amount The amount to send to `_to`
     */
    function safeTokenTransfer(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) internal {
        uint256 _currRewardBalance = _token.balanceOf(address(this));
        uint256 _rewardBalance = _token == spell ? _currRewardBalance.sub(internalJoeBalance) : _currRewardBalance;

        if (_amount > _rewardBalance) {
            lastRewardBalance[_token] = lastRewardBalance[_token].sub(_rewardBalance);
            _token.safeTransfer(_to, _rewardBalance);
        } else {
            lastRewardBalance[_token] = lastRewardBalance[_token].sub(_amount);
            _token.safeTransfer(_to, _amount);
        }
    }
}
