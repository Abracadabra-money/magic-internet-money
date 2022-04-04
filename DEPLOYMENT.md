# Deployments

## Ethereum

### Cauldrons

| Contract                 | Address                                    | Note                                       |
| ------------------------ | ------------------------------------------ | ------------------------------------------ |
| **Frax3Crv**             |                                            |                                            |
| Frax3CrvCauldron         | 0x81446B23e28377e1a15b6d0b67f7A2ACe3A8E5bB | 80% LTV 1% initial 1% Interest, 1.5% fee   |
| ConvexStakingWrapperAbra | 0x873221f8651bC14aa58b79489a4A927130259844 | Frax3Crv to Convex stkFrax3Crv Wrapper     |
| Frax3CrvProxyOracle      | 0x66a809a31E6909C835219cC09eA0f52135fF0a11 | Using Frax3CrvOracle                       |
| Frax3CrvOracle           | 0xD9bA8821e9EeFC89cBc80DA1EB5e3518BE383E63 |                                            |
| StkFrax3CrvSwapper       | 0xD69E75C1c2a0f2838A6bbA8BDFf9d08C8f137cD9 | Liquidation Swapper                        |
| **yvCVXETH**             |                                            |                                            |
| yvCVXETHCauldron         | 0xf179fe36a36B32a4644587B8cdee7A23af98ed37 | 75% LTV .5% initial 1% Interest, 12.5% fee |
| YVCVXETHOracleProxy      | 0xa32D03497FF5C32bcfeebE6A677Dbe4A496fD918 | Using YVCVXETHOracle                       |
| YVCVXETHOracle           | 0x991536BF23fa40B578Fc3e1e3725E51D1bF889F3 |                                            |
| YVCVXETHSwapper          | 0xF80a7b98b59e7F71BAa149990bAA6044728321bb | Liquidation Swapper                        |
| YVCVXETHLevSwapper       | 0xE345156cDEc151D9F843F94ADE7770EFA9d56417 | Leverage Swapper                           |
| **yvMIM3CRV**            |                                            |                                            |
| yvMIM3CRVCauldron        | 0xaf487ab3b81B3E6370B5D4C69A8daEf7Cc65676F | 75% LTV .5% initial 1% Interest, 12.5% fee |
| YVMIM3CRVOracleProxy     | 0x7d76568d84de8A0F34BBf315F53d7772c1fABcD8 | Using YVCVXETHOracle                       |
| YVMIM3CRVOracle          | 0x547fD22A2d2A9e109A78eB88Fc640D166a64d45F |                                            |
| YVMIM3CRVSwapper         | 0x05e46FFD98F94F62cC2817d54D5F0B1FD065B76d | Liquidation Swapper                        |
| YVMIM3CRVLevSwapper      | 0x9b2794Aeff2E6Bd2b3e32e095E878bF17EB6BdCC | Leverage Swapper                           |

### Utilities

| Contract           | Address                                    | Note                                                                                                                         |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| EthereumWithdrawer | 0xB2c3A9c577068479B1E5119f6B7da98d25Ba48f4 | Withdraw MIM fees from cauldron and swap for SPELL. Also used as recipient for swapping MIM fees received from other chains. |

## BSC

### Utilities

| Contract             | Address                                    | Note |
| -------------------- | ------------------------------------------ | ---- |
| MultichainWithdrawer | 0xB3f5c7D0Ac3944a9d9A9623D6B50bCeA85A26753 |      |

## Fantom

### Utilities

| Contract             | Address                                    | Note |
| -------------------- | ------------------------------------------ | ---- |
| MultichainWithdrawer | 0x7a3b799E929C9bef403976405D8908fa92080449 |      |

## Arbitrum

### Utilities

| Contract             | Address                                    | Note |
| -------------------- | ------------------------------------------ | ---- |
| MultichainWithdrawer | 0x7a3b799E929C9bef403976405D8908fa92080449 |      |

## Avalanche

### Cauldrons

| Contract                    | Address                                    | Note                                  |
| --------------------------- | ------------------------------------------ | ------------------------------------- |
| **AVAX/USDT**               |                                            |                                       |
| AvaxUsdtCauldron            | 0x0a1e6a80E93e62Bd0D3D3BFcF4c362C40FB1cF3D | 85% LTV .5% initial 3% Interest       |
| AvaxUsdtProxyOracle         | 0x2cA12e0Ca5c2E1EE8DC18eAA0D24EEd647aE7531 | Using AvaxUsdtLPOracle                |
| AvaxUsdtLPOracle            | 0xEd5D79F369D878C9038ac156D7D71b6364756f8e | Using AvaxUsdtLPChainlinkOracleV1     |
| AvaxUsdtLPChainlinkOracleV1 | 0xd15f851A912e4Fa9947e6024f16f02Ef25Ff311B | Using AvaxUsdtOracleV1                |
| AvaxUsdtOracleV1            | 0xD43f26102b0671dCf8D6357aA2908D6cC80C0559 | Using Chainlink AVAX/USD and USDT/USD |
| AvaxUsdtSwapper             | 0x9Ca03FeBDE38c2C8A2E8F3d74E23a58192Ca921d | Liquidation Swapper                   |
| AvaxUsdtLevSwapper          | 0x8CEe5B335f450933b4720B5b84e6125d4225FB62 | Leverage Swapper                      |
| **MIM/AVAX**                |                                            |                                       |
| MimAvaxCauldron             | 0x2450Bf8e625e98e14884355205af6F97E3E68d07 | 85% LTV .5% initial 1% Interest       |
| MimAvaxProxyOracle          | 0x15f57fbCB7A443aC6022e051a46cAE19491bC298 | Using MimAvaxLPOracle                 |
| MimAvaxLPOracle             | 0x3e6ef9E97147C266c5bddeF03E7dfba7a167d853 | Using MimAvaxLPChainlinkOracleV1      |
| MimAvaxLPChainlinkOracleV1  | 0xE275ec65fDbB4ECF0142b393402eE90D47359fBf | Using MimAvaxOracleV1                 |
| MimAvaxOracleV1             | 0x4437DB9538eb74C7418a1668766536b279C52709 | Using Chainlink AVAX/USD and MIM/USD  |
| MimAvaxSwapper              | 0xBc00ca0d71231c5E23Ba90A90D8C5D9039C39614 | Liquidation Swapper                   |
| MimAvaxLevSwapper           | 0xBA7fd957ad9b7C0238E6E4413dbA69E83224a582 | Leverage Swapper                      |

### Utilities

| Contract             | Address                                    | Note                                                             |
| -------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| MultichainWithdrawer | 0x2b95bf93B5873c8cB9aE3374e3054736A5b79676 | Withdraw MIM fees from cauldron and bridge to EthereumWithdrawer |

## Boba Network

| Contract | Address                                    | Note |
| -------- | ------------------------------------------ | ---- |
| DegenBox | 0x279D54aDD72935d845074675De0dbcfdc66800a3 |      |

## Moonriver

| Contract | Address                                    | Note |
| -------- | ------------------------------------------ | ---- |
| DegenBox | 0xB734c264F83E39Ef6EC200F99550779998cC812d |      |

# Oracles

| Chain | Token                 | Address                                    |
| ----- | --------------------- | ------------------------------------------ |
| Avax  | Joe USDC.e/WAVAX LP   | 0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85 |
| Avax  | Pangolin USDC.e/WAVAX | 0x1e21573cfc456f8aDd4C27ff16B50112e3adC7aC |

# Popsicle

| Contract                     | Address                                    | Note |
| ---------------------------- | ------------------------------------------ | ---- |
| Popsicle Degenbox            | 0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4 |      |
| PopsicleCauldronV2MultiChain | 0xfe0f13fD5f928539C5bc377c8200a699FC95Ca02 |      |

### Popsicle Cauldrons

| Contract                   | Address                                    | Note                                                      |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **USDC.e/WAVAX**           |                                            |                                                           |
| PopsicleUsdcAvaxCauldron   | 0x02130dE2d2E1CB33cB23ACbB9c48e94a610AFA56 | 85% LTV, 8% liquidation fee, 1% borrow fee, 1.5% Interest |
| Oracle                     | 0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85 | reusing existing Joe USDC/WAVAX jLP oracle                |
| PopsicleUsdcAvaxSwapper    | 0x4Ec0000Da67399AfCf4Ad04dA6089AFD63bEf901 | Liquidation Swapper                                       |
| PopsicleUsdcAvaxLevSwapper | 0xc845C5bAf57f61eB925D400AeBff0501C0e9d2Ba | Leverage Swapper                                          |

