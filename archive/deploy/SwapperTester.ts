import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getNamedAccounts } from "hardhat";
import { wrappedDeploy } from "../utilities";
import { Constants } from "../test/constants";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();

  await wrappedDeploy("SwapperTesterV1", {
    from: deployer,
    args: [Constants.mainnet.mim, Constants.mainnet.degenBox],
    log: true,
    contract: "SwapperTester",
    deterministicDeployment: false,
  });
};

export default deployFunction;

deployFunction.tags = [];
deployFunction.dependencies = [];
