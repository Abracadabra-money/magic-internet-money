/* eslint-disable prefer-const */
import { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { getBigNumber, impersonate } from "../utilities";
import { BentoBoxV1, CauldronV2, IERC20, IOracle, UsdcAvaxLevSwapper, UsdcAvaxSwapper } from "../typechain";
import { expect } from "chai";

// Top holders at the given fork block
const MIM_WHALE = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const PLP_WHALE = "0x3c1cb7d4c0ce0dc72edc7ea06acc866e62a8f1d8";

describe("Popsicle USDC/WETH Cauldron", async () => {
  let snapshotId;
  let MIM: IERC20;
  let PLP: IERC20;
  let Cauldron: CauldronV2;
  let Oracle: IOracle;
  let PLPSwapper: UsdcAvaxSwapper;
  let PLPLevSwapper: UsdcAvaxLevSwapper;
  let DegenBox: BentoBoxV1;
  let mimShare;
  let plpShare;
  let deployerSigner;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ETHEREUM_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            blockNumber: 13545300,
          },
        },
      ],
    });

    await deployments.fixture(["PopsicleUSDCWETH"]);
    const { deployer } = await getNamedAccounts();
    deployerSigner = await ethers.getSigner(deployer);

    Cauldron = await ethers.getContractAt<CauldronV2>("CauldronV2", (await ethers.getContract("PopsicleUSDCWETHCauldron")).address);
    Oracle = await ethers.getContract<IOracle>("PopsicleUSDCWETHOracle");
    DegenBox = await ethers.getContractAt<BentoBoxV1>("BentoBoxV1", "0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce");
    MIM = await ethers.getContractAt<IERC20>("ERC20", "0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3");
    PLP = await ethers.getContractAt<IERC20>("ERC20", "0x51aEA310a8FFF21c09Eee4594F3dA396209Bd398");
    //PLPSwapper = await ethers.getContract<UsdcAvaxSwapper>("UsdcAvaxSwapper");
    //PLPLevSwapper = await ethers.getContract<UsdcAvaxLevSwapper>("UsdcAvaxLevSwapper");

    await impersonate(MIM_WHALE);
    await impersonate(PLP_WHALE);

    const mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    const plpWhaleSigner = await ethers.getSigner(PLP_WHALE);

    /*// Deposit USDCAVAX lp in DegenBox for PLPSwapper
    plpShare = await DegenBox.toShare(MIM.address, getBigNumber(2), true);
    await PLP.connect(plpWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(plpWhaleSigner).deposit(PLP.address, PLP_WHALE, PLPSwapper.address, 0, plpShare);

    // Deposit MIM in DegenBox for PLPLevSwapper
    mimShare = await DegenBox.toShare(MIM.address, getBigNumber(500_000), true);
    await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, PLPLevSwapper.address, 0, mimShare);*/

    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  afterEach(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("should have deployed the cauldron with the right parameters", async () => {
    expect(Cauldron.address).not.to.eq(ethers.constants.AddressZero);

    expect(await Cauldron.collateral()).to.eq(PLP.address);
    expect(await Cauldron.oracle()).to.eq(Oracle.address);
    expect(await Cauldron.oracleData()).to.eq("0x0000000000000000000000000000000000000000");
  });

  /*it("should liquidate the USDC/AVAX collateral and deposit MIM back to degenbox", async () => {
    const { alice } = await getNamedAccounts();

    const amountUsdcAvaxBefore = (await DegenBox.totals(USDCAVAX.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await PLPSwapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, usdcAvaxShare);

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

    await PLPLevSwapper.swap(alice, 0, mimShare);

    const amountUsdcAvaxAfter = (await DegenBox.totals(USDCAVAX.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    //console.log(`Got ${(amountUsdcAvaxAfter.sub(amountUsdcAvaxBefore)).toString()} USDC/AVAX from Leverage Swapper`);

    expect(amountMimAfter).to.be.lt(amountMimBefore);
    expect(amountUsdcAvaxAfter).to.be.gt(amountUsdcAvaxBefore);
  });*/
});
