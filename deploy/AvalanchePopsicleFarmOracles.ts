import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ProxyOracle } from "../typechain";
import { PopsicleMultisig } from "../test/constants";

export const oracles = [
  // 0: deployment basename (without spaces)
  // 1: oracle name, ex: "Pangolin USDC.e/WAVAX"
  // 2: lp address
  // 3: lp price denominator aggregator address
  // 4: lp oracle contract name reporting in USD (optional)
  [
    "PangolinUsdceUsdte",
    "Pangolin USDC.e/USDT.e",
    "0xc13e562d92f7527c4389cd29c67dabb0667863ea", // Pangolin USDC.e/USDT.e pair address
    "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a", // USDT/USD chainlink oracle
    null,
  ],
];

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  for (let i = 0; i < oracles.length; i++) {
    const [basename, desc, pair, denominatorOracle, usdOracleContractName] = oracles[i];

    const proxyOracleDeploymentName = `${basename}ProxyOracle`;
    const nativeLpOracleDeploymentName = `${basename}LPChainlinkOracle`;

    await deploy(proxyOracleDeploymentName, {
      from: deployer,
      args: [],
      log: true,
      contract: "ProxyOracle",
      deterministicDeployment: false,
    });

    await deploy(nativeLpOracleDeploymentName, {
      from: deployer,
      args: [pair, denominatorOracle, desc],
      contract: "LPChainlinkOracleV1",
      log: true,
      deterministicDeployment: false,
    });

    let LPOracleImplementaion = await ethers.getContract(nativeLpOracleDeploymentName);

    if (usdOracleContractName) {
      const usdLpOracleDeploymentName = `${basename}LpUsdOracle`;
      await deploy(usdLpOracleDeploymentName, {
        from: deployer,
        args: [LPOracleImplementaion.address, desc],
        log: true,
        contract: usdOracleContractName,
        deterministicDeployment: false,
      });
      LPOracleImplementaion = await ethers.getContract(usdLpOracleDeploymentName);
    }

    const ProxyOracle = await ethers.getContract<ProxyOracle>(proxyOracleDeploymentName);

    if ((await ProxyOracle.oracleImplementation()) !== LPOracleImplementaion.address) {
      await (await ProxyOracle.changeOracleImplementation(LPOracleImplementaion.address)).wait();
    }
    if ((await ProxyOracle.owner()) !== PopsicleMultisig) {
      await (await ProxyOracle.transferOwnership(PopsicleMultisig, true, false)).wait();
    }
  }
};

export default deployFunction;

if (network.name !== "hardhat") {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(chainId !== "43114");
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["AvalanchePopsicleFarmOracles"];
deployFunction.dependencies = [];
