pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/interfaces/IERC20.sol";
import "../../contracts/interfaces/ISwapper.sol";
import "@sushiswap/bentobox-sdk/contracts/IBentoBoxV1.sol";

contract Swapper is ISwapper {
    // Local variables
    IBentoBoxV1 public bentoBox;

	IERC20 public generalToken;
    address public generalTo; 
    address public generalRecipient;

    mapping(uint256 => mapping(uint256 => uint256)) public amountToTransfer;
    
	function swap(
        IERC20 fromToken, IERC20 toToken, address recipient, uint256 amountToMin, uint256 shareFrom
    ) public override returns (uint256 extraAmount, uint256 shareTo) { 

    }

	function swapExact(
        IERC20 fromToken, IERC20 toToken, address recipient, address refundTo, uint256 shareFromSupplied, uint256 shareToExact
    ) public override returns (uint256 shareUsed, uint256 shareReturned) {

	}

}
