# Deployments

## Ethereum

## Cauldron MasterContracts

| Contract                  | Address                                    |
| ------------------------- | ------------------------------------------ |
| CauldronV3 MasterContract | 0x3E2a2BC69E5C22A8DA4056B413621D1820Eb493E |

## MagicCRV

| Contract        | Address                                    |
| --------------- | ------------------------------------------ |
| MagicCRV        | 0x247d7e28AA79DFfe09B287d191393242411ad85F |
| CurveVoter      | 0x49640905aAE77308f1D35f370efd5c08a790f1cc |
| RewardHarvester | 0xE685a35347ddC8D58ed2838a291c8a66d5BdB0ca |

### Stargate MIM Pool

| Contract                 | Address                                    |
| ------------------------ | ------------------------------------------ |
| MainnetStargateLpMimPool | 0x185697868e26c2Ec5b6b86504dB2F2d390f54720 |

### Cauldrons

| Contract                        | Address                                    | Note                                       |
| ------------------------------- | ------------------------------------------ | ------------------------------------------ |
| **Frax3Crv**                    |                                            |                                            |
| Frax3CrvCauldron                | 0x81446B23e28377e1a15b6d0b67f7A2ACe3A8E5bB | 80% LTV 1% initial 1% Interest, 1.5% fee   |
| ConvexStakingWrapperAbra        | 0x873221f8651bC14aa58b79489a4A927130259844 | Frax3Crv to Convex stkFrax3Crv Wrapper     |
| Frax3CrvProxyOracle             | 0x66a809a31E6909C835219cC09eA0f52135fF0a11 | Using Frax3CrvOracle                       |
| Frax3CrvOracle                  | 0xD9bA8821e9EeFC89cBc80DA1EB5e3518BE383E63 |                                            |
| StkFrax3CrvSwapper              | 0xD69E75C1c2a0f2838A6bbA8BDFf9d08C8f137cD9 | Liquidation Swapper                        |
| **yvCVXETH**                    |                                            |                                            |
| yvCVXETHCauldron                | 0xf179fe36a36B32a4644587B8cdee7A23af98ed37 | 75% LTV .5% initial 1% Interest, 12.5% fee |
| YVCVXETHOracleProxy             | 0xa32D03497FF5C32bcfeebE6A677Dbe4A496fD918 | Using YVCVXETHOracle                       |
| YVCVXETHOracle                  | 0x991536BF23fa40B578Fc3e1e3725E51D1bF889F3 |                                            |
| YVCVXETHSwapper                 | 0xF80a7b98b59e7F71BAa149990bAA6044728321bb | Liquidation Swapper                        |
| YVCVXETHLevSwapper              | 0xE345156cDEc151D9F843F94ADE7770EFA9d56417 | Leverage Swapper                           |
| **yvMIM3CRV**                   |                                            |                                            |
| yvMIM3CRVCauldron               | 0xaf487ab3b81B3E6370B5D4C69A8daEf7Cc65676F | 75% LTV .5% initial 1% Interest, 12.5% fee |
| YVMIM3CRVOracleProxy            | 0x7d76568d84de8A0F34BBf315F53d7772c1fABcD8 | Using YVCVXETHOracle                       |
| YVMIM3CRVOracle                 | 0x547fD22A2d2A9e109A78eB88Fc640D166a64d45F |                                            |
| YVMIM3CRVSwapper                | 0x05e46FFD98F94F62cC2817d54D5F0B1FD065B76d | Liquidation Swapper                        |
| YVMIM3CRVLevSwapper             | 0x9b2794Aeff2E6Bd2b3e32e095E878bF17EB6BdCC | Leverage Swapper                           |
| **yvDAI**                       |                                            |                                            |
| yvDAICauldron                   | 0x7Ce7D9ED62B9A6c5aCe1c6Ec9aeb115FA3064757 | 90% LTV 0% initial 0% Interest, .5% fee    |
| YVDAIOracleProxy                | 0x39DBa7955cEE12578B7548dF7eBf88F835d51bE1 | YVDAIOracleV1                              |
| YVDAIOracleV1                   | 0xaB137bb12e93fEdB8B639771c4C4fE29aC138Ee6 |                                            |
| YVDAISwapper                    | 0xdb3A46896d2855e7932fC8Ea5A8465Fd07F7Fb57 | Liquidation Swapper                        |
| YVDAILevSwapper                 | 0xD8AF1558A2ca227607b49a3293e278c6875F9a40 | Leverage Swapper                           |
| **Stargate USDC**               |                                            |                                            |
| StargateEthereumUsdcCauldron    | 0xd31E19A0574dBF09310c3B06f3416661B4Dc7324 | 95% LTV 0% initial 0% Interest, 0.5% fee   |
| StargateEthereumUsdcProxyOracle | 0x16495612e7b35bbc8c672cd76de83bcc81774552 | Using StargateEthereumUsdcLPOracleV1       |
| StargateEthereumUsdcSwapperV2   | 0x727f7302c6F5FCE0464F77735b84B2d192b0C89E | Liquidation Swapper                        |
| StargateEthereumUsdcLevSwapper  | 0xEdEa4518796EA45dFc38D78D9B8b9e070436AD51 | Leverage Swapper                           |
| **Stargate USDT**               |                                            |                                            |
| StargateEthereumUsdtCauldron    | 0xc6B2b3fE7c3D7a6f823D9106E22e66660709001e | 95% LTV 0% initial 0% Interest, 0.5% fee   |
| StargateEthereumUsdtProxyOracle | 0xaBB326cD92b0e48fa6dfC54d69Cd1750a1007a97 | Using StargateEthereumUsdtLPOracleV1       |
| StargateEthereumUsdtSwapperV2   | 0xc99A4863173Ef52CCB7EA05440da0e37bA39c139 | Liquidation Swapper                        |
| StargateEthereumUsdtLevSwapper  | 0x1E188DD74adf8CC95c98714407e88a4a99b759A5 | Leverage Swapper                           |

### Popsicle Cauldrons

| Contract                                   | Address                                    | Note                                                |
| ------------------------------------------ | ------------------------------------------ | --------------------------------------------------- |
| EthereumWithdrawer                         | 0xB2c3A9c577068479B1E5119f6B7da98d25Ba48f4 | Withdraw MIM fees from cauldron and swap for SPELL. |
| **85% LTV .5% initial 3% Interest 8% Fee** |                                            |                                                     |
| **Popsicle USDC/WETH 0.3%**                |                                            |                                                     |
| PopsicleUSDCWETHCauldron                   | 0xfD5165bD318AB6e18bD0439a736e662986F6C5b2 |                                                     |
| PopsicleUSDCWETHProxyOracle                | 0x52B2773FB2f69d565C651d364f0AA95eBED097E4 |                                                     |
| PopsicleUSDCWETHOracle                     | 0x0D52048451207106184f0423cAF055aE24a5A38A |                                                     |
| PopsicleUSDCWETHSwapper                    | 0xc97C7F6e60Fdd610A0fCA4792BbBD1dbD028d474 |                                                     |
| PopsicleUSDCWETHLevSwapper                 | 0x04146736FEF83A25e39834a972cf6A5C011ACEad |                                                     |
| **Popsicle USDC/WETH 0.05%**               |                                            |                                                     |
| PopsicleUSDCWETHCauldron                   | 0xab8F52D568ba9B58c296522232240621Cf3f9dDa |                                                     |
| PopsicleUSDCWETHProxyOracle                | 0x87A5bF86D6C96775d926F43700c0fD99EE0c2E82 |                                                     |
| PopsicleUSDCWETHOracle                     | 0x9D72680409b906bf964dBFC89C7c270a88fe4DE6 |                                                     |
| PopsicleUSDCWETHSwapper                    | 0x0E0E2c6204976bA791fBA95eFbb54f9f76556a57 |                                                     |
| PopsicleUSDCWETHLevSwapper                 | 0x2cA12e0Ca5c2E1EE8DC18eAA0D24EEd647aE7531 |                                                     |
| **Popsicle WETH/USDT 0.3%**                |                                            |                                                     |
| PopsicleWETHUSDTCauldron                   | 0x08371AAcA536370ffba76e1502E8a476AC3D9691 |                                                     |
| PopsicleWETHUSDTProxyOracle                | 0x76c936A0db6EeEb54e615B93a6fAAA9930C02C19 |                                                     |
| PopsicleWETHUSDTOracle                     | 0x85E8A3087C90992BAdD74BE44F18626b2359F490 |                                                     |
| PopsicleWETHUSDTSwapper                    | 0xad2f284Db532A57d6940F3A46D875549DCEB030d |                                                     |
| PopsicleWETHUSDTLevSwapper                 | 0x2906ae98fdAf225a697a09158D10843A89CF0FC5 |                                                     |
| **Popsicle WETH/USDT 0.05%**               |                                            |                                                     |
| PopsicleWETHUSDTCauldron                   | 0x5aC11966ca33128c516116b5a597554e9f25ab6f |                                                     |
| PopsicleWETHUSDTProxyOracle                | 0xEd5D79F369D878C9038ac156D7D71b6364756f8e |                                                     |
| PopsicleWETHUSDTOracle                     | 0xE5683f4bD410ea185692b5e6c9513Be6bf1017ec |                                                     |
| PopsicleWETHUSDTSwapper                    | 0xBd73aA17Ce60B0e83d972aB1Fb32f7cE138Ca32A |                                                     |
| PopsicleWETHUSDTLevSwapper                 | 0x9Ca03FeBDE38c2C8A2E8F3d74E23a58192Ca921d |                                                     |
| **Popsicle UST/USDT 0.05%**                |                                            |                                                     |
| PopsicleUSTUSDTCauldron                    | 0x9ac502D3aD1FfB79F75D486Ae7D01Dd696B7F4B3 |                                                     |
| PopsicleUSTUSDTProxyOracle                 | 0x40CC67dB2713F34daCA67d93aCdeF59D3b8279a9 |                                                     |
| PopsicleUSTUSDTOracle                      | 0xBc00ca0d71231c5E23Ba90A90D8C5D9039C39614 |                                                     |
| PopsicleUSTUSDTSwapper                     | 0xc2141D069c75C76EFf779fc3Ca187233dAfC1e7c |                                                     |
| PopsicleUSTUSDTLevSwapper                  | 0x6E93686D34a9EBf7c589998a576AB603719500ef |                                                     |
| **Popsicle USDC/UST 0.05%**                |                                            |                                                     |
| PopsicleUSDCUSTCauldron                    | 0x293C100ce61B82B5Efc04F756E32a548158360d4 |                                                     |
| PopsicleUSDCUSTProxyOracle                 | 0x0DF56A0CF3E6Da667c9532203Fca4c8Ef138A181 |                                                     |
| PopsicleUSDCUSTOracle                      | 0x02d4c5c47C6E779F44709F35f0131C1CdB407fbf |                                                     |
| PopsicleUSDCUSTSwapper                     | 0x2b95bf93B5873c8cB9aE3374e3054736A5b79676 |                                                     |
| PopsicleUSDCUSTLevSwapper                  | 0x8176C5408c5DeC30149232A74Ef8873379b59982 |                                                     |
| **Popsicle USDC/USDT 0.01%**               |                                            |                                                     |
| PopsicleUSDCUSDTCauldron                   | 0x02F3025c4808dC35Fee5638aeb98a62A00C2664a |                                                     |
| PopsicleUSDCUSDTProxyOracle                | 0x8CBC6f9811b266268B94B84afED0e5EE26D61DdC |                                                     |
| PopsicleUSDCUSDTOracle                     | 0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4 |                                                     |
| PopsicleUSDCUSDTSwapper                    | 0xFa85b0BB658d519247494b6020Cae6E65f572950 |                                                     |
| PopsicleUSDCUSDTLevSwapper                 | 0xBc7Fa554a65A98502457FCFC2f1afa28113D7920 |                                                     |
| **Popsicle WBTC/WETH 0.3%**                |                                            |                                                     |
| PopsicleWBTCWETHCauldron                   | 0x7FC3e87AAF5564a725BD4d842A7239b575fEAB4F |                                                     |
| PopsicleWBTCWETHProxyOracle                | 0x563111A691302D9700Abc617E99236D6a6FC537b |                                                     |
| PopsicleWBTCWETHOracle                     | 0x2BCccB83178F9Fd889EB937979d659A5997Ca327 |                                                     |
| PopsicleWBTCWETHSwapper                    | 0xa1CdF7d4E983A4dbC3833f6Bbfdb3eB112fEF5C1 |                                                     |
| PopsicleWBTCWETHLevSwapper                 | 0x64C65549C10D86De6F00C3B0D5132d8f742Af8C4 |                                                     |
| **Popsicle WBTC/WETH 0.05%**               |                                            |                                                     |
| PopsicleWBTCWETHCauldron                   | 0x0A7224c7429E06661930c862Cc4b1815544A8701 |                                                     |
| PopsicleWBTCWETHProxyOracle                | 0xA996A383f0527409FE3e8476EaE70A5F7801bCEB |                                                     |
| PopsicleWBTCWETHOracle                     | 0xfe0f13fD5f928539C5bc377c8200a699FC95Ca02 |                                                     |
| PopsicleWBTCWETHSwapper                    | 0xf82397056A454ad3Cbb6be67b07dF7A75458bbfA |                                                     |
| PopsicleWBTCWETHLevSwapper                 | 0x6Eb1709e0b562097BF1cc48Bc6A378446c297c04 |                                                     |

### Utilities

| Contract           | Address                                    | Note                                                                                                                         |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| EthereumWithdrawer | 0xB2c3A9c577068479B1E5119f6B7da98d25Ba48f4 | Withdraw MIM fees from cauldron and swap for SPELL. Also used as recipient for swapping MIM fees received from other chains. |

### Oracles

| Contract               | Address                                    | Note |
| ---------------------- | ------------------------------------------ | ---- |
| YearnChainlinkOracleV3 | 0xA0fA150F11ca5D63353d3460cbF5E15304d4BD57 |      |

## BSC

### Utilities

| Contract             | Address                                    | Note |
| -------------------- | ------------------------------------------ | ---- |
| MultichainWithdrawer | 0xB3f5c7D0Ac3944a9d9A9623D6B50bCeA85A26753 |      |

## Fantom

## Cauldron MasterContracts

| Contract                  | DegenBox | Address                                    |
| ------------------------- | -------- | ------------------------------------------ |
| CauldronV3 MasterContract | Limone   | 0xAcdd6e28b7440fe17EeFD927337480DD1Ea7A97b |

### Cauldrons

| Contract                         | Address                                    | Note                                    |
| -------------------------------- | ------------------------------------------ | --------------------------------------- |
| **Popsicle fUSDT/USDC**          |                                            |                                         |
| fUSDTUSDCSpiritCauldron          | 0xB23a8A3a6CEC34827BceFF327050B37Ce98CA4cD | 90% LTV 0% initial 2.5% Interest Liq 8% |
| fUSDTUSDCSpiritProxyOracle       | 0xe56F37Ef2e54ECaA41a9675da1c3445736d60B42 | Using fUSDTUSDCSpiritInvertedLPOracle   |
| fUSDTUSDCSpiritInvertedLPOracle  | 0x4A3A6Dd60A34bB2Aba60D73B4C88315E9CeB6A3D | Using fUSDTUSDCSpiritChainlinkOracleV1  |
| fUSDTUSDCSpiritChainlinkOracleV1 | 0xfbF8035d24E9c539569F25C47896Ab2DF4a43f03 | Using fUSDTUSDCOracleV1                 |
| fUSDTUSDCOracleV1                | 0x9031c0Fd5bD1405132028A3e0eb277C705B3d8f7 | Using Chainlink USDT/USD and USDC/USD   |
| SpiritfUSDTUSDCSwapper           | 0x1E217d3cA2a19f2cB0F9f12a65b40f335286758E | Liquidation Swapper                     |
| SpiritfUSDTUSDCLevSwapper        | 0xc97C7F6e60Fdd610A0fCA4792BbBD1dbD028d474 | Leverage Swapper                        |

### Utilities

| Contract             | Address                                    | Note |
| -------------------- | ------------------------------------------ | ---- |
| MultichainWithdrawer | 0x7a3b799E929C9bef403976405D8908fa92080449 |      |

### Utilities

| Contract             | Address                                    | Note |
| -------------------- | ------------------------------------------ | ---- |
| MultichainWithdrawer | 0x7a3b799E929C9bef403976405D8908fa92080449 |      |

## Avalanche

## Cauldron MasterContracts

| Contract                         | Address                                    |                                          |
| -------------------------------- | ------------------------------------------ | ---------------------------------------- |
| CauldronV3                       | 0x177a24B427876F61983CCe0dD37608611e7de3f7 |                                          |
| WhitelistedCauldronV3            | 0xE8681a8C8d8E24b65526C2f94Fd5eF9D3ec18726 |                                          |
| **Stargate USDC**                |                                            |                                          |
| StargateAvalancheUsdcCauldron    | 0xF6BB4627A86CE4AC6d748d4F69856980A305EC99 | 95% LTV 0% initial 0% Interest, 0.5% fee |
| StargateAvalancheUsdcProxyOracle | 0xb69c154030ce89340cdceca8eed93283499a8276 |                                          |
| StargateAvalancheUsdcSwapper     | 0x6C464923568a466262E2Bb614723a98813b0B548 | Liquidation Swapper                      |
| StargateAvalancheUsdcLevSwapper  | 0x49AF4181b36b629089A3B26E046D313a115eC911 | Leverage Swapper                         |
| **Stargate USDT**                |                                            |                                          |
| StargateAvalancheUsdtCauldron    | 0xD9BD7cBB757c5689aFa1E6B7D526C7b544cD6e7F | 95% LTV 0% initial 0% Interest, 0.5% fee |
| StargateAvalancheUsdtProxyOracle | 0x7E0f0Cc086b069d1Ae3edB7E7aEEcc770b6d3aeb |                                          |
| StargateAvalancheUsdtSwapper     | 0x198892f3709A6A03F4de1165057f78A9f2741B6e | Liquidation Swapper                      |
| StargateAvalancheUsdtLevSwapper  | 0xAC6C439253987Be9aFF6AaC047EC8501eA13d512 | Leverage Swapper                         |

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

## Polygon

| Contract                            | Address                                    | Note |
| ----------------------------------- | ------------------------------------------ | ---- |
| DegenBox                            | 0xe56F37Ef2e54ECaA41a9675da1c3445736d60B42 |      |
| CauldronV2MultiChain MasterContract | 0x9031c0Fd5bD1405132028A3e0eb277C705B3d8f7 |      |

## Arbitrum

| Contract | Address                                    |
| -------- | ------------------------------------------ |
| DegenBox | 0x7C8FeF8eA9b1fE46A7689bfb8149341C90431D38 |

## Cauldron MasterContracts

| Contract                    | Address                                    |
| --------------------------- | ------------------------------------------ |
| CauldronV3.1 MasterContract | 0xd98bfb05DD6aa37BA5624479Eb4264de9a3384Ee |

### Cauldrons

| Contract                        | Address                                    |                                          |
| ------------------------------- | ------------------------------------------ | ---------------------------------------- |
| **Stargate USDC**               |                                            |                                          |
| StargateArbitrumUsdcCauldron    | 0x5B03811a1c42bE81a25410576ecff52323b82580 | 95% LTV 0% initial 0% Interest, 0.5% fee |
| StargateArbitrumUsdcProxyOracle | 0x0D52048451207106184f0423cAF055aE24a5A38A |                                          |
| StargateArbitrumUsdcSwapper     | 0x85E8A3087C90992BAdD74BE44F18626b2359F490 | Liquidation Swapper                      |
| StargateArbitrumUsdcLevSwapper  | 0x14D6dF05Ce338f8b32491532E9E0b23838AD213E | Leverage Swapper                         |
| **Stargate USDT**               |                                            |                                          |
| StargateArbitrumUsdtCauldron    | 0x00913e4d92D5f17778f69Ca18eF2906f2749964b | 95% LTV 0% initial 0% Interest, 0.5% fee |
| StargateArbitrumUsdtProxyOracle | 0xD6b8bd85A9593cb47c8C15C95bbF3e593c5Dc591 |                                          |
| StargateArbitrumUsdtSwapper     | 0x2906ae98fdAf225a697a09158D10843A89CF0FC5 | Liquidation Swapper                      |
| StargateArbitrumUsdtLevSwapper  | 0xa6247E6FbA04354AfD4D688De946AE1370b3C15E | Leverage Swapper                         |

# Oracles

| Chain | Token                 | Address                                    |
| ----- | --------------------- | ------------------------------------------ |
| Avax  | Joe USDC.e/WAVAX LP   | 0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85 |
| Avax  | Joe WAVAX/USDC LP     | 0xF8B72e847e648BC87c8269FE258cbe908Fa2A71d |
| Avax  | Pangolin USDC.e/WAVAX | 0x1e21573cfc456f8aDd4C27ff16B50112e3adC7aC |

# Popsicle

| Contract                        | Address                                    | Note             |
| ------------------------------- | ------------------------------------------ | ---------------- |
| Popsicle Degenbox (Limone)      | 0xD825d06061fdc0585e4373F0A3F01a8C02b0e6A4 |                  |
| PopsicleCauldronV2MultiChain    | 0xfe0f13fD5f928539C5bc377c8200a699FC95Ca02 |                  |
| CauldronV3MC_Limone_Avalanche   | 0xf24F4cf3E272eF412D0d4764909141B39CC878CF | Cauldron V3 MC   |
| CauldronV3_1MC_Limone_Avalanche | 0x16ebACab63581e69d6F7594C9Eb1a05dF808ea75 | Cauldron V3.1 MC |

### Popsicle Cauldrons

| Contract                       | Address                                    | Note                                                                          |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| **USDC.e/WAVAX**               |                                            |                                                                               |
| PopsicleUsdcAvaxCauldron       | 0x3Cf232F346934B949b99797d225Bb72734731990 | 85% LTV, 8% liquidation fee, 1% borrow fee, 1.5% Interest, Using CauldronV3   |
| Oracle                         | 0x0E1eA2269D6e22DfEEbce7b0A4c6c3d415b5bC85 | reusing existing Joe USDC/WAVAX jLP oracle                                    |
| PopsicleUsdcAvaxSwapperV3      | 0x0B76afC2E52f84E04Ee3fb1961277783Fb804750 | Liquidation Swapper using Platypus                                            |
| PopsicleUsdcAvaxLevSwapperV2   | 0x7d76568d84de8A0F34BBf315F53d7772c1fABcD8 | Leverage Swapper using Platypus                                               |
| **sAVAX/wAVAX**                |                                            |                                                                               |
| PopsicleJoeSavaxWavaxCauldron  | 0x562Db5B5E95961760806A0435aa292c34919eC47 | 75% LTV, 12.5% liquidation fee, 1% borrow fee, 1% Interest                    |
| TraderJoeSAVAXWAVAXProxyOracle | 0x0CC93802f800cCee67914c3072e80d23e920a3e2 | Inverted LP price of 1 sAVAX/wAVAX LP                                         |
| JoeSavaxWavaxSwapperV1         | 0x1B77fDaBAa7FefD55f4aC075B6E817b8d773315b | Using 0x aggregator                                                           |
| JoeSavaxWavaxLevSwapperV1      | 0xEf05d8747a6Fc81509fb37EcF6b1a2D39290d881 | Using 0x aggregator                                                           |
| **wAVAX/USDC**                 |                                            |                                                                               |
| Cauldron                       | 0x0dFb2cebae775c083911DFc39F7B1596E80D0ecB | 85% LTV, 8% liquidation fee, 1% borrow fee, 1.5% Interest, Using CauldronV3.1 |
| Oracle                         | 0xF8B72e847e648BC87c8269FE258cbe908Fa2A71d | Inverted LP price of 1 wAVAX/USDC Joe LP                                      |
| Swapper                        | 0x08a47F1F14292b0655B70588C76b614f64074db4 | Using 0x aggregator                                                           |
| LevSwapper                     | 0x49Bd7dB43695c38661067765BE9484F8177B13f3 | Using 0x aggregator                                                           |
