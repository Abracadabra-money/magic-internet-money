// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

interface IERC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address from, address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IBentoBoxV1 {
    function balanceOf(IERC20, address) external view returns (uint256);
    function toAmount(IERC20 token, uint256 share, bool roundUp) external view returns (uint256 amount);
    function withdraw(IERC20 token_, address from, address to, uint256 amount, uint256 share) external returns (uint256 amountOut, uint256 shareOut);
    function deposit(IERC20 token_, address from, address to, uint256 amount, uint256 share) external payable returns (uint256 amountOut, uint256 shareOut);
}

contract wMemoMergeSwapper {
    uint256 private constant rate = 4900000;

    IBentoBoxV1 public constant bentoBox = IBentoBoxV1(0xf4F46382C2bE1603Dc817551Ff9A7b333Ed1D18f);
    IERC20 public constant WMEMO = IERC20(0x0da67235dD5787D67955420C84ca1cEcd4E5Bb3b);
    IERC20 public constant SPELL = IERC20(0xCE1bFFBD5374Dac86a2893119683F4911a2F7814);
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function swap(
        address recipient, 
        uint256 amountIn
        ) external {

        WMEMO.transferFrom(msg.sender, DEAD, amountIn);

        uint256 amountOut = amountIn * rate;

        SPELL.transfer(recipient, amountOut);

    }

    function swapFromBento (
        address recipient,
        uint256 shareFrom
    ) public returns (uint256 shareReturned) {
        
        (uint256 amountWMemoFrom, ) = bentoBox.withdraw(WMEMO, address(this), DEAD, 0, shareFrom);

        uint256 amountTo = amountWMemoFrom * rate;

        (, shareReturned) = bentoBox.deposit(SPELL, address(bentoBox), recipient, amountTo, 0);

    }
}