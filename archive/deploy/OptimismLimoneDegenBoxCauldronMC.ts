import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Optimism]: {
    weth: Constants.optimism.weth,
    mim: Constants.optimism.mim,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const Limone = await wrappedDeploy("LimoneOptimism", {
    from: deployer,
    args: [parameters.weth],
    log: true,
    contract: "DegenBox",
    deterministicDeployment: false,
  });

  const DegenBox = await wrappedDeploy("DegenBoxOptimism", {
    from: deployer,
    args: [parameters.weth],
    log: true,
    contract: "DegenBox",
    deterministicDeployment: false,
  });

  const Limone_CauldronV3MC = await wrappedDeploy("CauldronV31_Limone_Optimism", {
    from: deployer,
    args: [Limone.address, parameters.mim],
    log: true,
    contract: "CauldronV3_1",
    deterministicDeployment: false,
  });

  const DegenBox_CauldronV3MC = await wrappedDeploy("CauldronV31_DegenBox_Optimism", {
    from: deployer,
    args: [DegenBox.address, parameters.mim],
    log: true,
    contract: "CauldronV3_1",
    deterministicDeployment: false,
  });

  console.log("Limone", Limone.address);
  console.log("Limone MasterContract 3.1", Limone_CauldronV3MC.address);
  console.log("DegenBox", DegenBox.address);
  console.log("DegenBox MasterContract 3.1", DegenBox_CauldronV3MC.address);
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["DegenBox"];
deployFunction.dependencies = [];
