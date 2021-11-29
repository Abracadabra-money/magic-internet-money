import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { EthereumWithdrawer } from "../typechain";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  await deploy("EthereumWithdrawer", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const EthereumWithdrawer = await ethers.getContract<EthereumWithdrawer>("EthereumWithdrawer");

  if(await EthereumWithdrawer.owner() != xMerlin) {
    await EthereumWithdrawer.transferOwnership(xMerlin, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["EthereumWithdrawer"];
deployFunction.dependencies = [];
