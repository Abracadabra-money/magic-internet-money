/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, ISwapperGeneric } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ParametersPerChain } from "../deploy/StargateCauldron";

const testParametersPerChain = {
  [ChainId.Mainnet]: {
    enabled: false,
    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
    blockNumber: 123,
  },
  [ChainId.Avalanche]: {
    enabled: true,
    jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    blockNumber: 123,
  },
};
// In order:
// 0: name
// 1: collateral whale address
// 2: the maximum amount to leverage
// 3: oracle price - Beware that its value is based on the value of the plp at FORKBLOCK
const cauldronsPerChain = {
  [ChainId.Mainnet]: [
    ["USDC/WETH 0.3%", "0xc1c3d73e3f7be5549198cb275c7ba45f637a299a", 5_000_000, "117961428762440234"],
    ["WETH/USDT 0.3%", "0xd09729321471210e4c75b902f36c89f71c934a9c", 2_000_000, "115370773062134310"],
  ],
  [ChainId.Avalanche]: [
    ["USDC/WETH 0.3%", "0xc1c3d73e3f7be5549198cb275c7ba45f637a299a", 5_000_000, "117961428762440234"],
    ["WETH/USDT 0.3%", "0xd09729321471210e4c75b902f36c89f71c934a9c", 2_000_000, "115370773062134310"],
  ],
};

forEach(Object.keys(cauldronsPerChain)).describe("Stargate ChainId %s Cauldron", async (_chainId: ChainId) => {
  const testParameters = testParametersPerChain[_chainId];
  const cases = ParametersPerChain[_chainId].cauldrons.map((c, index) => [
    ...cauldronsPerChain[_chainId][index],
    c,
    ParametersPerChain[_chainId],
  ]);

  const describeFn = testParameters.enabled ? "describe" : "xdescribe";

  forEach(cases)[describeFn]("%s Cauldron", async (_name, param1, param2, param3, cauldronParams, globalCauldronParams) => {
    let snapshotId;
    let MIM: ERC20Mock;
    let CollateralToken: ERC20Mock;

    let Swapper: ISwapperGeneric;
    let LevSwapper: ILevSwapperGeneric;
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
              jsonRpcUrl: testParameters.jsonRpcUrl,
              blockNumber: testParameters.blockNumber,
            },
          },
        ],
      });
      hre.getChainId = () => Promise.resolve(_chainId.toString());

      await deployments.fixture(["StargateCauldrons"]);

      Swapper = await ethers.getContract<ISwapperGeneric>(`Stargate${globalCauldronParams.deploymentNamePrefix}Swapper`);
      LevSwapper = await ethers.getContract<ILevSwapperGeneric>(`Stargate${globalCauldronParams.deploymentNamePrefix}LevSwapper`);
      ProxyOracle = await ethers.getContract<IOracle>(`Stargate${globalCauldronParams.deploymentNamePrefix}ProxyOracle`);

      DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", globalCauldronParams.degenBox);
      MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", globalCauldronParams.mim);
      CollateralToken = await ethers.getContractAt<ERC20Mock>("ERC20Mock", cauldronParams.collateral);

      /*await impersonate(MIM_WHALE);
      await impersonate(USDCAVAX_LP_WHALE);

      mimWhaleSigner = await ethers.getSigner(MIM_WHALE);
      usdcAvaxWhaleSigner = await ethers.getSigner(USDCAVAX_LP_WHALE);

      const spot = await ProxyOracle.peekSpot("0x");
      collateralPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
      console.log(`Collateral Price = $${collateralPrice} usd`);

      // Deposit collateral for liquidation swapper
      collateralShare = await DegenBox.toShare(MIM.address, LIQUIDATION_LP_AMOUNT, true);
      await CollateralToken.connect(usdcAvaxWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(usdcAvaxWhaleSigner).deposit(CollateralToken.address, USDCAVAX_LP_WHALE, swapper.address, 0, collateralShare);

      // Deposit MIM in DegenBox for leverage swapper
      mimShare = await DegenBox.toShare(MIM.address, LEVERAGE_MIM_AMOUNT, true);
      await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
      await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, MIM_WHALE, levSwapper.address, 0, mimShare);*/

      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    afterEach(async () => {
      await network.provider.send("evm_revert", [snapshotId]);
      snapshotId = await ethers.provider.send("evm_snapshot", []);
    });

    it("should work", async () => {
      expect(true).to.be.true;
    });

    it.skip("should liquidate the USDC.e/AVAX collateral and deposit MIM back to degenbox", async () => {
      const { alice } = await getNamedAccounts();

      const collateralAmount = await DegenBox.toAmount(CollateralToken.address, collateralShare, false);
      const totalLiquidationPrice = collateralPrice * parseFloat(ethers.utils.formatEther(collateralAmount));

      console.log(`Liquidating for $${totalLiquidationPrice.toLocaleString()} worth of collateral tokens...`);
      const amountCollateralBefore = (await DegenBox.totals(CollateralToken.address)).elastic;
      const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

      await Swapper.swap(ethers.constants.AddressZero, ethers.constants.AddressZero, alice, 0, collateralShare);

      const amountCollateralAfter = (await DegenBox.totals(CollateralToken.address)).elastic;
      const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

      console.log(
        `Got ${parseFloat(ethers.utils.formatEther(amountMimAfter.sub(amountMimBefore))).toLocaleString()} MIM from Liquidation Swapper`
      );

      expect(amountMimAfter).to.be.gt(amountMimBefore);
      expect(amountCollateralAfter).to.be.lt(amountCollateralBefore);
    });

    it.skip("should swap MIM for USDC.e/AVAX and deposit back to degenbox", async () => {
      const mimShares = [
        // cannot use full mimShare as we are the only depositor on limone
        // mimShare
        mimShare.div(2),
        mimShare.div(5),
        mimShare.div(10),
        mimShare.div(20),
      ];
      const { alice } = await getNamedAccounts();

      for (let i = 0; i < mimShares.length; i++) {
        const shareAmount = mimShares[i];
        console.log(` > From ${parseFloat(ethers.utils.formatEther(shareAmount)).toLocaleString()} MIM shares`);

        const amountCollateralBefore = (await DegenBox.totals(CollateralToken.address)).elastic;
        const amountMimBefore = (await DegenBox.totals(MIM.address)).elastic;

        const estimateGas = await LevSwapper.estimateGas.swap(alice, 0, shareAmount);
        await LevSwapper.swap(alice, 0, shareAmount);
        const amountCollateralAfter = (await DegenBox.totals(CollateralToken.address)).elastic;
        const amountMimAfter = (await DegenBox.totals(MIM.address)).elastic;

        const amountOut = parseFloat(ethers.utils.formatEther(amountCollateralAfter.sub(amountCollateralBefore)));
        console.log(`Got ${amountOut.toLocaleString()} Token from Leverage Swapper ($${(collateralPrice * amountOut).toLocaleString()})`);
        console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

        expect(amountMimAfter).to.be.lt(amountMimBefore);
        expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

        await network.provider.send("evm_revert", [snapshotId]);
      }
    });
  });
});
