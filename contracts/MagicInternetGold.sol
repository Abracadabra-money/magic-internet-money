// SPDX-License-Identifier: MIT

// Magic Internet Money

// ███╗   ███╗██╗ ██████╗ 
// ████╗ ████║██║██╔════╝ 
// ██╔████╔██║██║██║  ███╗
// ██║╚██╔╝██║██║██║   ██║
// ██║ ╚═╝ ██║██║╚██████╔╝
// ╚═╝     ╚═╝╚═╝ ╚═════╝ 
                       

// BoringCrypto, 0xMerlin

pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/ERC20.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

/// @title Magic Internet Gold
contract MagicInternetGold is ERC20, BoringOwnable {
    using BoringMath for uint256;
    // ERC20 'variables'
    string public constant symbol = "MIG";
    string public constant name = "Magic Internet Gold";
    uint8 public constant decimals = 18;
    uint256 public override totalSupply;

    struct Minting {
        uint128 time;
        uint128 amount;
    }

    Minting public lastMint;
    uint256 private constant MINTING_PERIOD = 24 hours;
    uint256 private constant MINTING_INCREASE = 15000;
    uint256 private constant MINTING_PRECISION = 1e5;

    // @notice mint MIG to an address
    // @param to - the recipient
    // @param amount - the amount minted
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "MIG: no mint to zero address");

        // Limits the amount minted per period to a convergence function, with the period duration restarting on every mint
        uint256 totalMintedAmount = uint256(lastMint.time < block.timestamp - MINTING_PERIOD ? 0 : lastMint.amount).add(amount);
        require(totalSupply == 0 || totalSupply.mul(MINTING_INCREASE) / MINTING_PRECISION >= totalMintedAmount);

        lastMint.time = block.timestamp.to128();
        lastMint.amount = totalMintedAmount.to128();

        totalSupply = totalSupply + amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    // @notice mint MIG to a recipient on BentoBox
    // @param clone - the recipient clone contract
    // @param amount - the amount minted
    // @param bentoBox - the address of the BentoBox / DegenBox selected
    function mintToBentoBox(address clone, uint256 amount, IBentoBoxV1 bentoBox) public onlyOwner {
        mint(address(bentoBox), amount);
        bentoBox.deposit(IERC20(address(this)), address(bentoBox), clone, amount, 0);
    }

    // @notice burn MIG from caller
    // @param amount - the amount burnt
    function burn(uint256 amount) public {
        require(amount <= balanceOf[msg.sender], "MIM: not enough");

        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}
