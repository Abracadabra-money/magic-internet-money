/* eslint-disable prefer-const */
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, ISwapperGeneric } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "ethers";

// Top holders at the given fork block
const MIM_WHALE = "0x78a9e536EBdA08b5b9EDbE5785C9D1D50fA3278C";
const USDCAVAX_LP_WHALE = "0x4483f0b6e2F5486D06958C20f8C39A7aBe87bf8F";

const LIQUIDATION_LP_AMOUNT = getBigNumber(1, 17);
const LEVERAGE_MIM_AMOUNT = getBigNumber(4_000_000);

describe("Lev/Liquidation UsdcAvax Swappers V3", async () => {
  let snapshotId;
  let MIM: ERC20Mock;
  let USDCAVAX: ERC20Mock;
  let UsdceAvaxSwapperV2: ISwapperGeneric;
  let UsdceAvaxSwapperV3: ISwapperGeneric;
  let DegenBox: DegenBox;
  let ProxyOracle: IOracle;
  let mimShare: BigNumber;
  let collateralShare: BigNumber;
  let mimWhaleSigner;
  let usdcAvaxWhaleSigner;
  let collateralPrice;

  before(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            enabled: true,
            jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
            blockNumber: 14963307,
          },
        },
      ],
    });
    hre.getChainId = () => Promise.resolve(ChainId.Avalanche.toString());

    await deployments.fixture(["PopsicleUsdceWavaxV3"]);

    UsdceAvaxSwapperV2 = await ethers.getContractAt<ISwapperGeneric>("ISwapperGeneric", "0x6dA65013D5814dA632F1A94f3501aBc8e54C98ae");
    UsdceAvaxSwapperV3 = await ethers.getContract<ISwapperGeneric>("PopsicleUsdcAvaxSwapperV3");

    ProxyOracle = await ethers.getContractAt<IOracle>("IOracle", "0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85");
    DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", "0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4");
    MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0x130966628846BFd36ff31a822705796e8cb8C18D");
    USDCAVAX = await ethers.getContractAt<ERC20Mock>("ERC20Mock", "0xA389f9430876455C36478DeEa9769B7Ca4E3DDB1");

    await impersonate(MIM_WHALE);
    await impersonate(USDCAVAX_LP_WHALE);

    mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
    usdcAvaxWhaleSigner = await ethers.getSigner(USDCAVAX_LP_WHALE);

    const spot = await ProxyOracle.peekSpot("0x");
    collateralPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
    console.log(`Collateral Price = $${collateralPrice} usd`);
  });

  const liquidationSwap = async (collateral: ERC20Mock, swapper: ISwapperGeneric) => {
    const { alice } = await getNamedAccounts();

    const collateralAmount = await DegenBox.toAmount(collateral.address, collateralShare, false);
    const totalLiquidationPrice = collateralPrice * parseFloat(ethers.utils.formatEther(collateralAmount));

    console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of collateral tokens...`);
    const amountCollateralBefore = (await DegenBox.totals(collateral.address)).elastic;
    const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

    await swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

    const amountCollateralAfter = (await DegenBox.totals(collateral.address)).elastic;
    const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

    console.log(
      `Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`
    );

    expect(amountMimAfter).to.be.gt(amountMimBefore);
    expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
  };

  const setup = async (swapper: ISwapperGeneric) => {
    // Deposit collateral for liquidation swapper
    collateralShare = await DegenBox.toShare(MIM.address, LIQUIDATION_LP_AMOUNT, true);
    await USDCAVAX.connect(usdcAvaxWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
    await DegenBox.connect(usdcAvaxWhaleSigner).deposit(USDCAVAX.address, USDCAVAX_LP_WHALE, swapper.address, 0, collateralShare);
  };

  xdescribe("Using V2", () => {
    before(async () => {
      await setup(UsdceAvaxSwapperV2);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the USDC.e/AVAX collateral and deposit MIM back to degenbox", async () => {
      await liquidationSwap(USDCAVAX, UsdceAvaxSwapperV2);
    });
  });

  /**
    Collateral Price = $13810936.35331818 usd
    Using V2:
    Liquidating for $1,381,621.483 worth of collateral tokens...
    Got 1,169,624.328 MIM from Liquidation Swapper
    15.34% slippage

    Using V3:
    Liquidating for $1,381,621.483 worth of collateral tokens...
    Got 1,339,767.033 MIM from Liquidation Swapper
    3.02% slippage
   */
  describe("Using V3", () => {
    before(async () => {
      await setup(UsdceAvaxSwapperV3);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should liquidate the USDC.e/AVAX collateral and deposit MIM back to degenbox", async () => {
      await liquidationSwap(USDCAVAX, UsdceAvaxSwapperV3);
    });
  });
});
