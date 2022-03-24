import { ParamType } from "@ethersproject/abi";
import { BigNumber, Contract } from "ethers";
import { DeployFunction, DeployOptions } from "hardhat-deploy/types";
import hre, { ethers, network } from "hardhat";

export const BASE_TEN = 10;

export function encodeParameters(types: readonly (string | ParamType)[], values: readonly any[]) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

export const impersonate = async (address: string) => {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
};

// Defaults to e18 using amount * 10^18
export function getBigNumber(amount: any, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(BASE_TEN).pow(decimals));
}

export enum ChainId {
  Mainnet = 1,
  Ropsten = 3,
  Rinkeby = 4,
  Goerli = 5,
  Kovan = 42,
  BSC = 56,
  BSCTestnet = 97,
  xDai = 100,
  Polygon = 137,
  Theta = 361,
  ThetaTestnet = 365,
  Moonriver = 1285,
  Mumbai = 80001,
  Harmony = 1666600000,
  Palm = 11297108109,
  Localhost = 1337,
  Hardhat = 31337,
  Fantom = 250,
  Arbitrum = 42161,
  Avalanche = 43114,
  Boba = 288,
}

export const setDeploymentSupportedChains = (supportedChains: string[], deployFunction: DeployFunction) => {
  if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
    deployFunction.skip = ({ getChainId }) =>
      new Promise(async (resolve, reject) => {
        try {
          getChainId().then((chainId) => {
            resolve(supportedChains.indexOf(chainId.toString()) === -1);
          });
        } catch (error) {
          reject(error);
        }
      });
  }
};

export async function wrappedDeploy<T extends Contract>(name: string, options: DeployOptions): Promise<T> {
  await hre.deployments.deploy(name, options);
  const contract = await ethers.getContract<T>(name);
  await verifyContract(name, contract.address, options.args || []);

  return contract;
}

export async function verifyContract(name: string, address: string, constructorArguments: string[]) {
  if (network.name !== "hardhat") {
    process.stdout.write(`Verifying ${name}...`);
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments,
      });
      console.log("[OK]");
    } catch (e: any) {
      console.log(`[FAILED] ${e.message}`);
    }
  }
}

export * from "./time";
