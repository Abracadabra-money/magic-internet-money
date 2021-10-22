{
    // We are always skipping mocks and interfaces, add specific files here
    skipFiles: [
        "libraries/FixedPoint.sol",
        "libraries/FullMath.sol",
        "libraries/SignedSafeMath.sol",
        "flat/BentoBoxFlat.sol",
        "flat/KashiPairFlat.sol",
        "flat/SushiSwapSwapperFlat.sol",
        "mocks/",
        "interfaces/"
    ],
}