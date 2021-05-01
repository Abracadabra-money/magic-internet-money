using DummyERC20A as collateralInstance
using DummyERC20B as assetInstance
using SimpleBentoBox as bentoBox

methods {
	balanceOf(address a) returns (uint256) envfree
	userBorrowPart(address user) returns (uint256) envfree
	totalCollateralShare() returns (uint256) envfree
	userCollateralShare(address user) returns (uint256) envfree
	totalAssetElastic() returns (uint256) envfree
	totalSupply() returns (uint256) envfree
	totalBorrowElastic() returns (uint256) envfree
	totalBorrowBase() returns (uint256) envfree
	borrowToElastic(uint256 part) returns (uint256) envfree
	
	collateralInstance.balanceOf(address a) returns (uint256) envfree
	feesEarnedFraction() returns (uint128) envfree
	collateral() returns (address) envfree
	asset() returns (address) envfree
	feeTo() returns (address) envfree
	isSolvent(address user, bool open) returns (bool) envfree
	origIsSolvent(address user, bool open, uint256 exchangeRate) returns (bool) envfree

	// Bentobox functions
	bentoBox.transfer(address token, address from, address to, uint256 share) => DISPATCHER(true)
	bentoBox.balanceOf(address token, address user) returns (uint256) envfree
	bentoBox.assumeRatio(address token, uint ratio) envfree
	bentoBox.toShare(address token, uint256 amount, bool roundUp) returns (uint256) envfree
	bentoBox.toAmount(address token, uint256 share, bool roundUp) returns (uint256) envfree
	bentoBox.deposit(address token, address from, address to, uint256 amount, uint256 share) => DISPATCHER(true)
	
	// Swapper
	swap(address fromToken, address toToken, address recipient, uint256 amountToMin, uint256 shareFrom) => DISPATCHER(true)
	swappers(address) => NONDET

	// Weth specific methods
	deposit() => DISPATCHER(true)
	withdraw(uint256 amount) => DISPATCHER(true)

	// Accrue
	FULL_UTILIZATION() returns (uint256) envfree

	// Cook
	solventCheckByModifier() returns bool envfree
	needsSolvencyCheck() returns bool envfree
}

function setup() {
	require collateralInstance == collateral();
	require assetInstance == asset();
}

definition ACTION_ADD_ASSET() returns uint8 =  1;
definition ACTION_REPAY() returns uint8 = 2;
definition ACTION_REMOVE_ASSET() returns uint8 = 3;
definition ACTION_REMOVE_COLLATERAL() returns uint8 = 4;
definition ACTION_BORROW() returns uint8 = 5;
definition ACTION_ADD_COLLATERAL() returns uint8 = 10;
definition MAX_UINT256() returns uint256 =
	0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
	
// represents the sum of userCollateralShare[a] for all addresses a
ghost userCollateralSum() returns uint256 {
    init_state axiom userCollateralSum() == 0;
}

// represents the sum of balanceOf[a] for all addresses a
ghost userBalanceOfSum() returns uint256 {
    init_state axiom userBalanceOfSum() == 0;
}

// represents the sum of userBorrowPart[a] for all addresses a
ghost userBorrowSum() returns uint256 {
    init_state axiom userBorrowSum() == 0;
}

// update userCollateralSum on every assginment to userCollateralShare
hook Sstore userCollateralShare [KEY uint a] uint share (uint oldShare) STORAGE {
	havoc userCollateralSum assuming userCollateralSum@new() == userCollateralSum@old() + share - oldShare; 
}

// when loading userCollateralShare[a] assume that the sum is more than the loaded value
hook Sload uint256 share userCollateralShare[KEY uint a] STORAGE { 
	require userCollateralSum() >= share;
}

// update userBalanceOfSum on every assginment to balanceOf
hook Sstore balanceOf [KEY uint a] uint balance (uint oldBalance) STORAGE {
	havoc userBalanceOfSum assuming userBalanceOfSum@new() == userBalanceOfSum@old() + balance - oldBalance; 
}

// when loading balanceOf[a] assume that the sum is more than the loaded value
hook Sload uint256 b balanceOf[KEY uint a] STORAGE { 
	require userBalanceOfSum() >= b;
}

// update userBorrowSum on every assginment to balanceOf
hook Sstore userBorrowPart [KEY uint a] uint part (uint oldPart) STORAGE {
	havoc userBorrowSum assuming userBorrowSum@new() == userBorrowSum@old() + part - oldPart &&userBorrowSum@old() >= oldPart; 
}
// when loading userBorrowPart[a] assume that the sum is more than the loaded value
hook Sload uint256 part userBorrowPart[KEY uint a] STORAGE { 
	require userBorrowSum() >= part;
}

// INVARIANTS

invariant totalCollateralEqUserCollateralSum()
	userCollateralSum() == totalCollateralShare()

invariant totalSupplyEqUserBalanceOfSum()
	userBalanceOfSum() + feesEarnedFraction() == totalSupply() 

invariant totalBorrowEqUserBorrowSum()
	userBorrowSum() == totalBorrowBase()

invariant validityOfTotalSupply()
	((totalBorrowBase() > 0) => (totalSupply() > 0)) &&
	((totalSupply() == 0) => (totalAssetElastic() == 0))

invariant integrityOfZeroBorrowAssets()
	totalBorrowElastic() >= totalBorrowBase() && 
	((totalBorrowElastic() == 0) <=> (totalBorrowBase() == 0)) {
		// prove this only on a simplified version 
		preserved repay(address to, bool skim, uint256 amount) with (env e) {
			require false; 
		}

		preserved liquidate(address[] users, uint256[] amounts, address to, address swap, bool open) with (env e) {
			require false; 
		}
	}

// INVARIANTS implemented as rules

rule totalCollateralLeBentoBoxBalanceOf(method f) { // Le: less than or equal to
	setup();

	require bentoBox.balanceOf(collateralInstance, currentContract) >= totalCollateralShare(); 

	env e;
	calldataarg args;

	require e.msg.sender != currentContract;

	f(e, args);

	assert bentoBox.balanceOf(collateralInstance, currentContract) >= totalCollateralShare(); 
}

rule totalAssetElasticLeBentoBoxBalanceOf(method f) { // Le: less than or equal to
	setup();

	require bentoBox.balanceOf(assetInstance, currentContract) >= totalAssetElastic();

	env e;
	calldataarg args;

	require e.msg.sender != currentContract;

	f(e, args);

	assert bentoBox.balanceOf(assetInstance, currentContract) >= totalAssetElastic(); 
}

function validState() {
	setup();

	requireInvariant validityOfTotalSupply();
	requireInvariant integrityOfZeroBorrowAssets();

	// rule totalCollateralLeBentoBoxBalanceOf
	require bentoBox.balanceOf(collateralInstance, currentContract) >= totalCollateralShare();

	// rule totalAssetElasticLeBentoBoxBalanceOf
	require bentoBox.balanceOf(assetInstance, currentContract) >= totalAssetElastic();
}

// RULES

rule noChangeToOthersBorrowPart(method f, address other) {
	validState();
	env e;

	require other != e.msg.sender;

	uint256 _othersBorrowAsset = userBorrowPart(other);
	
	calldataarg args;
	f(e, args);

	uint256 othersBorrowAsset_ = userBorrowPart(other);
	
	assert (_othersBorrowAsset >= othersBorrowAsset_,
			"other's borrow part changed");
}

// balanceOf should only decrease when we try to call removeAsset
rule noChangeToOthersAssetFraction(address from, address to, address other,
								   uint256 amount, uint256 share, bool skim,
								   method f) {
	validState();

	require other != from;

	uint256 _othersAssetFraction = balanceOf(other);

	// other != msg.sender inside callFunctionWithParams
	callFunctionWithParams(from, to, other, amount, share, skim, f);

	uint256 othersAssetFraction_ = balanceOf(other);

	// f.selector == addAsset, transfer, or transferFrom
	// to is only limited in those cases
	if (other == to || other == feeTo()) { 
		assert (_othersAssetFraction <= othersAssetFraction_, 
				"other's asset fraction changed");
	} else {
		assert (_othersAssetFraction == othersAssetFraction_,
				"other's asset fraction changed");
	}
}

rule noChangeToOthersCollateralShare(address other, address to, bool skim,
								     uint256 share, method f) {
	validState();
	env e;

	require other != e.msg.sender; 

	uint256 _othersCollateralShare = userCollateralShare(other);

	if (f.selector == addCollateral(address, bool, uint256).selector) {
		addCollateral(e, to, skim, share);
	} else if (f.selector != liquidate(address[], uint256[], address, address, bool).selector) {
		// in case of liquidate its fine to reduce the collateral share
		calldataarg args;
		f(e, args);
	}
	
	uint256 othersCollateralShare_ = userCollateralShare(other);

	// to is only limited when f.selector == addCollateral(address, bool, uint256).selector
	if (other == to) { 
		assert (_othersCollateralShare <= othersCollateralShare_, 
				"other's collateral share changed");
	} else {
		assert (_othersCollateralShare == othersCollateralShare_,
				"other's collateral share changed");
	}
}

rule integrityOfSkimAddCollateral(address to, uint256 share, address from) {
	validState();

	// need two different env since we are calling different contracts
	env eBento;
	env e;

	uint256 _collateralShare = userCollateralShare(to);
	uint256 _totalCollateralShare = totalCollateralShare();

	require eBento.msg.sender == e.msg.sender;
	require eBento.block.number == e.block.number;
	require eBento.block.timestamp == e.block.timestamp;

	require e.msg.value == 0;
	require e.msg.sender != currentContract && e.msg.sender != bentoBox;
	require from == e.msg.sender;

	require  bentoBox.balanceOf(collateralInstance, currentContract) ==  _totalCollateralShare; 
	require  _collateralShare <= _totalCollateralShare;

	// transfer shares to lendingPair account in BentoBox 
	sinvoke bentoBox.transfer(eBento, collateralInstance, from, currentContract, share);

	// check if add collateral is successful
	bool skim = true;

	addCollateral@withrevert(e, to, skim, share);

	uint256 collateralShare_ = userCollateralShare(to);
	bool successful = !lastReverted;

	assert successful && collateralShare_ == _collateralShare + share;
}

// totalCollateralShare and userCollateralShare shouldn't change if we add 
// "x" share worth of collateral then remove "x" share worth of collateral
rule addThenRemoveCollateral(address to, bool skim, uint256 share) {
	validState();
	env e;

	require e.msg.sender == to && to != 0; 

	uint256 _totalCollateralShare = totalCollateralShare();
	uint256 _userCollateralShare = userCollateralShare(to); 

	addCollateral(e, to, skim, share);
	removeCollateral(e, to, share);

	uint256 totalCollateralShare_ = totalCollateralShare();
	uint256 userCollateralShare_ = userCollateralShare(to);

	assert (_totalCollateralShare == totalCollateralShare_, 
			"total asset base changed");

	assert (_userCollateralShare == userCollateralShare_, 
			"balance of user changed");
}

rule solvetCloseIsSolventOpen(address user, uint256 exchangeRate) {
	validState();

	uint256 totalBorrowBase_ = totalBorrowBase();
	uint256 totalCollateralShare_ = totalCollateralShare();

	require userCollateralShare(user) <= totalCollateralShare_;
	require userBorrowPart(user) <= totalBorrowBase_;

	assert origIsSolvent(user, false, exchangeRate)
	 								=> origIsSolvent(user, true, exchangeRate),
						"close solvent is not open solvent" ;
}

rule solventUser(address user, bool open, method f) {
	validState();

	require isSolvent(user, open);

	env e;
	calldataarg args;
	f(e, args);
	
	assert isSolvent(user, open), "by performing an operation reached an insolvent state";
}

////////////////////////////////////////////////////////////////////////////////
//                                Accrue Rules                                //
////////////////////////////////////////////////////////////////////////////////

// What if the system is empty? then accrue would return (checks totalBorrow.base)
// fullAssetAmount > 0 && fullAssetAmount > feeAmount
// utilization should be always greater than or equal to 0 and less than or equal to FULL_UTILIZATION
rule integrityOfAccrueInterest() {
	env e;

	validState();

	require totalBorrowBase() != 0;

	uint256 fullAssetAmount;
	uint256 feeAmount;
	uint256 utilization;

	fullAssetAmount, feeAmount, utilization = accrueInterest(e);

	assert fullAssetAmount != 0 && fullAssetAmount > feeAmount;

	assert (0 <= utilization && utilization <= FULL_UTILIZATION(), "utilization not in range");
}

////////////////////////////////////////////////////////////////////////////////
//                              Liquidatity Rules                             //
////////////////////////////////////////////////////////////////////////////////
rule integrityOfLiquidate() {
	validState();
	
	env e;

	uint256 collateralBalanceBefore = bentoBox.balanceOf(collateralInstance, currentContract);
	uint256 assetBalanceBefore = bentoBox.balanceOf(assetInstance, currentContract);

	// when there is excess balance in bentobox then the fee paid on the extra can be more than the asset gained from liquidation
	require totalAssetElastic() == assetBalanceBefore;
	require e.msg.sender != currentContract;

	sinvoke bentoBox.assumeRatio(collateralInstance, 2);

	calldataarg args;
	liquidate(e, args);

	uint256 collateralBalanceAfter = bentoBox.balanceOf(collateralInstance, currentContract);
	uint256 assetBalanceAfter = bentoBox.balanceOf(assetInstance, currentContract);

	assert (assetBalanceAfter >= assetBalanceBefore,
			"asset balance decreased");

	assert (collateralBalanceAfter <= collateralBalanceBefore,
			"collateral balance increased");
			
	assert (assetBalanceAfter > assetBalanceBefore) <=> (collateralBalanceAfter < collateralBalanceBefore),
			"only one balance changed";
			
}

////////////////////////////////////////////////////////////////////////////////
//                                  Cook Rules                                //
////////////////////////////////////////////////////////////////////////////////
rule integrityOfSolvencyCheck(method f) {
	env e;
	calldataarg args;
	uint8 action;
	require solventCheckByModifier() == false;
	require needsSolvencyCheck() == false;
	if (f.selector == addAsset(address,bool,uint256).selector)
		require action == ACTION_ADD_ASSET();
	else if (f.selector == repay(address,bool,uint256).selector)
		require action == ACTION_REPAY();
	else if (f.selector == removeAsset(address,uint256).selector)
		require action == ACTION_REMOVE_ASSET();
	else if (f.selector == removeCollateral(address,uint256).selector)
		require action == ACTION_REMOVE_COLLATERAL();
	else if (f.selector == borrow(address,uint256).selector)
		require action == ACTION_BORROW();
	else if (f.selector == addCollateral(address,bool,uint256).selector)
		require action == ACTION_ADD_COLLATERAL();
	else
		require action == 0 || ( action > 5 && action != 10);
	
	storage init = lastStorage;
	symbolicCook(e,action);
	bool setSolvency = needsSolvencyCheck();

	f(e,args) at init;
	assert solventCheckByModifier() <=> setSolvency;
}

// Helper Functions

// easy to use dispatcher (currently only being used by noChangeToOthersAssetFraction)
// WARNING: Be careful if you limit one of the parameters, it can be limited for 
// many functions.
function callFunctionWithParams(address from, address to, address other, 
								uint256 amount, uint256 share, bool skim,
								method f) {
	env e;

	require other != e.msg.sender;

	if (f.selector == addAsset(address, bool, uint256).selector) {
		addAsset(e, to, skim, share);
	} else if (f.selector == transferFrom(address, address, uint256).selector) {
		require( balanceOf(from) + balanceOf(to) <= MAX_UINT256());
		transferFrom(e, from, to, amount); 
	} else if  (f.selector == transfer(address, uint256).selector) {
		require( balanceOf(e.msg.sender) + balanceOf(to) <= MAX_UINT256());
		transfer(e, to, amount); // IERC20 function
	} else {
		calldataarg args;
		f(e,args);
	}
}