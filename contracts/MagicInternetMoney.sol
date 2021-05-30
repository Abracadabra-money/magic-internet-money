// SPDX-License-Identifier: MIT

// Magic Internet Money

// ███╗   ███╗██╗███╗   ███╗
// ████╗ ████║██║████╗ ████║
// ██╔████╔██║██║██╔████╔██║
// ██║╚██╔╝██║██║██║╚██╔╝██║
// ██║ ╚═╝ ██║██║██║ ╚═╝ ██║
// ╚═╝     ╚═╝╚═╝╚═╝     ╚═╝

// BoringCrypto, 0xMerlin

pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/ERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

/// @title Cauldron
/// @dev This contract allows contract calls to any contract (except BentoBox)
/// from arbitrary callers thus, don't trust calls from this contract in any circumstances.
contract MagicInternetMoney is ERC20, BoringOwnable {
    using BoringMath for uint256;
    // ERC20 'variables'
    string public constant symbol = "MIM";
    string public constant name = "Magic Internet Money";
    uint8 public constant decimals = 18;
    uint256 public override totalSupply;

    struct Minting {
        uint128 time;
        uint128 totalSupply;
    }

    Minting public maxMint;
    uint256 private constant MINTING_PERIOD = 24 hours;
    uint256 private constant MINTING_INCREASE = 15000;
    uint256 private constant MINTING_PRECISION = 1e5;

    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "MIM: no mint to zero address");
        
        uint256 newTotalSupply = totalSupply.add(amount);
        require(totalSupply == 0 || newTotalSupply < maxMint.totalSupply, "MIM: mint too large");

        totalSupply = newTotalSupply;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);

        if (block.timestamp > maxMint.time) {
            maxMint.time = (block.timestamp.add(MINTING_PERIOD)).to128();
            maxMint.amount = (newTotalSupply.mul(MINTING_INCREASE) / MINTING_PRECISION).to128();
        }
    }

    function mintToBentoBox(address clone, uint256 amount, IBentoBoxV1 bentoBox) public onlyOwner {
        mint(address(bentoBox), amount);
        bentoBox.deposit(IERC20(address(this)), address(bentoBox), clone, amount, 0);
    }

    function burn(uint256 amount) public {
        require(amount <= balanceOf[msg.sender], "MIM: not enough");

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);

        uint256 newMax = totalSupply.mul(MINTING_INCREASE) / MINTING_PRECISION;
        if (newMax < maxMint.amount) {
            maxMint.time = block.timestamp.to128();
            maxMint.amount = newMax.to128();
        }
    }
}
