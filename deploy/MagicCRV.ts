import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { MagicCRV } from "../typechain";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { CurveVoter } from "../typechain/CurveVoter";
import { xMerlin } from "../test/constants";

const ParametersPerChain = {
  [ChainId.Mainnet]: {},
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const CurveVoter = await wrappedDeploy<CurveVoter>("CurveVoter", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const MagicCRV = await wrappedDeploy("MagicCRV", {
    from: deployer,
    args: [CurveVoter.address],
    log: true,
    deterministicDeployment: false,
  });

  const RewardHarvester = await wrappedDeploy("RewardHarvester", {
    from: deployer,
    args: [CurveVoter.address],
    log: true,
    deterministicDeployment: false,
  });

  await CurveVoter.setMagicCRV(MagicCRV.address);
  await CurveVoter.setHarvester(RewardHarvester.address);

  if (network.name !== "hardhat") {
    if ((await CurveVoter.owner()) != xMerlin) {
      await CurveVoter.transferOwnership(xMerlin);
    }
    if ((await RewardHarvester.owner()) != xMerlin) {
      await RewardHarvester.transferOwnership(xMerlin);
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MagicCRV"];
deployFunction.dependencies = [];
