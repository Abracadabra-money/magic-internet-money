// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface ICRVLocker {
    function lockCRV() external;
    function claim(address) external;
}

contract MagicCRV is ERC20, Ownable {
    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    ICRVLocker public immutable crvLocker;
    address public immutable curveMCRVVoter;
    
    constructor(address _curveMCRVVoter, ICRVLocker _crvLocker) ERC20("MagicCRV", "mCRV", 18) {
        curveMCRVVoter = _curveMCRVVoter;
        crvLocker = _crvLocker;
    }

    function update() external {
        _update();
    }

    function _update() internal {
        crvLocker.claim(address(this));
    }

    function deposit(uint256 _amount) external {
        CRV.transferFrom(msg.sender, curveMCRVVoter, _amount);
        _update();
        _mint(msg.sender, _amount);
        crvLocker.lockCRV();
    }
}
