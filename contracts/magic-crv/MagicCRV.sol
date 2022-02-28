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
    ERC20 public constant CRV3 = ERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);

    ICRVLocker public immutable crvLocker;
    address public immutable curveMCRVVoter;

    mapping(address => uint256) public claimables;
    mapping(address => uint256) public rewardIndexes;

    uint256 public rewardIndex = 0;
    uint256 public crv3Balance = 0;

    constructor(address _curveMCRVVoter, ICRVLocker _crvLocker) ERC20("MagicCRV", "mCRV", 18) {
        curveMCRVVoter = _curveMCRVVoter;
        crvLocker = _crvLocker;
    }

    function update() external {
        _update();
    }

    function claim() external {
        _claimFor(msg.sender);
    }

    function claimFor(address recipient) external {
        _claimFor(recipient);
    }

    function deposit(uint256 _amount) external {
        CRV.transferFrom(msg.sender, curveMCRVVoter, _amount);

        /// @dev the update must be done before minting to avoid
        /// the new deposit dilluting the previous depositor's rewards.
        _updateFor(msg.sender);

        _mint(msg.sender, _amount);
        crvLocker.lockCRV();
    }

    function _update() internal {
        if (totalSupply > 0) {
            _claimCurveRewards();

            uint256 currentCrv3Balance = CRV3.balanceOf(address(this));
            if (currentCrv3Balance > crv3Balance) {
                uint256 balanceDiff = currentCrv3Balance - crv3Balance;
                if (balanceDiff > 0) {
                    // Update the reward index based on the ratio between
                    // the new 3crv rewards and the current magicCRV total supply.
                    uint256 ratio = (balanceDiff * 1e18) / totalSupply;
                    if (ratio > 0) {
                        rewardIndex += ratio;
                        crv3Balance = currentCrv3Balance;
                    }
                }
            }
        }
    }

    function _updateFor(address recipient) internal {
        _update();
        uint256 balance = balanceOf[recipient];
        if (balance > 0) {
            uint256 currentIndex = rewardIndexes[recipient];

            // update user reward index to the latest
            rewardIndexes[recipient] = rewardIndex;

            // update the user claimable amount based on the
            // different between the latest recorded index and
            // the current one.
            uint256 deltaIndex = rewardIndex - currentIndex;
            if (deltaIndex > 0) {
                // increase the claimable share amount based
                // on the delta reward index and the magicCRV balance.
                claimables[recipient] += (balance * deltaIndex) / 1e18;
            }
        } else {
            rewardIndexes[recipient] = rewardIndex;
        }
    }

    function _claimCurveRewards() internal {
        crvLocker.claim(address(this));
    }

    function _claimFor(address recipient) internal {
        _updateFor(recipient);

        uint256 claimable = claimables[recipient];
        claimables[recipient] = 0;

        /// @dev crv3Balance is updated by _updateFor
        /// and claimable should never be greater than
        /// crv3Balance.
        crv3Balance -= claimable;

        CRV3.transfer(recipient, claimable);
    }
}
