import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ChainId, deployCauldron, deployLPOracle, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";
import { Constants, xMerlin } from "../test/constants";
import { getNamedAccounts, network } from "hardhat";

// List of supported chains to deploy on
export const ParametersPerChain = {
  [ChainId.Avalanche]: {

  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const chainId = await hre.getChainId();

  const ProxyOracle = await deployLPOracle(
    "TraderJoeWAVAXUSDC",
    "TraderJoe wAVAX/USDC",
    Constants.avalanche.traderjoe.wavaxUsdc,
    Constants.avalanche.chainlink.wavax,
    Constants.avalanche.chainlink.usdc,
    deployer
  );

  if (network.name !== "hardhat") {
    if ((await ProxyOracle.owner()) !== xMerlin) {
      await (await ProxyOracle.transferOwnership(xMerlin, true, false)).wait();
    }
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["WavaxUsdcJoeLPOracle"];
deployFunction.dependencies = [];
