import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { CauldronV31 } from "../typechain";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    deploymentName: "CauldronV3_1MVMainnet",
    degenBox: Constants.mainnet.degenBox,
    mim: Constants.mainnet.mim,
    owner: xMerlin,
  },
  [ChainId.Avalanche]: {
    deploymentName: "CauldronV3_1MC_Limone_Avalanche",
    degenBox: Constants.avalanche.limone,
    mim: Constants.avalanche.mim,
    owner: xMerlin,
  },
  // Popsicle
  [ChainId.Fantom]: {
    deploymentName: "CauldronV3_1MCLimoneFantom",
    degenBox: Constants.fantom.limone,
    mim: Constants.fantom.mim,
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  // Deploy Cauldron V3.1 MasterContract
  const CauldronV3MC = await wrappedDeploy<CauldronV31>(parameters.deploymentName, {
    from: deployer,
    args: [parameters.degenBox, parameters.mim],
    log: true,
    contract: "CauldronV3_1",
    deterministicDeployment: false,
  });

  await (await CauldronV3MC.setFeeTo(parameters.owner)).wait();

  if (network.name !== "hardhat") {
    if ((await CauldronV3MC.owner()) != parameters.owner) {
      await (await CauldronV3MC.transferOwnership(parameters.owner, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["CauldronV3_1MC"];
deployFunction.dependencies = [];
