import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";

const DEGENBOX = "0xe56F37Ef2e54ECaA41a9675da1c3445736d60B42";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Master contract
  const nftPair = await deploy("NFTPair", {
    contract: "NFTPair",
    from: deployer,
    args: [DEGENBOX],
    log: true,
    deterministicDeployment: false,
  });
  const nftPairWithOracle = await deploy("NFTPairWithOracle", {
    contract: "NFTPairWithOracle",
    from: deployer,
    args: [DEGENBOX],
    log: true,
    deterministicDeployment: false,
  });

  // TODO: Do this as the Degenbox owner:
  // await bentoBox.whitelistMasterContract(nftPair.address, true);
  // await bentoBox.whitelistMasterContract(nftPairWithOracle.address, true);
};

export default deployFunction;

if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(parseInt(chainId, 10) != ChainId.Polygon);
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["NFTPairContracts"];
deployFunction.dependencies = [];
