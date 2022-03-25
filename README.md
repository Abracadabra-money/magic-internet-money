# Magic Internet Money

It's magic!

# Testing

```
yarn test
```

# License

The Kashi code is licensed from BoringCrypto and is licensed only to Abracadabra.

# Troubleshooting
## CauldronV2MultiChain Master Contract Deployment
Deploying `contracts\CauldronV2MultiChain.sol` seems to cause problem once it's time to verify the source code on etherscan-alike with solc-input. Sending solc-input has the advantage of not requiring sending the whole source code for verification.

But it fails at the verification process, `etherscan-verify` mention older solidity version might cause the issue: https://github.com/ethereum/solidity/issues/9573 

At this stage, `etherscan-verify` then tries to submit the whole source but also fails as the source code is too large to be sent for verification.

A workaround is to use the CauldronV2Multichain version in `contracts-flat` folder and use the following `solc` parameter when compiling:

```
"contracts/CauldronV2Multichain.sol": {
    version: "0.6.12",
    settings: {
        optimizer: {
        enabled: true,
        runs: 999999,
        },
    },
},
```

This might also be caused by `pragma experimental ABIEncoderV2;` which is present in unflatten `CauldronV2MultiChain` but not in the flatten version, but further experimentation would be require to confirm it.
