import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { MagicCRV } from "../typechain";
import { ChainId, setDeploymentSupportedChains } from "../utilities";
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

  await deploy("MagicCRV", {
    from: deployer,
    args: [
      CurveVoter.address
    ],
    log: true,
    deterministicDeployment: false,
  });

  const MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");
  await CurveVoter.setMagicCRV(MagicCRV.address);
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["MagicCRV"];
deployFunction.dependencies = [];
