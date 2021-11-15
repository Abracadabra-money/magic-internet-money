/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, IERC20, UsdcAvaxLevSwapper, UsdcAvaxSwapper } from "../typechain";
import { expect } from "chai";

// Top holders at the given fork block
const MIM_WHALE = "0x27C215c8b6e39f54C42aC04EB651211E9a566090";
const USDCAVAX_LP_WHALE = "0xd6a4F121CA35509aF06A0Be99093d08462f53052";

describe("Lev/Liquidation UsdcAvax Swappers", async () => {
  let snapshotId;
  let MIM: IERC20;
  let USDCAVAX: IERC20;
  let UsdcAvaxSwapper: UsdcAvaxSwapper;
  let UsdcAvaxLevSwapper: UsdcAvaxLevSwapper;
  let DegenBox: BentoBoxV1;
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
            blockNumber: 5886381,
          },
        },
      ],
    });

    await deployments.fixture(["UsdcAvaxSwappers"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    UsdcAvaxSwapper = await ethers.getContract<UsdcAvaxSwapper>("UsdcAvaxSwapper");
    UsdcAvaxLevSwapper = await ethers.getContract<UsdcAvaxLevSwapper>("UsdcAvaxLevSwapper");
    DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0x1fC83f75499b7620d53757f0b01E2ae626aAE530");
    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    USDCAVAX = await ethers.getContractAt<IERC20>("ERC20", "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1");

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

    //console.log(`Got ${(amountMimAfter.sub(amountMimBefore)).toString()} MIM from Liquidation Swapper`);

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

    //console.log(`Got ${(amountUsdcAvaxAfter.sub(amountUsdcAvaxBefore)).toString()} USDC/AVAX from Leverage Swapper`);

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountUsdcAvaxAfter).to.be.gt(amountUsdcAvaxBefore);
  });
});
