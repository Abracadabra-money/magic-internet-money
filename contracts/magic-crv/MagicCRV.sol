// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "@rari-capital/solmate/src/tokens/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ICollateralAmountAware.sol";
import "../interfaces/ICheckpointTokenV2.sol";

interface ICurveVoter {
    function lock() external;

    function claim(address recipient) external;
}

contract MagicCRV is ERC20, Ownable, ICheckpointTokenV2 {
    using SafeTransferLib for ERC20;

    error Shutdown();
    error CannotWithdraw();
    error DelegatorNotAllowed();
    error NotCauldron();
    error CauldronAlreadyAdded();

    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    ERC20 public constant CRV3 = ERC20(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);
    ICurveVoter public immutable curveVoter;

    mapping(address => uint256) public claimables;
    mapping(address => uint256) public rewardIndexes;
    mapping(address => bool) public knownCauldrons;
    address[] public cauldrons;

    /// @dev global reward states
    uint256 public rewardIndex;
    uint256 public crv3Balance;

    bool public shutdown;

    modifier notShutdown() {
        if (shutdown) {
            revert Shutdown();
        }
        _;
    }

    modifier onlyCauldrons() {
        if (!knownCauldrons[msg.sender]) {
            revert NotCauldron();
        }
        _;
    }

    constructor(ICurveVoter _curveVoter) ERC20("MagicCRV", "mCRV", 18) {
        curveVoter = _curveVoter;
    }

    function cauldronsLength() external view returns (uint256) {
        return cauldrons.length;
    }

    function addCauldron(address cauldron) external onlyOwner {
        if (knownCauldrons[cauldron]) {
            revert CauldronAlreadyAdded();
        }

        cauldrons.push(cauldron);
        knownCauldrons[cauldron] = true;
    }

    /// @notice emergency shutdown
    /// - blocks the users from claiming their rewards;
    /// - still allows the underlying 3crv reward harvesting process;
    /// - `withdraw` becomes available so the 3crv can still be rescued;
    function setShutdown(bool _shutdown) external onlyOwner {
        shutdown = _shutdown;
    }

    function update() external {
        _update();
    }

    function claim() external notShutdown {
        _claimFor(msg.sender);
    }

    function claimFor(address recipient) external notShutdown {
        _claimFor(recipient);
    }

    function deposit(uint256 _amount) external notShutdown {
        CRV.transferFrom(msg.sender, address(curveVoter), _amount);

        /// @dev the update must be done before minting to avoid
        /// the new deposit dilluting the previous depositor's rewards.
        _update();
        _updateFor(msg.sender);

        _mint(msg.sender, _amount);
        curveVoter.lock();
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _update();
        _updateFor(msg.sender);
        _updateFor(to);

        return super.transfer(to, amount);
    }

    /// @dev ERC20 `transferFrom` code is copied over because we should call the update
    /// routine after the allowance checks but before the balance update, otherwise
    /// the user would pay extra gas for the updates if the allowance isn't higher enough
    /// to satisfy `amount` transfer.
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        uint256 allowed = allowance[from][msg.sender]; // Saves gas for limited approvals.

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        _update();
        _updateFor(msg.sender);
        _updateFor(to);

        balanceOf[from] -= amount;

        // Cannot overflow because the sum of all user
        // balances can't exceed the max uint256 value.
        unchecked {
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);

        return true;
    }

    function onCheckpoint(address account) external override onlyCauldrons {
        _update();
        _updateFor(account);
    }

    function _update() internal {
        if (totalSupply > 0) {
            curveVoter.claim(address(this));

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
        uint256 balance = _getTotalBalance(recipient);
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

    function _claimFor(address recipient) internal {
        _update();
        _updateFor(recipient);

        uint256 claimable = claimables[recipient];
        claimables[recipient] = 0;
        crv3Balance -= claimable;
        CRV3.transfer(recipient, claimable);
    }

    function _getTotalBalance(address account) internal view returns (uint256) {
        uint256 total = balanceOf[account];

        for (uint256 i = 0; i < cauldrons.length; i++) {
            try ICollateralAmountAware(cauldrons[i]).userCollateralAmount(account) returns (uint256 amount) {
                total += amount;
            } catch {}
        }

        return total;
    }

    /// @notice emergency withdraw in case the contract is shutdown
    function withdraw(
        ERC20 token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (!shutdown) {
            revert CannotWithdraw();
        }

        token.safeTransfer(to, amount);
    }
}
