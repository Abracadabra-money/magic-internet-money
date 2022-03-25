import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";
import { BentoBoxV1 } from "../typechain";
import { DegenBox } from "../typechain/DegenBox";

const ParametersPerChain = {
  [ChainId.Avalanche]: {
    weth: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"
  }
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("PopsicleDegenBox", {
    from: deployer,
    args: [parameters.weth],
    log: true,
    contract: "DegenBox",
    deterministicDeployment: false,
  });
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["PopsicleDegenBox"];
deployFunction.dependencies = [];
