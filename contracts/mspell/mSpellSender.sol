pragma solidity 0.8.10;
import "../libraries/BoringOwnable.sol";
import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";

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
    address private constant anyMIM = 0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5;
    AnyswapRouter private constant anyswapRouter = AnyswapRouter(0x6b7a87899490EcE95443e979cA9485CBE7E71522);

    struct mSpellRecipients {
        address recipient;
        uint256 chainId;
    }

    mSpellRecipients[] public recipients;
    mapping(uint256 => bool) public isActiveChain;
    mapping(address => bool) public isOperator;

    modifier onlyOperator() {
        require(isOperator[msg.sender]);
        _;
    }

    constructor(AnyswapRouter anyswapRouter_) {
        MIM.approve(anyMIM, type(uint256).max);
    }

    function bridgeMim(uint256[] memory ratios) public onlyOperator {
        require(ratios.length == recipients.length);
        uint256 summedRatio = 0;
        uint256 totalAmount = MIM.balanceOf(address(this));
        for (uint256 i = 0; i < ratios.length; i++) {
            summedRatio += ratios[i];
        }
        for (uint256 i = 0; i < ratios.length; i++) {
            uint256 amount = totalAmount / ratios[i];
            anyswapRouter.anySwapOutUnderlying(anyMIM, recipients[i].recipient, amount, recipients[i].chainId);
            emit LogBridgeToRecipient(recipients[i].recipient, amount, recipients[i].chainId);
        }
    }

    function addMSpellRecipient(address recipient, uint256 chainId) external onlyOwner {
        require(!isActiveChain[chainId]);
        isActiveChain[chainId] = true;
        recipients.push(mSpellRecipients(recipient, chainId));
        emit LogAddRecipient(recipient, chainId);
    }

    function setOperator(address operator, bool status) external onlyOwner {
        isOperator[operator] = status;
        emit LogSetOperator(operator, status);
    }
}
