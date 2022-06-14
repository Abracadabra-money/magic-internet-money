import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { network } from "hardhat";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { xMerlin } from "../test/constants";
import { CurveVoter, MagicCRV, RewardHarvester } from "../typechain";

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

  const MagicCRV = await wrappedDeploy<MagicCRV>("MagicCRV", {
    from: deployer,
    args: [CurveVoter.address],
    log: true,
    deterministicDeployment: false,
  });

  const RewardHarvester = await wrappedDeploy<RewardHarvester>("RewardHarvester", {
    from: deployer,
    args: [CurveVoter.address],
    log: true,
    deterministicDeployment: false,
  });

  await CurveVoter.setMagicCRV(MagicCRV.address);
  await CurveVoter.setHarvester(RewardHarvester.address);

  if (network.name !== "hardhat") {
    await (await RewardHarvester.setAllowedHarvester(xMerlin, true)).wait();

    if ((await CurveVoter.owner()) != xMerlin) {
      await (await CurveVoter.transferOwnership(xMerlin)).wait();
    }
    if ((await RewardHarvester.owner()) != xMerlin) {
      await (await RewardHarvester.transferOwnership(xMerlin)).wait();
    }
    
  } else {
    await (await RewardHarvester.setAllowedHarvester(deployer, true)).wait();
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MagicCRV"];
deployFunction.dependencies = [];
