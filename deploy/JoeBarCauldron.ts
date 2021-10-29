import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { BentoBoxV1 } from "../typechain";
import { DeploymentSubmission } from "hardhat-deploy/dist/types";
import { expect } from "chai";

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Deploy xJoe Cauldron using BentoBox
  // if we need to use DegenBox instead the CauldronV2 mastercontract needs to
  // be whitelisted
  const BentoBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0xf4F46382C2bE1603Dc817551Ff9A7b333Ed1D18f");
  const CauldronV2MasterContract = "0xc568a699c5B43A0F1aE40D3254ee641CB86559F4"; // CauldronV2

  const collateral = "0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33"; // xJoe
  const oracle = "0xf33Eb640773827AFBbB886Fa2d60B071d51D2D85"; // xJoeOracle
  const oracleData = "0x0000000000000000000000000000000000000000";

  // Same parameters as SushiBar CauldronV2 on Ethereum
  const interest = "158440439";
  const liquidation = "105000";
  const collateralization = "85000";
  const opening = "500";

  let initData = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
    [collateral, oracle, oracleData, interest, liquidation, collateralization, opening]
  );
  const tx = await (await BentoBox.deploy(CauldronV2MasterContract, initData, true)).wait();

  const deployEvent = tx?.events?.[0];
  expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

  deployments.save("JoeBarCauldron", {
    abi: [],
    address: deployEvent?.args?.cloneAddress,
  });

  await deploy("XJoeSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });

  await deploy("XJoeLevSwapper", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
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

deployFunction.tags = ["JoeBarCauldron"];
deployFunction.dependencies = [];
