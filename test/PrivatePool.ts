import { ethers } from "hardhat";
import _ from "lodash";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const initTypes = {
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
};
const typeDefaults = {
  address: ZERO_ADDR,
  "address[]": [],
  bytes: "",
};
// These rely on JS/TS iterating over the keys in the order they were defined:
const initTypeString = _.map(initTypes, (t, name) => `${t} ${name}`).join(", ");

export const encodeInitData = (kvs) =>
  ethers.utils.defaultAbiCoder.encode(
    [`tuple(${initTypeString})`],
    [_.mapValues(initTypes, (t, k) => kvs[k] || typeDefaults[t] || 0)]
  );
