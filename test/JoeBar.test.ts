/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { CauldronV2, ERC20 } from "../typechain";
import { expect } from "chai";

const XJOE_WHALE = "0xf3537ac805e1ce18AA9F61A4b1DCD04F10a007E9";
const XJOE = "0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33";

describe("xJoe Cauldron", async () => {
  let snapshotId;
  let Cauldron: CauldronV2;
  let XJoe: ERC20;
  let deployerSigner;
  let aliceSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 6264607,
          },
        },
      ],
    });

    await deployments.fixture(["JoeBarCauldron"]);
    const { deployer, alice } = await getNamedAccounts();

    aliceSigner = await ethers.getSigner(alice);
    deployerSigner = await ethers.getSigner(deployer);

    // JoeBarCauldron deployment doesn't have the abi,
    // just use the address to get CauldronV2 from it instead.
    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("JoeBarCauldron")).address);
    XJoe = await ethers.getContractAt<ERC20>("ERC20", XJOE);

    await impersonate(XJOE_WHALE);
    const whaleSigner = await ethers.getSigner(XJOE_WHALE);
    await XJoe.connect(whaleSigner).transfer(alice, getBigNumber(500_000));

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);

    expect(await Cauldron.collateral()).to.eq(XJOE);
    expect(await Cauldron.oracle()).to.eq("0xf33Eb640773827AFBbB886Fa2d60B071d51D2D85");
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");

    const accrueInfo = await Cauldron.accrueInfo();
    expect(accrueInfo.INTEREST_PER_SECOND).to.eq("158440439");

    expect(await Cauldron.LIQUIDATION_MULTIPLIER()).to.eq("105000");
    expect(await Cauldron.COLLATERIZATION_RATE()).to.eq("85000");
    expect(await Cauldron.BORROW_OPENING_FEE()).to.eq("500");
  });
});
