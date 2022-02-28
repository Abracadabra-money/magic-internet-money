// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// solhint-disable func-name-mixedcase
interface VoteEscrow {
    function create_lock(uint256, uint256) external;

    function increase_amount(uint256) external;

    function withdraw() external;
}

contract CurveVoter is Ownable {
    using SafeTransferLib for ERC20;

    error NotAuthorized();

    uint256 constant private MAXTIME  = 4 * 365 * 86400; // 4 years
    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    address public constant ESCROW = 0x5f3b5DfEb7B28CDbD7FAba78963EE202a494e2A2;

    address public crvLocker;

    modifier onlyCRVLockerOrOwner() {
        if (msg.sender != crvLocker && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }

    constructor() {}

    function setCRVLocker(address _crvLocker) external onlyOwner {
        crvLocker = _crvLocker;
    }

    function withdraw(
        ERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    /// @notice creates a 4 years lock
    function createMaxLock(uint256 _value) external onlyCRVLockerOrOwner {
        CRV.safeApprove(ESCROW, 0);
        CRV.safeApprove(ESCROW, _value);

        // solhint-disable-next-line not-rely-on-time
        VoteEscrow(ESCROW).create_lock(_value, block.timestamp + MAXTIME);
    }

    /// @notice creates an arbitrary lock
    function createLock(uint256 _value, uint256 _unlockTime) external onlyCRVLockerOrOwner {
        CRV.safeApprove(ESCROW, 0);
        CRV.safeApprove(ESCROW, _value);
        VoteEscrow(ESCROW).create_lock(_value, _unlockTime);
    }

    /// @notice add amount to the current lock created with `createLock` or `createMaxLock`
    function increaseAmount(uint256 _value) external onlyCRVLockerOrOwner {
        CRV.safeApprove(ESCROW, 0);
        CRV.safeApprove(ESCROW, _value);
        VoteEscrow(ESCROW).increase_amount(_value);
    }

    function release() external onlyCRVLockerOrOwner {
        VoteEscrow(ESCROW).withdraw();
    }

    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyCRVLockerOrOwner returns (bool, bytes memory) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory result) = to.call{value: value}(data);

        return (success, result);
    }
}
