import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { expect } from "chai";
import { xMerlin } from "../test/constants";
import { ConvexStakingWrapperAbra } from "../typechain";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    bentoBox: "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966",
    CauldronV2CheckpointV1: "0x1DF188958A8674B5177f77667b8D173c3CdD9e51",
    curveToken: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B", // frax3crv
    convexToken: "0xbE0F6478E0E4894CFb14f32855603A083A57c7dA", // cvxFRAX3CRV-f
    convexPool: "0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e",
    convexPoolId: 32,

    oracleData: "0x0000000000000000000000000000000000000000",
    cauldronDeploymentName: "PopsicleUSDCWETHCauldron",
    proxyOracleDeploymentName: "PopsicleUSDCWETHProxyOracle",
    oracleDeploymentName: "PopsicleUSDCWETHOracle",

    swapperName: "PopsicleUSDCWETHSwapper",
    swapperDeploymentName: "PopsicleUSDCWETHSwapper03Fee",
    levSwapperName: "PopsicleUSDCWETHLevSwapper",
    levSwapperDeploymentName: "PopsicleUSDCWETHLevSwapper03Fee",
    token0Aggregator: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", // USDC
    token1Aggregator: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // WETH
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

  // 90% LTV .5% initial 1% Interest, 1.5% fee
  const maximumCollateralRatio = 90 * 1e3; // 85% LTV
  const liquidationFee = 1.5 * 1e3 + 1e5; // 8% fee
  const borrowFee = 0.5 * OPENING_CONVERSION; // .5% initial
  const interest = parseInt(String(1 * INTEREST_CONVERSION)); // 3% Interest

  await deploy("ConvexStakingWrapperAbra", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const ConvexStakingWrapperAbra = await ethers.getContract<ConvexStakingWrapperAbra>("ConvexStakingWrapperAbra");

  await ConvexStakingWrapperAbra.initialize(parameters.curveToken, parameters.convexToken, parameters.convexPool, parameters.convexPoolId, parameters.bentoBox);
  /*
  // Proxy Oracle
  await deploy("Frax3CrvOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  // Oracle Implementation
  await deploy("Frax3CrvOracle" , {
    from: deployer,
    args: [parameters.plpAddress, parameters.token0Aggregator, parameters.token1Aggregator],
    log: true,
    deterministicDeployment: false,
  });

  // Cauldron
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", parameters.bentoBox);
  const ProxyOracle = await ethers.getContract<ProxyOracle>("Frax3CrvOracle");

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [parameters.plpAddress, ProxyOracle.address, parameters.oracleData, interest, liquidationFee, maximumCollateralRatio, borrowFee]
  );
  const tx = await (await BentoBox.deploy(parameters.cauldronV2MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  // Register the deployment so it's available within the test using `getContract`
  deployments.save("Frax3CrvCauldron", {
    abi: require("../../CauldronV2Checkpoint.json"),
    address: deployEvent?.args?.cloneAddress,
  });

  // Liquidation Swapper
  await deploy("Frax3CrvSwapper", {
    from: deployer,
    args: [ConvexStakingWrapperAbra.address],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await deploy("Frax3CrvLevSwapper", {
    from: deployer,
    args: [ConvexStakingWrapperAbra.address],
    log: true,
    deterministicDeployment: false,
  });

  const PopsiclePLPOracle = await ethers.getContract<PLPOracle>(parameters.oracleDeploymentName);
  if ((await ProxyOracle.oracleImplementation()) !== PopsiclePLPOracle.address) {
    await ProxyOracle.changeOracleImplementation(PopsiclePLPOracle.address);
  }
  if ((await ProxyOracle.owner()) !== xMerlin) {
    await ProxyOracle.transferOwnership(xMerlin, true, false);
  }*/
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

deployFunction.tags = ["Frax3CrvCauldron"];
deployFunction.dependencies = [];
