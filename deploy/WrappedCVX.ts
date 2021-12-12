import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";
import { WrappedCVX } from "../typechain/WrappedCVX";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    cvxlocker: "0xD18140b4B819b895A3dba5442F959fA44994AF50",
    owner: xMerlin,
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("WrappedCVX", {
    from: deployer,
    args: [parameters.cvxlocker],
    log: true,
    deterministicDeployment: false,
  });

  const WrappedCVX = await ethers.getContract<WrappedCVX>("WrappedCVX");

  if (!(await WrappedCVX.operators(parameters.owner))) {
    await WrappedCVX.setOperator(parameters.owner, true);
  }

  if ((await WrappedCVX.owner()) != parameters.owner) {
    await WrappedCVX.transferOwnership(parameters.owner);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["WrappedCVX"];
deployFunction.dependencies = [];
