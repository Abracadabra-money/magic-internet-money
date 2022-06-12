import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Fantom]: {
    deploymentName: "LimoneFantom",
    weth: Constants.fantom.wftm
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await wrappedDeploy(parameters.deploymentName, {
    from: deployer,
    args: [parameters.weth],
    log: true,
    contract: "DegenBox",
    deterministicDeployment: false,
  });
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["Limone"];
deployFunction.dependencies = [];
