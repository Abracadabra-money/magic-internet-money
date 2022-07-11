Configuration to use in hardhat.config.ts when UniswapV3 Math libs are used

```json
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
```
