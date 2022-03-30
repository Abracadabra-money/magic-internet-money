/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, UsdcAvaxLevSwapper, UsdcAvaxSwapper } from "../typechain";
import { expect } from "chai";

// Top holders at the given fork block
const MIM_WHALE = "0xcbb424fd93cdec0ef330d8a8c985e8b147f62339";
const USDCAVAX_LP_WHALE = "0xd6a4f121ca35509af06a0be99093d08462f53052";

describe("Lev/Liquidation UsdcAvax Swappers", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let USDCAVAX: ERC20Mock;
  let UsdcAvaxSwapper: UsdcAvaxSwapper;
  let UsdcAvaxLevSwapper: UsdcAvaxLevSwapper;
  let DegenBox: DegenBox;
  let mimShare;
  let usdcAvaxShare;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 10758037,
          },
        },
      ],
    });
    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());

    await deployments.fixture(["PopsicleUsdcWavax"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    UsdcAvaxSwapper = await ethers.getContract<UsdcAvaxSwapper>("PopsicleUsdcAvaxSwapper");
    UsdcAvaxLevSwapper = await ethers.getContract<UsdcAvaxLevSwapper>("PopsicleUsdcAvaxLevSwapper");
    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4");
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    USDCAVAX = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1");

    await impersonate(MIM_WHALE);
    await impersonate(USDCAVAX_LP_WHALE);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const usdcAvaxWhaleSigner = await ethers.getSigner(USDCAVAX_LP_WHALE);

    // Deposit USDCAVAX lp in DegenBox for UsdcAvaxSwapper
    usdcAvaxShare = await DegenBox.toShare(MIM.address, getBigNumber(2), true);
    await USDCAVAX.connect(usdcAvaxWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(usdcAvaxWhaleSigner).deposit(USDCAVAX.address, USDCAVAX_LP_WHALE, UsdcAvaxSwapper.address, 0, usdcAvaxShare);

    // Deposit MIM in DegenBox for UsdcAvaxLevSwapper
    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(500_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, UsdcAvaxLevSwapper.address, 0, mimShare);

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should liquidate the USDC/AVAX collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountUsdcAvaxBefore = (await DegenBox.totals(USDCAVAX.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await UsdcAvaxSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, usdcAvaxShare);

    const amountUsdcAvaxAfter = (await DegenBox.totals(USDCAVAX.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${(amountMimAfter.sub(amountMimBefore)).toString()} MIM from Liquidation Swapper`);

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountUsdcAvaxAfter).to.be.lt(amountUsdcAvaxBefore);
  });

  it("should swap MIM for USDC/AVAX and deposit back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountUsdcAvaxBefore = (await DegenBox.totals(USDCAVAX.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await UsdcAvaxLevSwapper.swap(alice, 0, mimShare);

    const amountUsdcAvaxAfter = (await DegenBox.totals(USDCAVAX.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(`Got ${(amountUsdcAvaxAfter.sub(amountUsdcAvaxBefore)).toString()} USDC/AVAX from Leverage Swapper`);

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountUsdcAvaxAfter).to.be.gt(amountUsdcAvaxBefore);
  });
});
