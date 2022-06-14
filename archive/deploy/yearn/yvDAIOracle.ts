import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import { ChainId, wrappedDeploy } from "../utilities";

const supportedChains = [ChainId.Mainnet];

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  await wrappedDeploy("YVDAIOracleV1", {
    from: deployer,
    args: [],
    log: true,
    contract: "YVDAIOracle",
    deterministicDeployment: false,
  });
};

export default deployFunction;

if (network.name !== "hardhat") {
  deployFunction.skip = ({ getChainId }) =>
    new Promise(async (resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(supportedChains.indexOf(parseInt(chainId)) === -1);
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["yvDAIOracle"];
deployFunction.dependencies = [];
