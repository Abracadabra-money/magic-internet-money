import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { MagicInternetGold } from "../typechain/MagicInternetGold";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    deploymentName: "MagicInternetGold",
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  // Deploy MIG
  const magicInternetGold = await wrappedDeploy<MagicInternetGold>(parameters.deploymentName, {
    from: deployer,
    args: [],
    log: true,
    contract: "MagicInternetGold",
    deterministicDeployment: false,
  });


  if (network.name !== "hardhat") {
    if ((await magicInternetGold.owner()) != parameters.owner) {
      await (await magicInternetGold.transferOwnership(parameters.owner, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MIG"];
deployFunction.dependencies = [];
