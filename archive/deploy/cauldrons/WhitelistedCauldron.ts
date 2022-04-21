import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { CauldronV3 } from "../typechain/CauldronV3";
import { IWhitelister } from "../typechain";

const ParametersPerChain = {
  [ChainId.Avalanche]: {
    owner: xMerlin,
    degenBox: Constants.avalanche.degenBox,
    mim: Constants.avalanche.mim,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  // Deploy CauldronV3 MasterContract
  const CauldronV3MasterContract = await wrappedDeploy<CauldronV3>("WhitelistedCauldronV3Avalanche", {
    from: deployer,
    args: [parameters.degenBox, parameters.mim],
    log: true,
    contract: "WhitelistedCauldronV3",
    deterministicDeployment: false,
  });

  /*await wrappedDeploy<IWhitelister>("Whitelister", {
    from: deployer,
    args: [ethers.utils.formatBytes32String("TODO"), "TODO"],
    log: true,
    deterministicDeployment: false,
  });*/

  await (await CauldronV3MasterContract.setFeeTo(parameters.owner)).wait();

  if (network.name !== "hardhat") {
    if ((await CauldronV3MasterContract.owner()) != parameters.owner) {
      await (await CauldronV3MasterContract.transferOwnership(parameters.owner, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["WhitelistedCauldron"];
deployFunction.dependencies = [];
