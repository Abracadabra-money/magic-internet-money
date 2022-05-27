import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { AggregatorV3Interface, IAggregator, InvertedLPOracle, ProxyOracle } from "../typechain";
import { Constants, xMerlin } from "../test/constants";
import { ChainId, setDeploymentSupportedChains, wrappedDeploy } from "../utilities";

export const ParametersPerChain = {
  [ChainId.Fantom]: {},
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();

  const ProxyOracle = await wrappedDeploy<ProxyOracle>("fUSDTUSDCSpiritProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  // Gives the price of 1 USDC in USDT
  const fUSDTUSDCOracle = await wrappedDeploy<AggregatorV3Interface>("fUSDTUSDCOracleV1", {
    from: deployer,
    args: [Constants.fantom.chainlink.usdc, Constants.fantom.chainlink.usdt],
    log: true,
    contract: "TokenOracle",
    deterministicDeployment: false,
  });

  // Gives the price of 1 LP in USDT
  const LPChainlinkOracle = await wrappedDeploy<IAggregator>("fUSDTUSDCSpiritChainlinkOracleV1", {
    from: deployer,
    args: [Constants.fantom.spiritswap.fUSDTUSDC, fUSDTUSDCOracle.address],
    contract: "LPChainlinkOracle",
    log: true,
    deterministicDeployment: false,
  });

  // Gives how much LP 1 USD can buy
  const fUSDTUSDCLPOracle = await wrappedDeploy<InvertedLPOracle>("fUSDTUSDCSpiritInvertedLPOracle", {
    from: deployer,
    args: [LPChainlinkOracle.address, Constants.fantom.chainlink.usdt, "Spirit USDC/fUSDT"],
    log: true,
    contract: "InvertedLPOracle",
    deterministicDeployment: false,
  });

  if ((await ProxyOracle.oracleImplementation()) !== fUSDTUSDCLPOracle.address) {
    await ProxyOracle.changeOracleImplementation(fUSDTUSDCLPOracle.address);
  }
  if ((await ProxyOracle.owner()) !== xMerlin) {
    await ProxyOracle.transferOwnership(xMerlin, true, false);
  }
};

export default deployFunction;

setDeploymentSupportedChains(Object.keys(ParametersPerChain), deployFunction);

deployFunction.tags = ["fUSDTUSDCSpiritOracles"];
deployFunction.dependencies = [];
