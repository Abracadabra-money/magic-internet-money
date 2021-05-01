pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../contracts/flat/KashiPairFlat.sol";

// WARNING: DO NOT EDIT - it's just a copy for running of the flat file 
contract KashiPairHarnessFlat is KashiPairMediumRiskV1 {
	constructor() KashiPairMediumRiskV1(IBentoBoxV1(0)) public { }

	// for invariants we need a function that simulate the constructor 
	function init_state() public { }

	// getters for internals
	function totalAssetElastic() public returns (uint256) {
		return totalAsset.elastic;
	}

	// totalAssetBase() is already defined in KashiPair.sol with the name totalSupply

	function totalBorrowElastic() public returns (uint256) {
		return totalBorrow.elastic;
	}

	function totalBorrowBase() public returns (uint256) {
		return totalBorrow.base;
	}

    function borrowToElastic(uint256 part) public returns (uint256)  {
        return totalBorrow.toElastic(part, true);
    }

	function accrue() override public { }

	function cook(uint8[] calldata actions, uint256[] calldata values,
				  bytes[] calldata datas) external override payable
				  					  returns (uint256 value1, uint256 value2) {
	}

	function feesEarnedFraction() public returns (uint128) {
		return accrueInfo.feesEarnedFraction;
	}

    mapping(address => bool) public closeSolvent;
	mapping(address => bool) public openSolvent;

	function _isSolvent(address user, bool open, uint256 _exchangeRate) internal override view returns (bool) {
        if (closeSolvent[user]) {
			return true;
		}
		
		return open && openSolvent[user];
    }

    function origIsSolvent(address user, bool open, uint256 _exchangeRate) public view returns (bool) {
        super._isSolvent(user, open, _exchangeRate);
    }

	function accrueInterest() public returns (uint256 fullAssetAmount, uint256 feeAmount, uint256 utilization) {
        AccrueInfo memory _accrueInfo = accrueInfo;

        /*
         * Added a require only for rules checking
         * Commenting because return is not valid since the function returns a 
         * uint256 (only for checking rules)
         **/
        // Number of seconds since accrue was called
        uint256 elapsedTime = block.timestamp - _accrueInfo.lastAccrued;

        require(elapsedTime != 0);

        // if (elapsedTime == 0) {
        //     return;
        // }
        
        _accrueInfo.lastAccrued = uint64(block.timestamp);

        Rebase memory _totalBorrow = totalBorrow;

        /*
         * Commenting because return is not valid since the function returns a 
         * uint256 (only for checking rules)
         **/
        // if (_totalBorrow.base == 0) {
        //     // If there are no borrows, reset the interest rate
        //     if (_accrueInfo.interestPerSecond != STARTING_INTEREST_PER_SECOND) {
        //         _accrueInfo.interestPerSecond = STARTING_INTEREST_PER_SECOND;
        //         emit LogAccrue(0, 0, STARTING_INTEREST_PER_SECOND, 0);
        //     }
        //     accrueInfo = _accrueInfo;
        //     return;
        // }

        uint256 extraAmount = 0;
        uint256 feeFraction = 0;
        Rebase memory _totalAsset = totalAsset;
        
        // Accrue interest
        extraAmount = uint256(_totalBorrow.elastic).mul(_accrueInfo.interestPerSecond).mul(elapsedTime) / 1e18;
        _totalBorrow.elastic = _totalBorrow.elastic.add(extraAmount.to128());
        uint256 fullAssetAmount = bentoBox.toAmount(asset, _totalAsset.elastic, false).add(_totalBorrow.elastic);

        uint256 feeAmount = extraAmount.mul(PROTOCOL_FEE) / PROTOCOL_FEE_DIVISOR; // % of interest paid goes to fee
        feeFraction = feeAmount.mul(_totalAsset.base) / fullAssetAmount;
        _accrueInfo.feesEarnedFraction = _accrueInfo.feesEarnedFraction.add(feeFraction.to128());
        totalAsset.base = _totalAsset.base.add(feeFraction.to128());
        totalBorrow = _totalBorrow;
        accrueInfo = _accrueInfo;

        return (fullAssetAmount, feeAmount, (uint256(_totalBorrow.elastic).mul(UTILIZATION_PRECISION) / fullAssetAmount));
    }

    function init(bytes calldata b) public payable override {
        // issue with packing
    }

    bool public solventCheckByModifier;
	bool public needsSolvencyCheck;

	modifier solvent() override {
        _;
        require(_isSolvent(msg.sender, false, exchangeRate), "KashiPair: user insolvent");
		solventCheckByModifier = true;
    }

	function symbolicCook(uint8 action) external virtual payable
                                    returns (uint256 value1, uint256 value2) {
        CookStatus memory status;

            if (!status.hasAccrued && action < 10) {
                accrue();
                status.hasAccrued = true;
            }

            if (action == ACTION_ADD_COLLATERAL) {
                // (int256 share, address to, bool skim) = abi.decode(datas[i], (int256, address, bool));
                // addCollateral(to, skim, _num(share, value1, value2));
            } else if (action == ACTION_ADD_ASSET) {
                // (int256 share, address to, bool skim) = abi.decode(datas[i], (int256, address, bool));
                // value1 = _addAsset(to, skim, _num(share, value1, value2));
            } else if (action == ACTION_REPAY) {
                // (int256 part, address to, bool skim) = abi.decode(datas[i], (int256, address, bool));
                // _repay(to, skim, _num(part, value1, value2));
            } else if (action == ACTION_REMOVE_ASSET) {
                // (int256 fraction, address to) = abi.decode(datas[i], (int256, address));
                // value1 = _removeAsset(to, _num(fraction, value1, value2));
            } else if (action == ACTION_REMOVE_COLLATERAL) {
                // (int256 share, address to) = abi.decode(datas[i], (int256, address));
                // _removeCollateral(to, _num(share, value1, value2));
                needsSolvencyCheck = true;
            } else if (action == ACTION_BORROW) {
                // (int256 amount, address to) = abi.decode(datas[i], (int256, address));
                // (value1, value2) = _borrow(to, _num(amount, value1, value2));
                needsSolvencyCheck = true;
             } else if (action == ACTION_UPDATE_EXCHANGE_RATE) {
                // (bool must_update, uint256 minRate, uint256 maxRate) = abi.decode(datas[i], (bool, uint256, uint256));
                // (bool updated, uint256 rate) = updateExchangeRate();
                // require((!must_update || updated) && rate > minRate && (maxRate == 0 || rate > maxRate), "KashiPair: rate not ok");
            } else if (action == ACTION_BENTO_SETAPPROVAL) {
                // (address user, address _masterContract, bool approved, uint8 v, bytes32 r, bytes32 s) =
                // abi.decode(datas[i], (address, address, bool, uint8, bytes32, bytes32));
                // bentoBox.setMasterContractApproval(user, _masterContract, approved, v, r, s);
            } else if (action == ACTION_BENTO_DEPOSIT) {
                // (value1, value2) = _bentoDeposit(datas[i], values[i], value1, value2);
            } else if (action == ACTION_BENTO_WITHDRAW) {
                // (value1, value2) = _bentoWithdraw(datas[i], value1, value2);
            } else if (action == ACTION_BENTO_TRANSFER) {
                // (IERC20 token, address to, int256 share) = abi.decode(datas[i], (IERC20, address, int256));
                // bentoBox.transfer(token, msg.sender, to, _num(share, value1, value2));
            } else if (action == ACTION_BENTO_TRANSFER_MULTIPLE) {
                // (IERC20 token, address[] memory tos, uint256[] memory shares) = abi.decode(datas[i], (IERC20, address[], uint256[]));
                // bentoBox.transferMultiple(token, msg.sender, tos, shares);
            } else if (action == ACTION_CALL) {
                // (address callee, bytes memory callData, bool useValue1, bool useValue2, uint8 returnValues) =
                //     abi.decode(datas[i], (address, bytes, bool, bool, uint8));
                // callData = _callData(callData, useValue1, useValue2, value1, value2);
                // bytes memory returnData = _call(values[i], callee, callData);

                /*
                if (returnValues == 1) {
                        (value1) = abi.decode(returnData, (uint256));
                    } else if (returnValues == 2) {
                        (value1, value2) = abi.decode(returnData, (uint256, uint256));
                    }
                */
            } else if (action == ACTION_GET_REPAY_SHARE) {
                // int256 part = abi.decode(datas[i], (int256));
                // value1 = bentoBox.toShare(asset, totalBorrow.toElastic(_num(part, value1, value2), true), true);
            } else if (action == ACTION_GET_REPAY_PART) {
                // int256 amount = abi.decode(datas[i], (int256));
                // value1 = totalBorrow.toBase(_num(amount, value1, value2), false);
            }

        if (needsSolvencyCheck) {
            require(_isSolvent(msg.sender, false, exchangeRate), "KashiPair: user insolvent");
        }
    }

	ISwapper whitelistedSwapper;
	ISwapper redSwapper;
	
    function liquidate(
        address[] calldata users,
        uint256[] calldata maxBorrowParts,
        address to,
        ISwapper swapper,
        bool open
    ) public override {
        require(to != address(this));

		if (open) {
        	require (swapper == whitelistedSwapper);
		} else {
			require (swapper == redSwapper);
		}

        super.liquidate(users, maxBorrowParts, to, swapper, open);
    }
}