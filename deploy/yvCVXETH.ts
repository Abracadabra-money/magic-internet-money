import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { DegenBox, ProxyOracle } from "../typechain";
import { expect } from "chai";
import { xMerlin } from "../test/constants";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet];

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    cauldronDeploymentName: "yvCVXETHCauldron",
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    cauldronV2MasterContract: "0x476b1E35DDE474cB9Aa1f6B85c9Cc589BFa85c1F",
    oracleData: "0x0000000000000000000000000000000000000000",
    collateral: "0x1635b506a88fBF428465Ad65d00e8d6B6E5846C3", // yvCurve-CVXETH
    proxyOracleDeploymentName: "YVCVXETHOracleProxy",
    oracleName: "YVCVXETHOracle",
    swapperName: "YVCVXETHSwapper",
    levSwapperName: "YVCVXETHLevSwapper",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;

  const collateralization = 75 * 1e3; // 75% LTV
  const opening = 0.5 * OPENING_CONVERSION; // .5% borrow initial fee
  const interest = parseInt(String(1 * INTEREST_CONVERSION)); // 1% Interest
  const liquidation = 12.5 * 1e3 + 1e5; // 12.5% liquidation fee

  // Proxy Oracle
  await deploy(parameters.proxyOracleDeploymentName, {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  // Oracle Implementation
  await deploy(parameters.oracleName, {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  // Cauldron
  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
  const ProxyOracle = await ethers.getContract<ProxyOracle>(parameters.proxyOracleDeploymentName);

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [parameters.collateral, ProxyOracle.address, parameters.oracleData, interest, liquidation, collateralization, opening]
  );

  const tx = await (await DegenBox.deploy(parameters.cauldronV2MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  // Register the deployment so it's available within the test using `getContract`
  deployments.save(parameters.cauldronDeploymentName, {
    abi: [],
    address: deployEvent?.args?.cloneAddress,
  });

  // Liquidation Swapper
  await deploy(parameters.swapperName, {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await deploy(parameters.levSwapperName, {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const OracleImplementation = await ethers.getContract(parameters.oracleName);
  if ((await ProxyOracle.oracleImplementation()) !== OracleImplementation.address) {
    await ProxyOracle.changeOracleImplementation(OracleImplementation.address);
  }
  if ((await ProxyOracle.owner()) !== xMerlin) {
    await ProxyOracle.transferOwnership(xMerlin, true, false);
  }
};

export default deployFunction;

if (network.name !== "hardhat") {
  deployFunction.skip = ({ getChainId }) =>
    new Promise(async (resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(supportedChains.indexOf(parseInt(chainId)) === -1);
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["yvCVXETH"];
deployFunction.dependencies = [];
