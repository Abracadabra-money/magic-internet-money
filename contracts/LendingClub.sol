// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;
import "./libraries/BoringOwnable.sol";
import "./interfaces/INFTPair.sol";
import "./interfaces/INFTOracle.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/ILendingClub.sol";
import "./interfaces/ISeaport.sol";
import "./interfaces/TokenLoanParamsWithOracle.sol";

interface IOps {
    function gelato() external view returns (address payable);

    function getFeeDetails() external view returns (uint256, address);
}

// Minimal implementation to set up some tests.
contract LendingClubWETH is BoringOwnable, ILendingClub {
    uint256 private constant BPS = 10_000;

    INFTPair private nftPair;
    INFTOracle private oracle;

    uint16 public annualInterestBPS;
    uint16 public relistBPS;
    uint16 public ltvBPS;
    uint32 public maxDuration;

    address private immutable ops;
    address payable private immutable gelato;
    IERC20 private immutable WETH;
    ISeaport private constant seaport =
        ISeaport(0x00000000006c3852cbEf3e08E8dF289169EdE581);

    constructor(address _ops, IERC20 _WETH) public {
        ops = _ops;
        WETH = _WETH;
        gelato = IOps(_ops).gelato();
    }

    modifier onlyOps() {
        require(msg.sender == ops, "OpsReady: onlyOps");
        _;
    }

    function _transfer(uint256 _amount) internal {
        (bool success, ) = gelato.call{value: _amount}("");
        require(success, "_transfer: ETH transfer failed");
    }

    function init(bytes calldata data) public payable {
        (
            nftPair,
            owner,
            oracle,
            annualInterestBPS,
            ltvBPS,
            relistBPS,
            maxDuration
        ) = abi.decode(
            data,
            (INFTPair, address, INFTOracle, uint16, uint16, uint16, uint32)
        );

        emit OwnershipTransferred(address(0), owner);

        require(nftPair.asset() == WETH, "only compatible with WETH");

        // TODO: check whether this is exploitable (i think not)
        nftPair.collateral().setApprovalForAll(address(seaport), true);

        nftPair.bentoBox().setMasterContractApproval(
            address(this),
            address(nftPair.masterContract()),
            true,
            0,
            bytes32(0),
            bytes32(0)
        );
    }

    function willLend(
        uint256 tokenId,
        uint128 valuation,
        uint64 duration,
        uint16 _annualInterestBPS,
        uint16 _ltvBPS,
        INFTOracle _oracle
    ) external override returns (bool) {
        if (msg.sender != address(nftPair)) {
            return false;
        }

        (bool status, uint256 price) = oracle.get(msg.sender, tokenId);

        if (!status) return false;

        uint256 _valuation = (price * uint256(ltvBPS)) / BPS;

        // valuation can be smaller than what is to be expected, same for duration

        return
            oracle == _oracle &&
            valuation <= _valuation &&
            duration <= maxDuration &&
            _annualInterestBPS >= annualInterestBPS;
    }

    function lendingConditions(address _nftPair, uint256 tokenId)
        external
        view
        returns (TokenLoanParamsWithOracle[] memory)
    {
        if (_nftPair != address(nftPair)) {
            TokenLoanParamsWithOracle[] memory empty;
            return empty;
        } else {
            TokenLoanParamsWithOracle[]
                memory conditions = new TokenLoanParamsWithOracle[](4);
            uint128 valuation = uint128(
                (oracle.peekSpot(_nftPair, tokenId) * uint256(ltvBPS)) / BPS
            );
            for (uint256 i; i < 4; i++) {
                conditions[i].valuation = valuation;
                conditions[i].duration = uint64((maxDuration * i) / 4);
                conditions[i].annualInterestBPS = annualInterestBPS;
                conditions[i].ltvBPS = ltvBPS;
                conditions[i].oracle = oracle;
            }
        }
    }

    function liquidateAndRelist(
        ISeaport.Order[] calldata orders,
        bool liquidate,
        uint256 tokenId
    ) external onlyOps {
        (uint256 fee, ) = IOps(ops).getFeeDetails();

        if (liquidate) {
            nftPair.removeCollateral(tokenId, address(this));
        }

        nftPair.bentoBox().withdraw(
            IERC20(address(0)),
            address(this),
            gelato,
            fee,
            0
        );

        seaport.validate(orders);
    }

    function seizeCollateral(uint256 tokenId, address to) external onlyOwner {
        nftPair.removeCollateral(tokenId, to);
    }

    function withdrawFunds(uint256 bentoShares, address to) external onlyOwner {
        nftPair.bentoBox().withdraw(
            nftPair.asset(),
            address(this),
            to,
            0,
            bentoShares
        );
    }
}
