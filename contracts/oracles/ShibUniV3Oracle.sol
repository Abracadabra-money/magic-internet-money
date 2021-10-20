// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
import '@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol';
import "../interfaces/IOracle.sol";

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}
contract ShibUniV3ChainlinkOracle is IOracle {
    using LowGasSafeMath for uint256; // Keep everything in uint256
    IAggregator public constant ETH_USD = IAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
    uint32 public constant period = 10 minutes;
    address public constant pool = 0x5764a6F2212D502bC5970f9f129fFcd61e5D7563;
    address public constant SHIB = 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint128 private constant BASE_AMOUNT = 1e18;

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {

        int24 timeWeightedTick = OracleLibrary.consult(pool, period);

        uint256 priceETH = OracleLibrary.getQuoteAtTick(
            timeWeightedTick,
            BASE_AMOUNT,
            SHIB,
            WETH
        );

        return 1e44 / priceETH.mul(uint256(ETH_USD.latestAnswer()));
    }

    // Get the latest exchange rate
    /// @inheritdoc IOracle
    function get(bytes calldata) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        (, rate) = peek(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public pure override returns (string memory) {
        return "Chainlink UNIV3 SHIB";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/UNIV3 SHIB";
    }
}
