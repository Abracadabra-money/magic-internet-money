import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers, network } from "hardhat";
import { ChainId } from "../utilities";
import { DegenBox } from "../typechain";

const DEGENBOX = "0xe56F37Ef2e54ECaA41a9675da1c3445736d60B42";
const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
const CROFESSORS = "0x6e01680531192aa46c7F4936201F55Da2c31dd44";

// This is a fix to the master contract and the one pair we had deployed at
// the time. If you reuse this as a template, take out the master contract
// deployment and replace it with a hardcoded address.

const deployFunction: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  // Master contract
  const nftPair = await deploy("NFTPairV2", {
    contract: "NFTPair",
    from: deployer,
    args: [DEGENBOX],
    log: true,
    deterministicDeployment: false,
  });
  const degenBox = await ethers.getContractAt<DegenBox>("DegenBox", DEGENBOX);

  // TODO: Do this as the Degenbox owner:
  // await degenBox.whitelistMasterContract(nftPair.address, true);

  // Pairs - deployed by the DegenBox:
  const degenDeploy = async (name, masterAddress, initData) => {
    try {
      await deployments.get(name);
      console.log("Degenbox: already found", name);
      return;
    } catch {}
    console.log("Degenbox: trying to deploy", name);
    const deployTx = await degenBox.deploy(masterAddress, initData, false).then((tx) => tx.wait());
    for (const e of deployTx.events || []) {
      if (e.eventSignature == "LogDeploy(address,bytes,address)") {
        const address = e.args!.cloneAddress;
        console.log("DegenBox deployment:", name, "at", address);
        await deployments.save(name, {
          abi: [],
          address,
        });
        return address;
      }
    }
    throw new Error("Failed to either find or execute deployment");
  };

  await degenDeploy(
    "FemaleCrofessorWMaticPairV2",
    nftPair.address,
    ethers.utils.defaultAbiCoder.encode(["address", "address"], [CROFESSORS, WMATIC])
  );
};

export default deployFunction;

if (network.name !== "hardhat" || process.env.HARDHAT_LOCAL_NODE) {
  deployFunction.skip = ({ getChainId }) =>
    new Promise((resolve, reject) => {
      try {
        getChainId().then((chainId) => {
          resolve(parseInt(chainId, 10) != ChainId.Polygon);
        });
      } catch (error) {
        reject(error);
      }
    });
}

deployFunction.tags = ["NFTPairContractsV2"];
deployFunction.dependencies = [];
