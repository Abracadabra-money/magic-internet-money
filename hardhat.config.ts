/* eslint-disable @typescript-eslint/no-non-null-assertion */
import "dotenv/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-solhint";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "@tenderly/hardhat-tenderly"
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import "./tasks";

import { HardhatUserConfig } from "hardhat/config";

const accounts = {
  mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test junk",
};

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  abiExporter: {
    path: "./abi",
    clear: false,
    flat: true,
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "deploy",
    deployments: "deployments",
    imports: "imports",
    sources: process.env.CONTRACTS_PATH || "contracts",
    tests: "test",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_TOKEN,
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    currency: "USD",
    enabled: process.env.REPORT_GAS === "true",
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    alice: {
      default: 1,
    },
    bob: {
      default: 2,
    },
    carol: {
      default: 3,
    },
  },
  networks: {
    localhost: {
      live: false,
      saveDeployments: true,
      tags: ["local"],
    },
    hardhat: {
      chainId: 1,
      allowUnlimitedContractSize: true,
      // Seems to be a bug with this, even when false it complains about being unauthenticated.
      // Reported to HardHat team and fix is incoming
      forking: {
        enabled: process.env.FORKING === "true",
        url: process.env.ETHEREUM_RPC_URL || `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: (process.env.FORKING === "true" && parseInt(process.env.FORKING_BLOCK!)) || undefined,
      },
      gasPrice: 0,
      initialBaseFeePerGas: 0,
      live: false,
      saveDeployments: false,
      tags: ["test", "local"],
    },
    mainnet: {
      url: process.env.ETHEREUM_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      chainId: 1,
      saveDeployments: true,
      live: true,
      tags: ["prod"],
    },
    avalanche: {
      chainId: 43114,
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts,
      live: true,
      saveDeployments: true,
      tags: ["prod"],
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      chainId: 3,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      chainId: 5,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
      chainId: 42,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
    moonbase: {
      url: "https://rpc.testnet.moonbeam.network",
      accounts,
      chainId: 1287,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
    arbitrum: {
      url: "https://kovan3.arbitrum.io/rpc",
      accounts,
      chainId: 79377087078960,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
    fantom: {
      url: "https://rpcapi.fantom.network",
      accounts,
      chainId: 250,
      live: true,
      saveDeployments: true,
    },
    fantom_testnet: {
      url: "https://rpc.testnet.fantom.network",
      accounts,
      chainId: 4002,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
    polygon: {
      url: "https://rpc-mainnet.maticvigil.com",
      accounts,
      chainId: 137,
      live: true,
      saveDeployments: true,
    },
    xdai: {
      url: "https://rpc.xdaichain.com",
      accounts,
      chainId: 100,
      live: true,
      saveDeployments: true,
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      accounts,
      chainId: 56,
      live: true,
      saveDeployments: true,
    },
    bsc_testnet: {
      url: "https://data-seed-prebsc-2-s3.binance.org:8545",
      accounts,
      chainId: 97,
      live: true,
      saveDeployments: true,
      tags: ["staging"],
    },
  },
  mocha: {
    timeout: 40000,
    bail: true,
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT || 'project',
    username: process.env.TENDERLY_USERNAME || '',
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.4",
      },
      {
        version: "0.8.7",
      },
      {
        version: "0.8.9",
      },
      {
        version: "0.8.10",
      },
      {
        version: "0.7.6",
      },
    ],
    overrides: {
      "contracts/oracle/AGLDUniV3ChainlinkOracle.sol": {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "@uniswap/v3-core/contracts/libraries/FullMath.sol": {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "@uniswap/v3-periphery/contracts/libraries/LiquidityAmounts.sol": {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "@uniswap/v3-core/contracts/libraries/TickMath.sol": {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol": {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "contracts/SpellPower.sol": {
        version: "0.8.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "contracts/KashiPair.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
      "contracts/mocks/KashiPairMock.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
      "contracts/swappers/Leverage/AGLDLevSwapper.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "contracts/swappers/Liquidations/AGLDSwapper.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 9000,
          },
        },
      },
      "contracts-flat/DegenBox.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/KashiPairMediumRiskV2.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 350,
          },
        },
      },
      "contracts-flat/CauldronV2Multichain.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 350,
          },
        },
      },
      "contracts-flat/BentoBoxFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/YearnChainlinkOracleV1.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/YearnChainlinkOracleV2.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/sSpellFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/MagicInternetMoneyFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/MinimalTimeLockFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/CauldronV2CheckpointV1.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 350,
          },
        },
      },
      "contracts-flat/CauldronMediumRiskV1.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 350,
          },
        },
      },
      "contracts-flat/CauldronLowRiskV1.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 350,
          },
        },
      },
      "contracts-flat/KashiPairFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 350,
          },
        },
      },
      "contracts-flat/SushiSwapSwapperFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/PeggedOracleFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/SimpleSLPTWAP0OracleFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/SimpleSLPTWAP1OracleFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/ChainlinkOracleFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/ChainlinkOracleV2Flat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/CompoundOracle.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      "contracts-flat/BoringHelperFlat.sol": {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    },
  },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default config;
