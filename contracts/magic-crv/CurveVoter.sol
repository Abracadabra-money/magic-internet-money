// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/curve/IFeeDistributor.sol";
import "../interfaces/curve/IVoteEscrow.sol";
import "../interfaces/curve/IGaugeController.sol";

contract CurveVoter is Ownable {
    using SafeTransferLib for ERC20;

    error NotAllowedVoter();
    error NotMagicCRV();
    error NotAuthorized();

    uint256 public constant MAX_LOCKTIME = 4 * 365 * 86400; // 4 years

    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address public constant ESCROW = 0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2;
    address public constant GAUGE_CONTROLLER = 0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB;
    address public constant FEE_DISTRIBUTOR = 0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc;
    address public constant CRV3 = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;
    address public constant MIM_GAUGE = 0xd8b712d29381748dB89c36BCa0138d7c75866ddF;
    uint256 public constant MAX_VOTE_WEIGHT = 10_000;

    mapping(address => bool) public voters;

    uint256 public lastClaimTimestamp;
    address public magicCRV;

    modifier onlyAllowedVoters() {
        if (!voters[msg.sender]) {
            revert NotAllowedVoter();
        }
        _;
    }

    modifier onlyMagicCRV() {
        if (msg.sender != magicCRV) {
            revert NotMagicCRV();
        }
        _;
    }

    modifier onlyMagicCRVOrOwner() {
        if (msg.sender != magicCRV && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    constructor() {}

    function setAllowedVoter(address _voter, bool allowed) external onlyOwner {
        voters[_voter] = allowed;
    }

    function setMagicCRV(address _magicCRV) external onlyOwner {
        magicCRV = _magicCRV;
    }

    /// @notice amount 10000 = 100%
    function voteForGaugeWeights(address gauge, uint256 amount) public onlyAllowedVoters {
        IGaugeController(GAUGE_CONTROLLER).vote_for_gauge_weights(gauge, amount);
    }

    function voteForMaxMIMGaugeWeights() public onlyAllowedVoters {
        IGaugeController(GAUGE_CONTROLLER).vote_for_gauge_weights(MIM_GAUGE, MAX_VOTE_WEIGHT);
    }
    
    function claim(address recipient) external onlyMagicCRV {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp < lastClaimTimestamp + 7 days) {
            return;
        }

        address p = address(this);

        // curve claims are divided by weeks and each iterate can claim up to 20 weeks of rewards.
        IFeeDistributor(FEE_DISTRIBUTOR).claim_many([p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p]);
        lastClaimTimestamp = IFeeDistributor(FEE_DISTRIBUTOR).time_cursor_of(p);

        uint256 amount = ERC20(CRV3).balanceOf(address(this));
        if (amount > 0) {
            ERC20(CRV3).transfer(recipient, amount);
        }
    }

    /// @notice add amount to the current lock created with `createLock` or `createMaxLock`
    function lock() external onlyMagicCRVOrOwner {
        uint256 amount = ERC20(CRV).balanceOf(address(this));
        if (amount > 0) {
            CRV.safeApprove(ESCROW, 0);
            CRV.safeApprove(ESCROW, amount);
            IVoteEscrow(ESCROW).increase_amount(amount);
        }
    }

    /// @notice creates a 4 years lock
    function createMaxLock(uint256 value) external onlyOwner {
        CRV.safeApprove(ESCROW, 0);
        CRV.safeApprove(ESCROW, value);

        // solhint-disable-next-line not-rely-on-time
        IVoteEscrow(ESCROW).create_lock(value, block.timestamp + MAX_LOCKTIME);
    }

    /// @notice creates an arbitrary lock
    function createLock(uint256 value, uint256 unlockTime) external onlyOwner {
        CRV.safeApprove(ESCROW, 0);
        CRV.safeApprove(ESCROW, value);
        IVoteEscrow(ESCROW).create_lock(value, unlockTime);
    }

    function release() external onlyOwner {
        IVoteEscrow(ESCROW).withdraw();
    }

    function withdraw(
        ERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}
