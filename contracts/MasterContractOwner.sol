pragma solidity 0.8.10;
import "./libraries/BoringOwnable.sol";

interface IBentoBox {
    function toAmount(address token, uint256 share, bool roundUp) external view returns (uint256 amount);
    function toShare(address token, uint256 amount, bool roundUp) external view returns (uint256 share);
    function balanceOf(address token, address owner) external view returns (uint256 share);
}

interface IMasterContract {
    function setFeeTo (address newFee) external;
    function reduceSupply (uint256 amount) external;
    function transferOwnership(address newOwner, bool direct, bool renounce) external;
    function bentoBox() external returns (IBentoBox);
} 

contract MasterContractOwner is BoringOwnable {
    event LogDepreciated(IMasterContract indexed cauldron);
    mapping (IMasterContract => bool) public isDepreciated;

    address public constant MIM = 0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3;

    function transferOwnershipOfMasterContract (IMasterContract mastercontract, address newOwner) external onlyOwner {
        mastercontract.transferOwnership(newOwner, true, false);
    }

    function setFeeTo (IMasterContract mastercontract, address feeTo) external onlyOwner {
        mastercontract.setFeeTo(feeTo);
    }

    function depreciate (IMasterContract cauldron, bool status) external onlyOwner {
        isDepreciated[cauldron] = status;
        emit LogDepreciated(cauldron);
    }

    function reduceCompletely(IMasterContract cauldron) external {
        require(isDepreciated[cauldron]);
        IBentoBox bentoBox = cauldron.bentoBox();
        uint256 amount = bentoBox.toAmount(MIM, bentoBox.balanceOf(MIM, address(cauldron)), false);
        cauldron.reduceSupply(amount);
    }

    function reduceSupply(IMasterContract cauldron, uint256 amount) external onlyOwner {
        cauldron.reduceSupply(amount);
    }
}