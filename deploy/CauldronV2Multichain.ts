import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import {xMerlin} from "../test/constants";
import { CauldronV2Multichain } from "../typechain";

const ParametersPerChain = {
  [ChainId.Boba]: {
    weth: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000",
    owner: xMerlin
  },
  [ChainId.Moonriver]: {
    weth: "0x639a647fbe20b6c8ac19e48e2de44ea792c62c5c",
    owner: xMerlin
  },
  [ChainId.Localhost]: {
    weth: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
    owner: xMerlin
  }
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("CauldronV2Multichain", {
    from: deployer,
    args: ["0xf4f46382c2be1603dc817551ff9a7b333ed1d18f", "0x130966628846BFd36ff31a822705796e8cb8C18D"],
    log: true,
    deterministicDeployment: false,
  });

  const CauldronV2Multichain = await ethers.getContract<CauldronV2Multichain>("CauldronV2Multichain");

  if ((await CauldronV2Multichain.owner()) != parameters.owner && network.name !== "hardhat") {
    await CauldronV2Multichain.transferOwnership(parameters.owner, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["CauldronV2Multichain"];
deployFunction.dependencies = [];
