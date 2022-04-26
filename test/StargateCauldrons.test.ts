/* eslint-disable prefer-const */
import forEach from "mocha-each";
import hre, { ethers, network, deployments, getNamedAccounts } from "hardhat";
import { ChainId, getBigNumber, impersonate } from "../utilities";
import { DegenBox, ERC20Mock, ILevSwapperGeneric, IOracle, IStargatePool, ISwapperGeneric } from "../typechain";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ParametersPerChain } from "../deploy/StargateCauldron";

const globalParametersPerChain = {
  [ChainId.Arbitrum]: {
    enabled: true,
    jsonRpcUrl: "https://arb1.arbitrum.io/rpc",
    blockNumber: 10570348,
    mimWhale: "0xf46BB6dDA9709C49EfB918201D97F6474EAc5Aea",
  },
  [ChainId.Mainnet]: {
    enabled: false,
    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
    blockNumber: 14650555,
    mimWhale: "0x355D72Fb52AD4591B2066E43e89A7A38CF5cb341",
  },
  [ChainId.Avalanche]: {
    enabled: false,
    jsonRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    blockNumber: 13882968,
    mimWhale: "0x78a9e536EBdA08b5b9EDbE5785C9D1D50fA3278C",
  },
};
// In order:
// 0: name
// 1: collateral whale address
// 2: the maximum collateral token amount to liquidate for MIM
// 3: the maximum MIM amount to leverage for collateral token amount
// 4: oracle price - Beware that its value is based on the value of the plp at FORKBLOCK
const cauldronsPerChain = {
  [ChainId.Arbitrum]: [
    ["USDC Pool", "0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176", getBigNumber(800_000, 6), getBigNumber(5_000_000), "1.00022102"],
    ["USDT Pool", "0xeA8DfEE1898a7e0a59f7527F076106d7e44c2176", getBigNumber(60_000, 6), getBigNumber(5_000_000), "1.00059304"],
  ],
  [ChainId.Mainnet]: [
    ["USDC Pool", "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b", getBigNumber(800_000, 6), getBigNumber(5_000_000), "1.00022102"],
    ["USDT Pool", "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b", getBigNumber(60_000, 6), getBigNumber(5_000_000), "1.00059304"],
  ],
  [ChainId.Avalanche]: [
    ["USDC Pool", "0x8731d54E9D02c286767d56ac03e8037C07e01e98", getBigNumber(800_000, 6), getBigNumber(5_000_000), "1.00022102"],
    ["USDT Pool", "0x8731d54E9D02c286767d56ac03e8037C07e01e98", getBigNumber(60_000, 6), getBigNumber(5_000_000), "1.00059304"],
  ],
};

forEach(Object.keys(cauldronsPerChain)).describe("Stargate ChainId %s Cauldrons", async (_chainId: ChainId) => {
  const globalParameters = globalParametersPerChain[_chainId];
  const cases = ParametersPerChain[_chainId].cauldrons.map((c, index) => [
    ...cauldronsPerChain[_chainId][index],
    c,
    ParametersPerChain[_chainId],
  ]);

  const describeFn = globalParameters.enabled ? "describe" : "xdescribe";

  forEach(cases)[describeFn](
    "%s Cauldron",
    async (_name, collateralWhale, collateralLiquidationAmount, leverageAmount, expectedOraclePrice, cauldronParams, globalCauldronParams) => {
      let snapshotId;
      let MIM: ERC20Mock;
      let CollateralToken: IStargatePool;
      let CollateralTokenAsERC20: ERC20Mock;

      let Swapper: ISwapperGeneric;
      let LevSwapper: ILevSwapperGeneric;
      let DegenBox: DegenBox;
      let ProxyOracle: IOracle;

      let mimShare: BigNumber;
      let collateralShare: BigNumber;
      let mimWhaleSigner;
      let collateralWhaleSigner;
      let collateralPrice;

      before(async () => {
        await network.provider.request({
          method: "hardhat_reset",
          params: [
            {
              forking: {
                enabled: true,
                jsonRpcUrl: globalParameters.jsonRpcUrl,
                blockNumber: globalParameters.blockNumber,
              },
            },
          ],
        });
        hre.getChainId = () => Promise.resolve(_chainId.toString());

        await deployments.fixture(["StargateCauldrons"]);

        Swapper = await ethers.getContract<ISwapperGeneric>(`Stargate${cauldronParams.deploymentNamePrefix}Swapper`);
        LevSwapper = await ethers.getContract<ILevSwapperGeneric>(`Stargate${cauldronParams.deploymentNamePrefix}LevSwapper`);
        ProxyOracle = await ethers.getContract<IOracle>(`Stargate${cauldronParams.deploymentNamePrefix}ProxyOracle`);
        CollateralToken = await ethers.getContractAt<IStargatePool>("IStargatePool", cauldronParams.collateral);
        CollateralTokenAsERC20 = await ethers.getContractAt<ERC20Mock>("ERC20Mock", cauldronParams.collateral);

        DegenBox = await ethers.getContractAt<DegenBox>("DegenBox", globalCauldronParams.degenBox);
        MIM = await ethers.getContractAt<ERC20Mock>("ERC20Mock", globalCauldronParams.mim);

        await impersonate(globalParameters.mimWhale);
        await impersonate(collateralWhale);

        mimWhaleSigner = await ethers.getSigner(globalParameters.mimWhale);
        collateralWhaleSigner = await ethers.getSigner(collateralWhale);

        const spot = await ProxyOracle.peekSpot("0x");
        collateralPrice = 1 / parseFloat(ethers.utils.formatEther(spot));
        console.log(`Collateral Price = $${collateralPrice} usd`);
        expect(collateralPrice.toString()).to.be.eq(expectedOraclePrice);

        // Deposit collateral for liquidation swapper
        collateralShare = await DegenBox.toShare(cauldronParams.collateral, collateralLiquidationAmount, true);
        await CollateralTokenAsERC20.connect(collateralWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
        await DegenBox.connect(collateralWhaleSigner).deposit(CollateralToken.address, collateralWhale, Swapper.address, 0, collateralShare);

        // Deposit MIM in DegenBox for leverage swapper
        mimShare = await DegenBox.toShare(MIM.address, leverageAmount, true);
        await MIM.connect(mimWhaleSigner).approve(DegenBox.address, ethers.constants.MaxUint256);
        await DegenBox.connect(mimWhaleSigner).deposit(MIM.address, globalParameters.mimWhale, LevSwapper.address, 0, mimShare);

        snapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      afterEach(async () => {
        await network.provider.send("evm_revert", [snapshotId]);
        snapshotId = await ethers.provider.send("evm_snapshot", []);
      });

      it("should liquidate the collateral and deposit MIM back to degenbox", async () => {
        const { alice } = await getNamedAccounts();

        const collateralAmount = await DegenBox.toAmount(CollateralToken.address, collateralShare, false);
        const totalLiquidationPrice =
          collateralPrice * parseFloat(ethers.utils.formatUnits(collateralAmount, parseInt((await CollateralToken.localDecimals()).toString())));

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

      it("should swap MIM for collateral and deposit back to degenbox", async () => {
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

          const amountOut = parseFloat(
            ethers.utils.formatUnits(
              amountCollateralAfter.sub(amountCollateralBefore),
              parseInt((await CollateralToken.localDecimals()).toString())
            )
          );
          console.log(`Got ${amountOut.toLocaleString()} Token from Leverage Swapper ($${(collateralPrice * amountOut).toLocaleString()})`);
          console.log("Gas Cost", parseFloat(estimateGas.toString()).toLocaleString());

          expect(amountMimAfter).to.be.lt(amountMimBefore);
          expect(amountCollateralAfter).to.be.gt(amountCollateralBefore);

          await network.provider.send("evm_revert", [snapshotId]);
        }
      });
    }
  );
});
