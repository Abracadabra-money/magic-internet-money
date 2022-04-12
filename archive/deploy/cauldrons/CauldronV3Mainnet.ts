import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { CauldronV3 } from "../typechain/CauldronV3";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  // Deploy CauldronV3 MasterContract
  const CauldronV3MasterContract = await wrappedDeploy<CauldronV3>("CauldronV3MasterContractMainnet", {
    from: deployer,
    args: [Constants.mainnet.degenBox, Constants.mainnet.mim],
    log: true,
    contract: "CauldronV3",
    deterministicDeployment: false,
  });

  await CauldronV3MasterContract.setFeeTo(parameters.owner);

  if (network.name !== "hardhat") {
    if ((await CauldronV3MasterContract.owner()) != parameters.owner) {
      await CauldronV3MasterContract.transferOwnership(parameters.owner, true, false);
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["CauldronV3MasterContractMainnet"];
deployFunction.dependencies = [];
