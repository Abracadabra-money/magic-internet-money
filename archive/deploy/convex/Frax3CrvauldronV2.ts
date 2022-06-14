import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { expect } from "chai";
import { xMerlin } from "../test/constants";
import { BentoBoxV1, CauldronV2Checkpoint, IConvexStakingWrapperAbra, IConvexStakingWrapperAbraFactory, ProxyOracle } from "../typechain";
import { Frax3CrvOracle } from "../typechain/Frax3CrvOracle";

// List of supported chains to deploy on
const supportedChains = [ChainId.Mainnet, ChainId.Fantom, ChainId.BSC];

export const ParametersPerChain = {
  [ChainId.Mainnet]: {
    bentoBox: "0xF5BCE5077908a1b7370B9ae04AdC565EBd643966",
    CauldronV2CheckpoinMasterContract: "0x1DF188958A8674B5177f77667b8D173c3CdD9e51",
    curveToken: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B", // frax3crv
    convexToken: "0xbE0F6478E0E4894CFb14f32855603A083A57c7dA", // cvxFRAX3CRV-f
    convexPool: "0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e",
    proxyOracle: "0x66a809a31E6909C835219cC09eA0f52135fF0a11",

    convextStakingWrapperAbraProxy: "0xb24BE15aB68DC8bC5CC62183Af1eBE9Ecd043250",
    //convextStakingWrapperAbraImpl: "0xD379454E9f28302A3bbE92b271605cbEA5aEa0A2",
    //convextStakingWrapperAbraFactory: "0x66807B5598A848602734B82E432dD88DBE13fC8f",

    convexPoolId: 32,
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

  // 90% LTV .5% initial 1% Interest, 1.5% fee
  const maximumCollateralRatio = 90 * 1e3; // 85% LTV
  const liquidationFee = 1.5 * 1e3 + 1e5; // 8% fee
  const borrowFee = 0.5 * OPENING_CONVERSION; // .5% initial
  const interest = parseInt(String(1 * INTEREST_CONVERSION)); // 1% Interest

  const ConvexStakingWrapperAbra = await ethers.getContractAt<IConvexStakingWrapperAbra>("IConvexStakingWrapperAbra", parameters.convextStakingWrapperAbraProxy);

  // Cauldron
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", parameters.bentoBox);
  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [ConvexStakingWrapperAbra.address, parameters.proxyOracle, parameters.oracleData, interest, liquidationFee, maximumCollateralRatio, borrowFee]
  );
  const tx = await (await BentoBox.deploy(parameters.CauldronV2CheckpoinMasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  // Register the deployment so it's available within the test using `getContract`
  deployments.save("Frax3CrvCauldron", {
    abi: require("../abi/CauldronV2Checkpoint.json"),
    address: deployEvent?.args?.cloneAddress,
  });

  // Liquidation Swapper
  await deploy("StkFrax3CrvSwapper", {
    from: deployer,
    args: [ConvexStakingWrapperAbra.address],
    log: true,
    deterministicDeployment: false,
  });

  // Leverage Swapper
  await deploy("StkFrax3CrvLevSwapper", {
    from: deployer,
    args: [ConvexStakingWrapperAbra.address],
    log: true,
    deterministicDeployment: false,
  });

  const Frax3CrvCauldron = await ethers.getContract<CauldronV2Checkpoint>("Frax3CrvCauldron");

  await (await ConvexStakingWrapperAbra.initialize(
    parameters.curveToken,
    parameters.convexToken,
    parameters.convexPool,
    parameters.convexPoolId,
    Frax3CrvCauldron.address
  )).wait();

  if ((await ConvexStakingWrapperAbra.owner()) !== xMerlin) {
    await (await ConvexStakingWrapperAbra.transferOwnership(xMerlin)).wait();
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

deployFunction.tags = ["Frax3CrvCauldron"];
deployFunction.dependencies = [];
