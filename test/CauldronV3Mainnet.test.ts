/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ProxyOracle } from "../typechain";
import { expect } from "chai";
import { CauldronV3 } from "../typechain/CauldronV3";
import { Constants } from "./constants";

// stkFrax3Crv
const collateral = "0xb24BE15aB68DC8bC5CC62183Af1eBE9Ecd043250";

describe("CauldronV3", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let Cauldron: CauldronV3;
  let DegenBox: DegenBox;
  let CauldronV3MasterContract: CauldronV3;

  const deployCauldronProxy = async (): Promise<CauldronV3> => {
    const INTEREST_CONVERSION = 1e18 / (365.25 * 3600 * 24) / 100;
    const OPENING_CONVERSION = 1e5 / 100;

    // 85% LTV .5% initial 3% Interest, 8% fee
    const collateralization = 85 * 1e3; // 85% LTV
    const opening = 0.5 * OPENING_CONVERSION; // .5% initial
    const interest = parseInt(String(3 * INTEREST_CONVERSION)); // 3% Interest
    const liquidation = 8 * 1e3 + 1e5; // 8% fee

    const DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", Constants.mainnet.degenBox);

    // get a random proxy oracle for testing (Frax3Crv)
    const ProxyOracle = await ethers.getContractAt<ProxyOracle>("ProxyOracle", "0x66a809a31E6909C835219cC09eA0f52135fF0a11");

    let initData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "bytes", "uint64", "uint256", "uint256", "uint256"],
      [collateral, ProxyOracle.address, ethers.constants.AddressZero, interest, liquidation, collateralization, opening]
    );

    const tx = await (await DegenBox.deploy(CauldronV3MasterContract.address, initData, true)).wait();
    const deployEvent = tx?.events?.[0];
    expect(deployEvent?.eventSignature).to.be.eq("LogDeploy(address,bytes,address)");

    return ethers.getContractAt<CauldronV3>("CauldronV3", deployEvent?.args?.cloneAddress);
  };

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            blockNumber: 14535616,
          },
        },
      ],
    });

    hre.getChainId = () => Promise.resolve(ChainId.Mainnet.toString());
    await deployments.fixture(["CauldronV3MasterContractMainnet"]);

    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", Constants.mainnet.degenBox);
    CauldronV3MasterContract = await ethers.getContract<CauldronV3>("CauldronV3MasterContractMainnet");

    // whitelist to degenbox
    const degenBoxOwner = await DegenBox.owner();
    await impersonate(degenBoxOwner);
    const degenBoxOwnerSigner = await ethers.getSigner(degenBoxOwner);

    // deploy dummy cauldronv3 proxy contract
    Cauldron = await deployCauldronProxy();

    await DegenBox.connect(degenBoxOwnerSigner).whitelistMasterContract(CauldronV3MasterContract.address, true);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should", async () => {});
});
