// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// solhint-disable func-name-mixedcase
interface Gauge {
    function deposit(uint256) external;

    function balanceOf(address) external view returns (uint256);

    function withdraw(uint256) external;
}

interface VoteEscrow {
    function create_lock(uint256, uint256) external;

    function increase_amount(uint256) external;

    function withdraw() external;
}

/// @dev fork of yearn CurveYCRVVoter ported to solidity 0.8
contract CurveMCRVVoter is Ownable {
    using SafeERC20 for IERC20;
    using Address for address;

    error NotAuthorized();

    IERC20 public constant CRV = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
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

    function createLock(uint256 _value, uint256 _unlockTime) external onlyCRVLockerOrOwner {
        IERC20(CRV).safeApprove(ESCROW, 0);
        IERC20(CRV).safeApprove(ESCROW, _value);
        VoteEscrow(ESCROW).create_lock(_value, _unlockTime);
    }

    function increaseAmount(uint256 _value) external onlyCRVLockerOrOwner {
        IERC20(CRV).safeApprove(ESCROW, 0);
        IERC20(CRV).safeApprove(ESCROW, _value);
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
