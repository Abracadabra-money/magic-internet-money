import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployLPOracle, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { getNamedAccounts, network } from "hardhat";

// List of supported chains to deploy on
export const ParametersPerChain = {
  [ChainId.Optimism]: {

  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();

  const ProxyOracle = await deployLPOracle(
    "VelodromeVolatileOPUSDC",
    "Velodrome Volatile OP/USDC",
    Constants.optimism.velodrome.vOpUsdc,
    Constants.optimism.chainlink.op,
    Constants.optimism.chainlink.usdc,
    deployer
  );

  if (network.name !== "hardhat") {
    if ((await ProxyOracle.owner()) !== xMerlin) {
      await (await ProxyOracle.transferOwnership(xMerlin, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["VelocromeVolatileOPUSDCLPOracle"];
deployFunction.dependencies = [];
