module.exports = {
    hardhat: {
        namedAccounts: {
            deployer: {
                default: 0, // here this will by default take the first account as deployer
            },
        },
        networks: {
            arbitrum: {
                chainId: 42161, 
                url: "https://arb1.arbitrum.io/rpc",
                nativeCurrency: {
                    name: "Ether",
                    symbol: "AETH",
                    decimals: 18
                  },
            },
            avalanche: {
                chainId: 43114,
                networkId: 1,
                url: "https://api.avax.network/ext/bc/C/rpc",
                nativeCurrency: {
                    name: "Avalanche",
                    symbol: "AVAX",
                    decimals: 18
                  },
            },
            hardhat: {
                /*forking: {
                    blockNumber: 13323148,
                    blockGasLimit: 20000000,
                }*/
            }
        },
        etherscan: { 
            // Your API key for Etherscan
            // Obtain one at https://etherscan.io/
            apiKey: process.env.FANTOM
            ? "NYV3ID81T6ACKPJKUZRZVRXUD34MJHPXGI" : "3SMTGB6TYXG2A5AD26CAP1TIDF238JZ98S"
        },
        solidity: {
            compilers: [
                {
                    version: "0.6.12",
                },
                {
                    version: "0.8.4",
                },
                {
                    version: "0.8.7",
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
                "contracts/flat/DegenBox.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
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
                "contracts/flat/KashiPairMediumRiskV2.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 350,
                        },
                    },
                },
                "contracts/flat/CauldronV2Multichain.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 350,
                        },
                    },
                },
                "contracts/flat/BentoBoxFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/YearnChainlinkOracleV1.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/YearnChainlinkOracleV2.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/sSpellFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/MagicInternetMoneyFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/MinimalTimeLockFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/CauldronV2CheckpointV1.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 350,
                        },
                    },
                },
                "contracts/flat/CauldronMediumRiskV1.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 350,
                        },
                    },
                },
                "contracts/flat/CauldronLowRiskV1.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 350,
                        },
                    },
                },
                "contracts/flat/KashiPairFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 350,
                        },
                    },
                },
                "contracts/flat/SushiSwapSwapperFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/PeggedOracleFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/SimpleSLPTWAP0OracleFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/SimpleSLPTWAP1OracleFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/ChainlinkOracleFlat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/ChainlinkOracleV2Flat.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/CompoundOracle.sol": {
                    version: "0.6.12",
                    settings: {
                        optimizer: {
                            enabled: true,
                            runs: 999999,
                        },
                    },
                },
                "contracts/flat/BoringHelperFlat.sol": {
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
    },
    solcover: {
        // We are always skipping mocks and interfaces, add specific files here
        skipFiles: [
            "libraries/FixedPoint.sol",
            "libraries/FullMath.sol",
            "libraries/SignedSafeMath.sol",
            "flat/BentoBoxFlat.sol",
            "flat/KashiPairFlat.sol",
            "flat/SushiSwapSwapperFlat.sol",
        ],
    },
    prettier: {
        // Add or change prettier settings here
    },
}
