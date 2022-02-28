// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "../interfaces/IERC20.sol";

// solhint-disable func-name-mixedcase
interface IFeeDistributor {
    function claim_many(address[20] calldata) external returns (bool);

    function last_token_time() external view returns (uint256);

    function time_cursor() external view returns (uint256);

    function time_cursor_of(address) external view returns (uint256);
}

interface Mintr {
    function mint(address) external;
}

interface ICurveVoter {
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bool, bytes memory);

    function increaseAmount(uint256) external;
}

library SafeExecute {
    function safeExecute(
        ICurveVoter curveVoter,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        (bool success, ) = curveVoter.execute(to, value, data);
        if (!success) assert(false);
    }
}

contract CRVLocker is Ownable {
    using Address for address;
    using SafeExecute for ICurveVoter;

    error NotAllowedVoter();
    error NotMagicCRV();

    address public constant GAUGE_CONTROLLER = 0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB;
    address public constant FEE_DISTRIBUTOR = 0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc;
    address public constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
    address public constant CRV3 = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

    ICurveVoter public immutable curveVoter;

    mapping(address => bool) public voters;

    uint256 public lastClaimTimestamp;
    address public magicCRV;

    modifier onlyAllowedVoters() {
        if (!voters[msg.sender]) {
            revert NotAllowedVoter();
        }
        _;
    }

    modifier onlyMagicCRV() {
        if (msg.sender != magicCRV) {
            revert NotMagicCRV();
        }
        _;
    }

    constructor(ICurveVoter _curveVoter) {
        curveVoter = _curveVoter;
    }

    function setMagicCRV(address _magicCRV) external onlyOwner {
        magicCRV = _magicCRV;
    }

    function setAllowedVoter(address _voter, bool allowed) external onlyOwner {
        voters[_voter] = allowed;
    }

    function lock() external {
        uint256 amount = IERC20(CRV).balanceOf(address(curveVoter));
        if (amount > 0) {
            curveVoter.increaseAmount(amount);
        }
    }

    function voteForGaugeWeights(address _gauge, uint256 _amount) public onlyAllowedVoters {
        curveVoter.safeExecute(
            GAUGE_CONTROLLER,
            0,
            abi.encodeWithSignature("vote_for_gauge_weights(address,uint256)", _gauge, _amount)
        );
    }

    function claim(address recipient) external onlyMagicCRV {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp < lastClaimTimestamp + 7 days) {
            return;
        }

        address p = address(curveVoter);
        IFeeDistributor(FEE_DISTRIBUTOR).claim_many([p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p]);
        lastClaimTimestamp = IFeeDistributor(FEE_DISTRIBUTOR).time_cursor_of(address(curveVoter));

        uint256 amount = IERC20(CRV3).balanceOf(address(curveVoter));
        if (amount > 0) {
            curveVoter.safeExecute(CRV3, 0, abi.encodeWithSignature("transfer(address,uint256)", recipient, amount));
        }
    }
}
