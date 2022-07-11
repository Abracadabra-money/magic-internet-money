import { ParamType } from "@ethersproject/abi";
import { BaseContract, BigNumber, Contract } from "ethers";
import { DeployFunction, DeployOptions } from "hardhat-deploy/types";
import hre, { deployments, ethers, network } from "hardhat";
import { AggregatorV3Interface, DegenBox, IAggregator, InvertedLPOracle, ProxyOracle } from "../typechain";

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

const MimAddresses = {
  "1": "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3",
  "43114": "0x130966628846BFd36ff31a822705796e8cb8C18D",
  "250": "0x82f0B8B456c1A451378467398982d4834b6829c1",
  "42161": "0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A",
};

const SpellAddresses = {
  "1": "0x090185f2135308BaD17527004364eBcC2D37e5F6",
  "43114": "0xCE1bFFBD5374Dac86a2893119683F4911a2F7814",
  "250": "0x468003B688943977e6130F4F68F23aad939a1040",
  "42161": "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF",
};

const ChainName = {
  "1": "Mainnet",
  "43114": "Avax",
  "250": "Fantom",
  "42161": "Arbitrum",
};

export { MimAddresses, SpellAddresses, ChainName };

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
  const deployment = await hre.deployments.deploy(name, options);
  const contract = await ethers.getContract<T>(name);

  if (deployment.newlyDeployed) {
    await verifyContract(name, contract.address, options.args || []);
  }

  return contract;
}

export async function verifyContract(name: string, address: string, constructorArguments: string[]) {
  if (network.name !== "hardhat") {
    console.log(`Verifying ${name}...`);
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

export async function deployCauldron<T extends Contract>(
  deploymentName: string,
  degenBox: string,
  masterContract: string,
  collateral: string,
  oracle: string,
  oracleData: string,
  ltv: number,
  interest: number,
  borrowFee: number,
  liquidationFee: number
): Promise<T> {
  console.log(`Deploying cauldron ${deploymentName}...`);

  try {
    const existingDeployment = await ethers.getContract<T>(deploymentName);
    console.log(`Already deployment at ${existingDeployment.address}`);
    return existingDeployment;
  } catch {}

  console.table({
    ChainId: await hre.getChainId(),
    BentoBox: degenBox,
    MasterContract: masterContract,
    Collateral: collateral,
    LTV: `${ltv}%`,
    Interests: `${interest}%`,
    "Borrow Fee": `${borrowFee}%`,
    "Liquidation Fee": `${liquidationFee}%`,
    Oracle: oracle,
    "Oracle Data": oracleData,
  });

  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;

  ltv = ltv * 1e3; // LTV
  borrowFee = borrowFee * OPENING_CONVERSION; // borrow initial fee
  interest = parseInt(String(interest * INTEREST_CONVERSION)); // Interest
  liquidationFee = liquidationFee * 1e3 + 1e5; // liquidation fee

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle, oracleData, interest, liquidationFee, ltv, borrowFee]
  );

  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", degenBox);
  const tx = await (await DegenBox.deploy(masterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  if (deployEvent?.eventSignature !== "LogDeploy(address,bytes,address)") {
    throw new Error(`Error while deploying cauldron, unexpected eventSignature returned: ${deployEvent?.eventSignature}`);
  }

  const address = deployEvent?.args?.cloneAddress;

  // Register the deployment so it's available within the test using `getContract`
  deployments.save(deploymentName, {
    abi: [],
    address,
  });

  console.log(`${deploymentName} deployed at ${address}`);

  return ethers.getContract<T>(deploymentName);
}

// Use to deploy a new LP Oracle
export async function deployLPOracle(
  name: string,
  desc: string,
  lp: string,
  tokenAOracle: string,
  tokenBOracle: string,
  deployer: string
): Promise<ProxyOracle> {
  const ProxyOracle = await wrappedDeploy<ProxyOracle>(`${name}ProxyOracle`, {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  // Gives the price of 1 tokenA in tokenB
  const TokenOracle = await wrappedDeploy<AggregatorV3Interface>(`${name}TokenOracle`, {
    from: deployer,
    args: [tokenAOracle, tokenBOracle],
    log: true,
    contract: "TokenOracle",
    deterministicDeployment: false,
  });

  // Gives the price of 1 LP in tokenB
  const LPChainlinkOracle = await wrappedDeploy<IAggregator>(`${name}ChainlinkOracle`, {
    from: deployer,
    args: [lp, TokenOracle.address],
    contract: "LPChainlinkOracle",
    log: true,
    deterministicDeployment: false,
  });

  // Gives how much LP denominated in tokenB, 1 USD can buy
  const InvertedLPOracle = await wrappedDeploy<InvertedLPOracle>(`${name}InvertedLPOracle`, {
    from: deployer,
    args: [LPChainlinkOracle.address, tokenBOracle, desc],
    log: true,
    contract: "InvertedLPOracle",
    deterministicDeployment: false,
  });

  if ((await ProxyOracle.oracleImplementation()) !== InvertedLPOracle.address) {
    await ProxyOracle.changeOracleImplementation(InvertedLPOracle.address);
  }

  return ProxyOracle;
}

export async function deployUniswapLikeZeroExSwappers(
  name: string,
  degenBox: string,
  uniswapLikeRouter: string,
  collateral: string,
  mim: string,
  zeroXExchangeProxy: string,
  deployer: string
): Promise<BaseContract[]> {
  const swapperArgs = [degenBox, uniswapLikeRouter, collateral, mim, zeroXExchangeProxy];

  // Liquidation Swapper
  const Swapper = await wrappedDeploy(`${name}Swapper`, {
    from: deployer,
    args: swapperArgs,
    log: true,
    contract: "ZeroXUniswapLikeLPSwapper",
    deterministicDeployment: false,
  });

  // Leverage Swapper
  const LevSwapper = await wrappedDeploy(`${name}LevSwapper`, {
    from: deployer,
    args: swapperArgs,
    log: true,
    contract: "ZeroXUniswapLikeLPLevSwapper",
    deterministicDeployment: false,
  });

  return [Swapper, LevSwapper];
}

export * from "./time";
export * from "./whitelistedMerkle";
