# Kashi Lending

Platforms like Compound and Aave allow users to deposit assets as collateral and borrow other assets against this. These protocols have attracted billions of dollars, but they suffer from some major limitations. Taking away these limitations could see much larger adoption. BentoBox aims to do just that.

We solve these issues by having a platform with:

- Isolated lending pairs. Anyone can create a pair, it’s up to users which pairs they find safe enough. Risk is isolated to just that pair.
- Flexible oracles, both on-chain and off-chain.
  Liquid interest rates based on a specific target utilization range, such as 70-80%.
- Contracts optimized for low gas.
- The supplied assets can be used for flash loans, providing extra revenue for suppliers.
- Strategies can provide additional revenue

## Security

An early version was audited by PeckShield and partially by Quantstamp. The thoroughness wasn't overwhelming,
which led to the creation of an internal audit checklist (see checks.txt in the docs folder).

Contracts are covered 100% by tests.

Formal verification is done by Certora.

## Licence

UNLICENCED
