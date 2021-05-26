//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/Domain.sol";
import "@boringcrypto/boring-solidity/contracts/ERC20.sol";
import "@boringcrypto/boring-solidity/contracts/BoringBatchable.sol";


// Staking in sSpell inspired by Chef Nomi's SushiBar - MIT license (originally WTFPL)
// modified by BoringCrypto for DictatorDAO

contract sSpell is IERC20, Domain {
    using BoringMath for uint256;
    using BoringMath128 for uint128;
    using BoringERC20 for IERC20;

    string public constant symbol = "sSPELL";
    string public constant name = "Staked Spell Tokens";
    uint8 public constant decimals = 18;
    uint256 public override totalSupply;
    uint256 private constant LOCK_TIME = 24 hours;

    IERC20 public immutable token;

    constructor(IERC20 _token) public {
        token = _token;
    }

    struct User {
        uint128 balance;
        uint128 lockedUntil;
    }

    /// @notice owner > balance mapping.
    mapping(address => User) public users;
    /// @notice owner > spender > allowance mapping.
    mapping(address => mapping(address => uint256)) public override allowance;
    /// @notice owner > nonce mapping. Used in `permit`.
    mapping(address => uint256) public nonces;

    event Transfer(address indexed _from, address indexed _to, uint256 _value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);

    function balanceOf(address user) public view override returns (uint256 balance) {
        return users[user].balance;
    }

    function _transfer(
        address from,
        address to,
        uint256 shares
    ) internal {
        User memory fromUser = users[from];
        require(block.timestamp >= fromUser.lockedUntil, "Locked");
        if (shares != 0) {
            require(fromUser.balance >= shares, "Low balance");
            if (from != to) {
                require(to != address(0), "Zero address"); // Moved down so other failed calls safe some gas
                User memory toUser = users[to];
                users[from].balance = fromUser.balance - shares.to128(); // Underflow is checked
                users[to].balance = toUser.balance + shares.to128(); // Can't overflow because totalSupply would be greater than 2^128-1;
            }
        }
        emit Transfer(from, to, shares);
    }

    function _useAllowance(address from, uint256 shares) internal {
        if (msg.sender == from) {
            return;
        }
        uint256 spenderAllowance = allowance[from][msg.sender];
        // If allowance is infinite, don't decrease it to save on gas (breaks with EIP-20).
        if (spenderAllowance != type(uint256).max) {
            require(spenderAllowance >= shares, "Low allowance");
            allowance[from][msg.sender] = spenderAllowance - shares; // Underflow is checked
        }
    }

    /// @notice Transfers `shares` tokens from `msg.sender` to `to`.
    /// @param to The address to move the tokens.
    /// @param shares of the tokens to move.
    /// @return (bool) Returns True if succeeded.
    function transfer(address to, uint256 shares) public returns (bool) {
        _transfer(msg.sender, to, shares);
        return true;
    }

    /// @notice Transfers `shares` tokens from `from` to `to`. Caller needs approval for `from`.
    /// @param from Address to draw tokens from.
    /// @param to The address to move the tokens.
    /// @param shares The token shares to move.
    /// @return (bool) Returns True if succeeded.
    function transferFrom(
        address from,
        address to,
        uint256 shares
    ) public returns (bool) {
        _useAllowance(from, shares);
        _transfer(from, to, shares);
        return true;
    }

    /// @notice Approves `amount` from sender to be spend by `spender`.
    /// @param spender Address of the party that can draw from msg.sender's account.
    /// @param amount The maximum collective amount that `spender` can draw.
    /// @return (bool) Returns True if approved.
    function approve(address spender, uint256 amount) public override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparator();
    }

    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 private constant PERMIT_SIGNATURE_HASH = 0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

    /// @notice Approves `value` from `owner_` to be spend by `spender`.
    /// @param owner_ Address of the owner.
    /// @param spender The address of the spender that gets approved to draw from `owner_`.
    /// @param value The maximum collective amount that `spender` can draw.
    /// @param deadline This permit must be redeemed before this deadline (UTC timestamp in seconds).
    function permit(
        address owner_,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external override {
        require(owner_ != address(0), "Zero owner");
        require(block.timestamp < deadline, "Expired");
        require(
            ecrecover(_getDigest(keccak256(abi.encode(PERMIT_SIGNATURE_HASH, owner_, spender, value, nonces[owner_]++, deadline))), v, r, s) ==
                owner_,
            "Invalid Sig"
        );
        allowance[owner_][spender] = value;
        emit Approval(owner_, spender, value);
    }

    /// math is ok, because amount, totalSupply and shares is always 0 <= amount <= 100.000.000 * 10^18
    /// theoretically you can grow the amount/share ratio, but it's not practical and useless
    function mint(uint256 amount) public returns (bool) {
        require(msg.sender != address(0), "Zero address");
        User memory user = users[msg.sender];

        uint256 totalTokens = token.balanceOf(address(this));
        uint256 shares = totalSupply == 0 ? amount : (amount * totalSupply) / totalTokens;
        user.balance += shares.to128();
        user.lockedUntil = (block.timestamp + LOCK_TIME).to128();
        users[msg.sender] = user;
        totalSupply += shares;

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Transfer(address(0), msg.sender, shares);
        return true;
    }

    function _burn(
        address from,
        address to,
        uint256 shares
    ) internal {
        require(to != address(0), "Zero address");
        User memory user = users[from];
        require(block.timestamp >= user.lockedUntil, "Locked");
        uint256 amount = (shares * token.balanceOf(address(this))) / totalSupply;
        users[from].balance = user.balance.sub(shares.to128()); // Must check underflow
        totalSupply -= shares;

        token.safeTransfer(to, amount);

        emit Transfer(from, address(0), shares);
    }

    function burn(address to, uint256 shares) public returns (bool) {
        _burn(msg.sender, to, shares);
        return true;
    }

    function burnFrom(
        address from,
        address to,
        uint256 shares
    ) public returns (bool) {
        _useAllowance(from, shares);
        _burn(from, to, shares);
        return true;
    }
}