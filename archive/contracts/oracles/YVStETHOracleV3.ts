import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getNamedAccounts } from "hardhat";

import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";

export const ParametersPerChain = {
  [ChainId.Mainnet]: {},
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();

  // Leverage Swapper
  await wrappedDeploy("YVCrvStETHOracleV3", {
    from: deployer,
    log: true,
    deterministicDeployment: false,
  });
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["YVCrvStETHOracleV3"];
deployFunction.dependencies = [];
