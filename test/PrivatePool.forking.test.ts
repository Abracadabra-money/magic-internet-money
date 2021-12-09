import {
  ethers,
  network,
  deployments,
  getNamedAccounts,
  artifacts,
} from "hardhat";
import { expect } from "chai";
import { BigNumberish, Signer } from "ethers";
import _ from "lodash";

import { advanceTime, getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, PrivatePool } from "../typechain";

import { WETH9, USDC } from "./constants.mainnet";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const WETH_WHALE = '0x6555e1CC97d3cbA6eAddebBCD7Ca51d75771e0B8';
const USDC_WHALE = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
const GENERAL_WHALE = '0x84D34f4f83a87596Cd3FB6887cFf8F17Bf5A7B83';

const initTypes = {
  collateral: "address",
  asset: "address",
  oracle: "address",
  oracleData: "bytes",
  lender: "address",
  borrowers: "address[]",
  INTEREST_PER_SECOND: "uint64",
  NO_LIQUIDATIONS_BEFORE: "uint64",
  COLLATERALIZATION_RATE_BPS: "uint16",
  LIQUIDATION_MULTIPLIER_BPS: "uint16",
  BORROW_OPENING_FEE_BPS: "uint16",
  LIQUIDATION_SEIZE_COLLATERAL: "bool",
};
const typeDefaults = {
  address: ZERO_ADDR,
  "address[]": [],
  bytes: "",
};
// These rely on JS/TS iterating over the keys in the order they were defined:
const initTypeString = _.map(initTypes, (t, name) => `${t} ${name}`).join(", ");
const encodeInitData = (kvs) =>
  ethers.utils.defaultAbiCoder.encode(
    [`tuple(${initTypeString})`],
    [_.mapValues(initTypes, (t, k) => kvs[k] || typeDefaults[t] || 0)]
  );

const getSignerFor = async (addr) => {
  await impersonate(addr);
  return ethers.getSigner(addr);
};

describe("Private Lending Pool - Forked Mainnet", async () => {
  if (process.env.FORKING !== 'true') { return; }
  let snapshotId;
  let masterContract: PrivatePool;
  let bentoBox: BentoBoxV1;
  let pairContract: PrivatePool;
  let wethWhale: Signer;
  let usdcWhale: Signer;
  let generalWhale: Signer;


  const deployPair = async (initSettings) => {
    const deployTx = await bentoBox
      .deploy(masterContract.address, encodeInitData(initSettings), false)
      .then((tx) => tx.wait());
    const [deployEvent] = deployTx.events;
    expect(deployEvent.eventSignature).to.equal(
      "LogDeploy(address,bytes,address)"
    );
    const { cloneAddress } = deployEvent.args;
    return ethers.getContractAt<PrivatePool>("PrivatePool", cloneAddress);
  };

  before(async () => {
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl:
              process.env.ETHEREUM_RPC_URL ||
              `https://eth-mainnet.alchemyapi.io/v2/${alchemyKey}`,
            blockNumber: 13715035,
          },
        },
      ],
    });

    await deployments.fixture(["PrivatePool"]);
    masterContract = await ethers.getContract<PrivatePool>("PrivatePool");
    bentoBox = await ethers.getContractAt<BentoBoxV1>(
      "BentoBoxV1",
      await masterContract.bentoBox()
    );

    const sevenPercentAnnually = getBigNumber(7).div(100 * 3600 * 24 * 365);
    pairContract = await deployPair({
      lender: USDC_WHALE,
      borrowers: [WETH_WHALE, GENERAL_WHALE],
      asset: USDC,
      collateral: WETH9,
      INTEREST_PER_SECOND: sevenPercentAnnually,
      COLLATERALIZATION_RATE_BPS: 7500,
      LIQUIDATION_MULTIPLIER_BPS: 11200,
      BORROW_OPENING_FEE_BPS: 10,
    });

    snapshotId = await ethers.provider.send("evm_snapshot", []);

    wethWhale = await getSignerFor(WETH_WHALE);
    usdcWhale = await getSignerFor(WETH_WHALE);
    generalWhale = await getSignerFor(GENERAL_WHALE);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  describe("Deploy", async () => {
    it("Should deploy", async () => {
      expect(await pairContract.lender()).to.equal(USDC_WHALE);
      for (const addr of [GENERAL_WHALE, WETH_WHALE]) {
        expect(await pairContract.approvedBorrowers(addr)).to.equal(true);
      }
      expect(await pairContract.approvedBorrowers(USDC_WHALE)).to.equal(false);
    });

    it("Should reject bad settings", async () => {
      await expect(
        deployPair({
          collateral: ZERO_ADDR,
        })
      ).to.be.revertedWith("PrivatePool: bad pair");

      await expect(
        deployPair({
          collateral: WETH9,
          LIQUIDATION_MULTIPLIER_BPS: 9_999,
        })
      ).to.be.revertedWith("PrivatePool: negative liquidation bonus");

      await expect(
        deployPair({
          collateral: WETH9,
          LIQUIDATION_MULTIPLIER_BPS: 10_000,
          COLLATERALIZATION_RATE_BPS: 10_001,
        })
      ).to.be.revertedWith("PrivatePool: bad collateralization rate");
    });

    it("Should refuse to initialize twice", async () => {
      await expect(pairContract.init(encodeInitData({}))).to.be.revertedWith(
        "PrivatePool: already initialized"
      );
    });
  });
});
