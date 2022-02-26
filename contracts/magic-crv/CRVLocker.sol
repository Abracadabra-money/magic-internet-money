// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface Gauge {
    function deposit(uint256) external;

    function balanceOf(address) external view returns (uint256);

    function withdraw(uint256) external;

    function claim_rewards(address) external;

    function rewarded_token() external returns (address);

    function reward_tokens(uint256) external returns (address);
}

interface IVECRVFeeDistributor {
    function claim_many(address[20] calldata) external returns (bool);

    function last_token_time() external view returns (uint256);

    function time_cursor() external view returns (uint256);

    function time_cursor_of(address) external view returns (uint256);
}

interface Mintr {
    function mint(address) external;
}

interface ICurveMCRVVoter {
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bool, bytes memory);

    function increaseAmount(uint256) external;
}

library SafeExecute {
    function safeExecute(
        ICurveMCRVVoter curveMRVVoter,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        (bool success, ) = curveMRVVoter.execute(to, value, data);
        if (!success) assert(false);
    }
}

contract CRVLocker is Ownable {
    using Address for address;
    using SafeExecute for ICurveMCRVVoter;

    error NotAllowedVoter();
    error NotMagicCRV();

    address public constant CURVE_GAUGE_CONTROLLER = 0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB;
    address public constant CURVE_VE_CRV_FEE_DISTRIBUTOR = 0xA464e6DCda8AC41e03616F95f4BC98a13b8922Dc;
    address public constant CRV3 = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;
    address public constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;

    ICurveMCRVVoter public immutable curveMCRVVoter;

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

    constructor(ICurveMCRVVoter _curveMCRVVoter) {
        curveMCRVVoter = _curveMCRVVoter;
    }

    function setMagicCRV(address _magicCRV) external onlyOwner {
        magicCRV = _magicCRV;
    }

    function setAllowedVoter(address _voter, bool allowed) external onlyOwner {
        voters[_voter] = allowed;
    }

    function lockCRV() external {
        uint256 amount = IERC20(CRV).balanceOf(address(curveMCRVVoter));
        if (amount > 0) {
            curveMCRVVoter.increaseAmount(amount);
        }
    }

    function voteForGaugeWeights(address _gauge, uint256 _amount) public onlyAllowedVoters {
        curveMCRVVoter.safeExecute(
            CURVE_GAUGE_CONTROLLER,
            0,
            abi.encodeWithSignature("vote_for_gauge_weights(address,uint256)", _gauge, _amount)
        );
    }

    function claim() external onlyMagicCRV {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp < lastClaimTimestamp + 7 days) {
            return;
        }

        address p = address(curveMCRVVoter);
        IVECRVFeeDistributor(CURVE_VE_CRV_FEE_DISTRIBUTOR).claim_many([p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p, p]);
        lastClaimTimestamp = IVECRVFeeDistributor(CURVE_VE_CRV_FEE_DISTRIBUTOR).time_cursor_of(address(curveMCRVVoter));
    }

    // IVECRVFeeDistributor claim_many can claim more than CRV3, should we change claim_many to claim only with explcitly 3crv or 
    // add parameters to harvest to harvest one or many tokens and delegate it to a swapper?
    function harvest() external onlyOwner {
        uint256 amount = IERC20(CRV3).balanceOf(address(curveMCRVVoter));
        if (amount > 0) {
            // Should this be transfered to a Swappet proxy and delegate the swapping to it?
            curveMCRVVoter.safeExecute(CRV3, 0, abi.encodeWithSignature("transfer(address,uint256)", address(this), amount));

            // TODO:
            // swap 3CRV to CRV
            // call lockCRV
            // Should onlyOwner be replaced with onlyHarvesters?
        }
    }
}
