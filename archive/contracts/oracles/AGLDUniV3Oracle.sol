// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
import "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";
import "../interfaces/IOracle.sol";

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

contract AGLDUniV3ChainlinkOracle is IOracle {
    using LowGasSafeMath for uint256; // Keep everything in uint256
    IAggregator public constant ETH_USD = IAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
    uint32 public constant period = 10 minutes;
    address public constant pool = 0x5d752F322beFB038991579972e912B02F61A3DDA;
    address public constant AGLD = 0x32353A6C91143bfd6C7d363B546e62a9A2489A20;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint128 private constant BASE_AMOUNT = 1e18;

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {
        int24 timeWeightedTick = OracleLibrary.consult(pool, period);

        uint256 priceETH = OracleLibrary.getQuoteAtTick(timeWeightedTick, BASE_AMOUNT, AGLD, WETH);

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
        return "Chainlink UNIV3 AGLD";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public pure override returns (string memory) {
        return "LINK/UNIV3 AGLD";
    }
}
