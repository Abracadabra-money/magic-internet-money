import { ethers } from "hardhat";
import _ from "lodash";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const makeStructTypeString = (namedTypes) => `tuple(${_.map(namedTypes, (t, name) => `${t} ${name}`).join(", ")})`;

const loanParams = {
  valuation: "uint128",
  expiration: "uint64",
  openFeeBPS: "uint16",
  annualInterestBPS: "uint16",
  compoundInterestTerms: "uint8",
};
const loanParamsArrayType = makeStructTypeString(loanParams) + "[]";

const typeDefaults = {
  address: ZERO_ADDR,
  "uint256[]": [],
  "address[]": [],
  bytes: "",
  [loanParamsArrayType]: [],
};

const makeStructEncoder = (namedTypes) => {
  // These rely on JS/TS iterating over the keys in the order they were defined:
  const typeArray = [makeStructTypeString(namedTypes)];
  return (kvs) => ethers.utils.defaultAbiCoder.encode(typeArray, [_.mapValues(namedTypes, (t, k) => kvs[k] || typeDefaults[t] || 0)]);
};

export const encodeInitData = makeStructEncoder({
  collateral: "address",
  asset: "address",
  oracle: "address",
  oracleData: "bytes",
  lender: "address",
  borrowers: "address[]",
  INTEREST_PER_SECOND: "uint64",
  NO_LIQUIDATIONS_BEFORE: "uint64",
  COLLATERALIZATION_RATE_BPS: "uint16",
  LIQUIDATION_MULTIPLIER_BPS: "uint16",
  BORROW_OPENING_FEE_BPS: "uint16",
  LIQUIDATION_SEIZE_COLLATERAL: "bool",
});

export const encodeInitDataNFT = makeStructEncoder({
  collateral: "address",
  asset: "address",
  lender: "address",
  tokenIds: "uint256[]",
  loanParams: loanParamsArrayType,
});

export const encodeLoanParamsNFT = makeStructEncoder(loanParams);

// Cook actions
export const Cook = {
  ACTION_ADD_ASSET: 1,
  ACTION_REPAY: 2,
  ACTION_REMOVE_ASSET: 3,
  ACTION_REMOVE_COLLATERAL: 4,
  ACTION_BORROW: 5,
  ACTION_GET_REPAY_SHARE: 6,
  ACTION_GET_REPAY_PART: 7,
  ACTION_ACCRUE: 8,

  // Functions that don't need accrue to be called
  ACTION_ADD_COLLATERAL: 10,
  ACTION_UPDATE_EXCHANGE_RATE: 11,

  // Function on BentoBox
  ACTION_BENTO_DEPOSIT: 20,
  ACTION_BENTO_WITHDRAW: 21,
  ACTION_BENTO_TRANSFER: 22,
  ACTION_BENTO_TRANSFER_MULTIPLE: 23,
  ACTION_BENTO_SETAPPROVAL: 24,

  // Any external call (except to BentoBox)
  ACTION_CALL: 30,

  USE_VALUE1: -1,
  USE_VALUE2: -2,
};

export const LoanStatus = {
  INITIAL: 0,
  COLLATERAL_DEPOSITED: 1,
  TAKEN: 2,
};
