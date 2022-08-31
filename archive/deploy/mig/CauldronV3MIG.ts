import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { CauldronV3 } from "../typechain/CauldronV3";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    deploymentName: "CauldronV3MasterContractMIGMainnet",
    degenBox: Constants.mainnet.degenBox,
    mim: Constants.mainnet.mig,
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  // Deploy CauldronV3 MasterContract
  const CauldronV3MasterContract = await wrappedDeploy<CauldronV3>(parameters.deploymentName, {
    from: deployer,
    args: [parameters.degenBox, parameters.mim],
    log: true,
    contract: "CauldronV3",
    deterministicDeployment: false,
  });

  await (await CauldronV3MasterContract.setFeeTo(parameters.owner)).wait();

  if (network.name !== "hardhat") {
    if ((await CauldronV3MasterContract.owner()) != parameters.owner) {
      await (await CauldronV3MasterContract.transferOwnership(parameters.owner, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["CauldronV3MIG"];
deployFunction.dependencies = [];
