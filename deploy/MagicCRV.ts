import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { CRVLocker, EthereumWithdrawer, MagicCRV } from "../typechain";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
import { xMerlin } from "../test/constants";
import { CurveVoter } from "../typechain/CurveVoter";

const ParametersPerChain = {
  [ChainId.Mainnet]: {},
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  await deploy("CurveVoter", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
  const CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");

  await deploy("CRVLocker", {
    from: deployer,
    args: [CurveVoter.address],
    log: true,
    deterministicDeployment: false,
  });
  const CRVLocker = await ethers.getContract<CRVLocker>("CRVLocker");
  await CurveVoter.setCRVLocker(CRVLocker.address);

  await deploy("MagicCRV", {
    from: deployer,
    args: [
      CurveVoter.address,
      CRVLocker.address
    ],
    log: true,
    deterministicDeployment: false,
  });

  const MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");

  if(network.name !== "hardhat") {
    if ((await CRVLocker.owner()) != xMerlin) {
      await CRVLocker.transferOwnership(xMerlin);
    }
    if ((await CurveVoter.owner()) != xMerlin) {
      await CurveVoter.transferOwnership(xMerlin);
    }
    if ((await MagicCRV.owner()) != xMerlin) {
      await MagicCRV.transferOwnership(xMerlin);
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MagicCRV"];
deployFunction.dependencies = [];
