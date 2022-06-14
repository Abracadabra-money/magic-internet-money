// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@rari-capital/solmate/src/utils/SafeTransferLib.sol";
import "../libraries/BoringOwnable.sol";
// Thank you Bokky
import "../libraries/BokkyPooBahsDateTimeLibrary.sol";

interface AnyswapRouter {
    function anySwapOutUnderlying(
        address token,
        address to,
        uint256 amount,
        uint256 toChainID
    ) external;
}

interface ILayerZeroReceiver {
    // @notice LayerZero endpoint will invoke this function to deliver the message on the destination
    // @param _srcChainId - the source endpoint identifier
    // @param _srcAddress - the source sending contract address from the source chain
    // @param _nonce - the ordered message nonce
    // @param _payload - the signed payload is the UA bytes has encoded to be sent
    function lzReceive(uint16 _srcChainId, bytes calldata _srcAddress, uint64 _nonce, bytes calldata _payload) external;
}

interface IWithdrawer {
    function rescueTokens(
        ERC20 token,
        address to,
        uint256 amount
    ) external ;
    function transferOwnership(
        address newOwner,
        bool direct,
        bool renounce
    ) external;
}

interface IMSpell {
    function updateReward() external;
}
contract mSpellSender is BoringOwnable, ILayerZeroReceiver {
    using SafeTransferLib for ERC20;

    /// EVENTS
    event LogSetOperator(address indexed operator, bool status);
    event LogAddRecipient(address indexed recipient, uint256 chainId, uint256 chainIdLZ);
    event LogBridgeToRecipient(address indexed recipient, uint256 amount, uint256 chainId);
    event LogSpellStakedReceived(uint16 srcChainId, address indexed fromAddress, uint32 timestamp, uint128 amount);
    event LogSetReporter(uint256 chainIdLZ, address indexed reporter);
    event LogChangePurchaser(address _purchaser, address _treasury, uint _treasuryPercentage);

    /// CONSTANTS
    ERC20 private constant MIM = ERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    ERC20 private constant SPELL = ERC20(0x090185f2135308BaD17527004364eBcC2D37e5F6);
    address private constant SSPELL = 0x26FA3fFFB6EfE8c1E69103aCb4044C26B9A106a9;
    address private constant ANY_MIM = 0xbbc4A8d076F4B1888fec42581B6fc58d242CF2D5;
    AnyswapRouter private constant ANYSWAP_ROUTER = AnyswapRouter(0x6b7a87899490EcE95443e979cA9485CBE7E71522);
    address private constant ENDPOINT = 0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675;

    IWithdrawer private constant withdrawer = IWithdrawer(0xB2c3A9c577068479B1E5119f6B7da98d25Ba48f4);
    address public sspellBuyBack = 0xfddfE525054efaAD204600d00CA86ADb1Cc2ea8a;
    address public treasury = 0xDF2C270f610Dc35d8fFDA5B453E74db5471E126B;
    uint public treasuryPercentage = 25;
    uint private constant PRECISION = 100;

    struct MSpellRecipients {
        address recipient;
        uint32 chainId;
        uint32 chainIdLZ;
        uint32 lastUpdated;
        uint128 amountStaked;
    }

    struct ActiveChain {
        uint8 isActive;
        uint32 position;
    }

    MSpellRecipients[] public recipients;
    mapping(uint256 => ActiveChain) public isActiveChain;
    mapping(uint256 => address) public mSpellReporter;
    mapping(address => bool) public isOperator;

    error NotNoon();
    error NotPastNoon();
    error NotUpdated(uint256);

    modifier onlyOperator() {
        require(isOperator[msg.sender], "only operator");
        _;
    }

    modifier onlyNoon {
        uint256 hour = block.timestamp / 1 hours % 24;
        if (hour != 12) {
            revert NotNoon();
        }
        _;
    }

    modifier onlyPastNoon {
        uint256 hour = block.timestamp / 1 hours % 24;
        if (hour != 13) {
            revert NotPastNoon();
        }
        _;
    }

    constructor() {
        MIM.approve(address(ANYSWAP_ROUTER), type(uint256).max);
    }

    function bridgeMim() external onlyPastNoon {
        uint256 summedRatio;
        uint256 totalAmount = MIM.balanceOf(address(withdrawer));
        uint256 amountToBeDistributed = totalAmount - totalAmount * treasuryPercentage / PRECISION;

        withdrawer.rescueTokens(MIM, address(this), amountToBeDistributed);
        withdrawer.rescueTokens(MIM, treasury, totalAmount * treasuryPercentage / PRECISION);

        uint256 currentDay = BokkyPooBahsDateTimeLibrary.getDay(block.timestamp);
        uint256 sspellAmount = SPELL.balanceOf(SSPELL);
        uint256 mspellAmount;
        uint256 length = recipients.length;
        for (uint256 i = 0; i < length; i++) {
            if(recipients[i].chainId != 1) {
                summedRatio += recipients[i].amountStaked;
                if(BokkyPooBahsDateTimeLibrary.getDay(uint256(recipients[i].lastUpdated)) != currentDay) {
                    revert NotUpdated(recipients[i].chainId);
                }
            } else {
                mspellAmount = SPELL.balanceOf(recipients[i].recipient);
                summedRatio += mspellAmount + sspellAmount;
            }
        }

        for (uint256 i = 0; i < length; i++) {
            if (recipients[i].chainId != 1) {
                uint256 amount = (amountToBeDistributed * recipients[i].amountStaked) / summedRatio;
                if (amount > 0 ) {
                    ANYSWAP_ROUTER.anySwapOutUnderlying(ANY_MIM, recipients[i].recipient, amount, recipients[i].chainId);
                    emit LogBridgeToRecipient(recipients[i].recipient, amount, recipients[i].chainId);
                }
            } else {
                uint256 amountMSpell = (amountToBeDistributed * mspellAmount) / summedRatio;
                uint256 amountsSpell = (amountToBeDistributed * sspellAmount) / summedRatio;

                MIM.transfer(recipients[i].recipient, amountMSpell);
                IMSpell(recipients[i].recipient).updateReward();
                MIM.transfer(sspellBuyBack, amountsSpell);
            }
        }
    }

    function lzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64, bytes calldata _payload) external onlyNoon {
        require(msg.sender == ENDPOINT);
        uint position = isActiveChain[uint256(_srcChainId)].position;
        MSpellRecipients storage recipient = recipients[position];
        address fromAddress;
        assembly {
            fromAddress := mload(add(_srcAddress, 20))
        }
        require(fromAddress == mSpellReporter[uint256(_srcChainId)]);
        (uint32 timestamp, uint128 amount) = abi.decode(_payload, (uint32, uint128));
        recipient.amountStaked = amount;
        recipient.lastUpdated = timestamp;
        emit LogSpellStakedReceived(_srcChainId, fromAddress, timestamp, amount);
    }

    function addMSpellRecipient(address recipient, uint256 chainId, uint256 chainIdLZ) external onlyOwner {
        require(isActiveChain[chainIdLZ].isActive == 0, "chainId already added");
        uint256 position = recipients.length; 
        isActiveChain[chainIdLZ] = ActiveChain(1, uint32(position));
        recipients.push(MSpellRecipients(recipient, uint32(chainId), uint32(chainIdLZ), 0, 0));
        emit LogAddRecipient(recipient, chainId, chainIdLZ);
    }

    function setOperator(address operator, bool status) external onlyOwner {
        isOperator[operator] = status;
        emit LogSetOperator(operator, status);
    }

    function addReporter(address reporter, uint256 chainIdLZ) external onlyOwner {
        mSpellReporter[chainIdLZ] = reporter;
        emit LogSetReporter(chainIdLZ, reporter);
    }

    function transferWithdrawer(address newOwner) external onlyOwner {
        withdrawer.transferOwnership(newOwner, true, false);
    }

    function changePurchaser(address _purchaser, address _treasury, uint _treasuryPercentage) external onlyOwner {
        sspellBuyBack = _purchaser;
        treasury = _treasury;
        treasuryPercentage = _treasuryPercentage;
        emit LogChangePurchaser( _purchaser,  _treasury,  _treasuryPercentage);
    }
}
