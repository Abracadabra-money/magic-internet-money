pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/interfaces/IERC20.sol";
import "../../contracts/interfaces/ISwapper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

contract WhitelistedSwapper is ISwapper {
    // Local variables
    IBentoBoxV1 public bentoBox;

    mapping(uint256 => mapping(uint256 => uint256)) public amountToTransfer;
    
	function swap(
        IERC20 fromToken, IERC20 toToken, address recipient, uint256 amountToMin, uint256 shareFrom
    ) public override returns (uint256 extraAmount, uint256 shareTo) { 
		shareTo = amountToTransfer[amountToMin][shareFrom];
        require(shareTo >= amountToMin && ( shareTo > 0 || shareFrom == 0 ));
        bentoBox.transfer(toToken, address(this), address(bentoBox), shareTo);
        extraAmount =  shareTo - amountToMin;
    }

	function swapExact(
        IERC20 fromToken, IERC20 toToken, address recipient, address refundTo, uint256 shareFromSupplied, uint256 shareToExact
    ) public override returns (uint256 shareUsed, uint256 shareReturned) {

	}

}
