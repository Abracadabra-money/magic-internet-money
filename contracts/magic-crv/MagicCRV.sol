// SPDX-License-Identifier: AGPL-3.0-only
// Inspired by Yearn yveCRV-DAO and xSushi
pragma solidity ^0.8.10;

import "@rari-capital/solmate/src/tokens/ERC20.sol";

interface ICurveVoter {
    function lock() external;
    function totalCRVTokens() external returns(uint256);
}

contract MagicCRV is ERC20 {
    ERC20 public constant CRV = ERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);
    ICurveVoter public immutable curveVoter;

    constructor(ICurveVoter _curveVoter) ERC20("MagicCRV", "mCRV", 18) {
        curveVoter = _curveVoter;
    }

    function mint(uint256 amount) external {
        CRV.transferFrom(msg.sender, address(curveVoter), amount);

        uint256 share = totalSupply == 0 ? amount : (amount * totalSupply) / curveVoter.totalCRVTokens();

        _mint(msg.sender, share);
        curveVoter.lock();
    }
}
