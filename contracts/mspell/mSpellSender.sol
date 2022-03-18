// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "../libraries/BoringOwnable.sol";

interface AnyswapRouter {
    function anySwapOutUnderlying(
        address token,
        address to,
        uint256 amount,
        uint256 toChainID
    ) external;
}

contract mSpellSender is BoringOwnable {
    using SafeTransferLib for ERC20;

    /// EVENTS
    event LogSetOperator(address indexed operator, bool status);
    event LogAddRecipient(address indexed recipient, uint256 chainId);
    event LogBridgeToRecipient(address indexed recipient, uint256 amount, uint256 chainId);

    /// CONSTANTS
    ERC20 private constant MIM = ERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    address private constant ANY_MIM = 0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5;
    AnyswapRouter private constant ANYSWAP_ROUTER = AnyswapRouter(0x6b7a87899490EcE95443e979cA9485CBE7E71522);

    struct MSpellRecipients {
        address recipient;
        uint256 chainId;
    }

    MSpellRecipients[] public recipients;
    mapping(uint256 => bool) public isActiveChain;
    mapping(address => bool) public isOperator;

    modifier onlyOperator() {
        require(isOperator[msg.sender], "only operator");
        _;
    }

    constructor() {
        MIM.approve(ANY_MIM, type(uint256).max);
    }

    /// @param ratios ratio in bps, 1 is 0.01%, 10_000 is 100%
    function bridgeMim(uint256[] memory ratios) external onlyOperator {
        require(ratios.length == recipients.length, "ratios length mismatch");

        uint256 summedRatio;
        uint256 totalAmount = MIM.balanceOf(address(this));

        for (uint256 i = 0; i < ratios.length; i++) {
            summedRatio += ratios[i];
        }

        for (uint256 i = 0; i < ratios.length; i++) {
            uint256 amount = (totalAmount * ratios[i]) / summedRatio;
            if (amount > 0) {
                if(recipients[i].chainId != 1) {
                    ANYSWAP_ROUTER.anySwapOutUnderlying(ANY_MIM, recipients[i].recipient, amount, recipients[i].chainId);
                } else {
                    MIM.transfer(recipients[i].recipient, amount);
                }
                emit LogBridgeToRecipient(recipients[i].recipient, amount, recipients[i].chainId);
            }
        }
    }

    function addMSpellRecipient(address recipient, uint256 chainId) external onlyOwner {
        require(!isActiveChain[chainId], "chainId already added");

        isActiveChain[chainId] = true;
        recipients.push(MSpellRecipients(recipient, chainId));
        emit LogAddRecipient(recipient, chainId);
    }

    function setOperator(address operator, bool status) external onlyOwner {
        isOperator[operator] = status;
        emit LogSetOperator(operator, status);
    }
}
