import { ParamType } from "@ethersproject/abi"
import { BigNumber } from "ethers"
import hre, { ethers } from "hardhat"

export const BASE_TEN = 10

export function encodeParameters(types: readonly (string | ParamType)[], values: readonly any[]) {
  const abi = new ethers.utils.AbiCoder()
  return abi.encode(types, values)
}

export const impersonate = async (address: string) => {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  })
}

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount: any, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(BASE_TEN).pow(decimals))
}

export * from "./time"
