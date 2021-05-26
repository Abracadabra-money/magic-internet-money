module.exports = {
    hardhat: {
        solidity: {
            overrides: {
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
