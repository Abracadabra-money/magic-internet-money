import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import {LothricFin, xMerlin} from "../test/constants";
import { DegenBox } from "../typechain";

const ParametersPerChain = {
  [ChainId.Boba]: {
    weth: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000",
    owner: xMerlin,
  },
  [ChainId.Moonriver]: {
    weth: "0x639a647fbe20b6c8ac19e48e2de44ea792c62c5c",
    owner: xMerlin,
  },
  [ChainId.Localhost]: {
    weth: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
    owner: LothricFin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("DegenBox", {
    from: deployer,
    args: [parameters.weth],
    log: true,
    deterministicDeployment: false,
  });

  const DegenBox = await ethers.getContract<DegenBox>("DegenBox");

  if ((await DegenBox.owner()) != parameters.owner && network.name !== "hardhat") {
    await DegenBox.transferOwnership(parameters.owner, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["DegenBox"];
deployFunction.dependencies = [];
