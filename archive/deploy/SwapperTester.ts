import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployCauldron, deployLPOracle, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { getNamedAccounts, network } from "hardhat";

// List of supported chains to deploy on
export const ParametersPerChain = {
  [ChainId.Avalanche]: {
    cauldronDeploymentName: "MainnetSwapperTester",
    mim: Constants.mainnet.mim
  },
  [ChainId.Avalanche]: {
    cauldronDeploymentName: "AvalancheSwapperTester",
    mim: Constants.avalanche.mim
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await wrappedDeploy(parameters.cauldronDeploymentName, {
    from: deployer,
    args: [parameters.mim],
    log: true,
    contract: "SwapperTester",
    deterministicDeployment: false,
  });
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["SwapperTester"];
deployFunction.dependencies = [];
