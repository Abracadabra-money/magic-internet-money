import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { expect } from "chai";
import { xMerlin } from "../test/constants";
import { DegenBox, CauldronV2Checkpoint, CurveVoter, IConvexStakingWrapperAbra, IConvexStakingWrapperAbraFactory, MagicCRV, ProxyOracle, MagicCRVOracle } from "../typechain";
import { Frax3CrvOracle } from "../typechain/Frax3CrvOracle";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    degenBox: "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce",
    oracleData: "0x0000000000000000000000000000000000000000"
  },
};

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const chainId = await hre.getChainId();
  const parameters = ParametersPerChain[parseInt(chainId)];

  const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
  const OPENING_CONVERSION = 1e5 / 100;

  // 80% LTV 1% borrow fee 1% Interest, 1.5% liquidation fee
  const maximumCollateralRatio = 80 * 1e3; // 80% LTV
  const liquidationFee = 1.5 * 1e3 + 1e5; // 1.5% liquidation fee
  const borrowFee = 1 * OPENING_CONVERSION; // 1% borrow fee
  const interest = parseInt(String(1 * INTEREST_CONVERSION)); // 1% Interest

  // change the `getContracAt` once MagicCRV is deployed
  const MagicCRV = await ethers.getContract<MagicCRV>("MagicCRV");

  const CauldronV2CheckpointMC = await ethers.getContract<CauldronV2Checkpoint>("DegenBoxCauldronV2Checkpoint");

  // Proxy Oracle
  await deploy("MagicCRVProxyOracle", {
    from: deployer,
    args: [],
    log: true,
    contract: "ProxyOracle",
    deterministicDeployment: false,
  });

  // Oracle Implementation
  await deploy("MagicCRVOracle", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  const ProxyOracle = await ethers.getContract<ProxyOracle>("MagicCRVProxyOracle");

  // Cauldron
  const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", parameters.degenBox);
  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [MagicCRV.address, ProxyOracle.address, parameters.oracleData, interest, liquidationFee, maximumCollateralRatio, borrowFee]
  );

  const tx = await (await DegenBox.deploy(CauldronV2CheckpointMC.address, initData, true)).wait();
  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  // Register the deployment so it's available within the test using `getContract`
  deployments.save("MagicCRVCauldron", {
    abi: require("../abi/CauldronV2Checkpoint.json"),
    address: deployEvent?.args?.cloneAddress,
  });

  /*// Liquidation Swapper
  await deploy("MagicCRVSwapper", {
    from: deployer,
    args: [MagicCRV.address],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await deploy("MagicCRVLevSwapper", {
    from: deployer,
    args: [MagicCRV.address],
    log: true,
    deterministicDeployment: false,
  });*/

  const MagicCRVCauldron = await ethers.getContract<CauldronV2Checkpoint>("MagicCRVCauldron");
  const CurveVoter = await ethers.getContract<CurveVoter>("CurveVoter");
  const MagicCRVOracle = await ethers.getContract<MagicCRVOracle>("MagicCRVOracle");

  await (await MagicCRV.addCauldron(MagicCRVCauldron.address)).wait();

  if ((await ProxyOracle.oracleImplementation()) !== MagicCRVOracle.address) {
    await (await ProxyOracle.changeOracleImplementation(MagicCRVOracle.address)).wait();
  }
  
  if(network.name != "hardhat") {
    if ((await MagicCRV.owner()) !== xMerlin) {
      await(await MagicCRV.transferOwnership(xMerlin)).wait();
    }
    if ((await CurveVoter.owner()) != xMerlin) {
      await(await CurveVoter.transferOwnership(xMerlin)).wait();
    }
    if ((await ProxyOracle.owner()) != xMerlin) {
      await(await ProxyOracle.transferOwnership(xMerlin, true, false)).wait();
    }
  }
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

deployFunction.tags = ["MagicCRVCauldron"];
deployFunction.dependencies = ["DegenBoxCauldronV2Checkpoint", "MagicCRV"];
