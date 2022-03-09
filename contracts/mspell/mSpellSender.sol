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

contract MSpellSender is BoringOwnable {
    using SafeTransferLib for ERC20;

    /// EVENTS
    event LogSetOperator(address indexed operator, bool status);
    event LogAddRecipient(address indexed recipient, uint256 chainId);
    event LogBridgeToRecipient(address indexed recipient, uint256 amount, uint256 chainId);

    /// CONSTANTS
    ERC20 private constant MIM = ERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    address private constant ANY_MIM = 0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5;
    AnyswapRouter private constant ANYSWAP_ROUTER = AnyswapRouter(0x6b7a87899490EcE95443e979cA9485CBE7E71522);

    uint256 private constant BPS = 10_000;

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

        // fail fast if the ratio sums doesn't sum 100%
        // TODO: Do we really want this or allow certain ratio to be 0 and leave some MIM in the contract?
        // For example, sending 50% to avalanche, 20% to BSC, 0% to FTM, 0% to Arbitrum, and leave 30% MIM here
        for (uint256 i = 0; i < ratios.length; i++) {
            summedRatio += ratios[i];
        }
        require(summedRatio <= BPS, "ratios sum not 10000");

        for (uint256 i = 0; i < ratios.length; i++) {
            uint256 amount = (totalAmount * ratios[i]) / BPS;

            /// TODO: If we always want to bridge 100%, should we send the remaining amount when i == ratios.length - 1?
            /// To be sure there's no dust remaining, OCD style.
            if (amount > 0) {
                ANYSWAP_ROUTER.anySwapOutUnderlying(ANY_MIM, recipients[i].recipient, amount, recipients[i].chainId);
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
