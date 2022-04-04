// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "../interfaces/IOracle.sol";

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

interface IERC20 {
    function decimals() external pure returns (uint8);
}

interface IUniswapV2Pair {
    function totalSupply() external view returns (uint256);

    function token0() external view returns (address);

    function token1() external view returns (address);

    function getReserves()
        external
        view
        returns (
            uint112 reserve0,
            uint112 reserve1,
            uint32 blockTimestampLast
        );
}

/// @title LPChainlinkOracleV1
/// @author BoringCrypto, 0xCalibur
/// @notice Oracle used for getting the price of an LP token
/// @dev Optimized version based on https://blog.alphafinance.io/fair-lp-token-pricing/
/// @dev Implementing IOracle so it can be used directly as a standard Abracadabra inverted USD price feed
/// but also as a chainlink-compatible middleware oracle
///
/// For example:
/// USDC.e/WAVAX will need LPChainlinkOracleV1 to report LP price in AVAX then another oracle to consume
/// it to convert the price from AVAX to USD and report the inverted price.
/// But, in the case of USDC.e/USDT.e we don't need another oracle since the LP is already in USD and we
/// can use `peekSpot` directly from this contract.
contract LPChainlinkOracleV1 is IAggregator, IOracle {
    IUniswapV2Pair public immutable pair;
    AggregatorV3Interface public immutable tokenOracle;
    uint8 public immutable token0Decimals;
    uint8 public immutable token1Decimals;
    uint8 public immutable oracleDecimals;
    string private desc;

    uint256 public constant WAD = 18;

    /// @param pair_ The UniswapV2 compatible pair address
    /// @param tokenOracle_ The token price 1 lp should be denominated with.
    /// @param desc_ The oracle description
    constructor(
        IUniswapV2Pair pair_,
        AggregatorV3Interface tokenOracle_,
        string memory desc_
    ) {
        pair = pair_;
        tokenOracle = tokenOracle_;
        desc = desc_;

        token0Decimals = IERC20(pair_.token0()).decimals();
        token1Decimals = IERC20(pair_.token1()).decimals();

        oracleDecimals = tokenOracle_.decimals();
    }

    // credit for this implementation goes to
    // https://github.com/abdk-consulting/abdk-libraries-solidity/blob/master/ABDKMath64x64.sol
    // solhint-disable-next-line code-complexity
    function sqrt(uint256 x) internal pure returns (uint128) {
        if (x == 0) return 0;
        uint256 xx = x;
        uint256 r = 1;
        if (xx >= 0x100000000000000000000000000000000) {
            xx >>= 128;
            r <<= 64;
        }
        if (xx >= 0x10000000000000000) {
            xx >>= 64;
            r <<= 32;
        }
        if (xx >= 0x100000000) {
            xx >>= 32;
            r <<= 16;
        }
        if (xx >= 0x10000) {
            xx >>= 16;
            r <<= 8;
        }
        if (xx >= 0x100) {
            xx >>= 8;
            r <<= 4;
        }
        if (xx >= 0x10) {
            xx >>= 4;
            r <<= 2;
        }
        if (xx >= 0x8) {
            r <<= 1;
        }
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1; // Seven iterations should be enough
        uint256 r1 = x / r;
        return uint128(r < r1 ? r : r1);
    }

    /// Calculates the lastest exchange rate
    /// @return the price of 1 lp in token price
    /// Exemple:
    /// - For 1 AVAX = $82
    /// - Total LP Value is: $160,000,000
    /// - LP supply is 8.25
    /// - latestAnswer() returns 234420638348190662349201 / 1e18 = 234420.63 AVAX
    /// - 1 LP = 234420.63 AVAX => 234420.63 * 8.25 * 82 = ≈$160,000,000
    function latestAnswer() public view override returns (int256) {
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair).getReserves();
        uint256 totalSupply = pair.totalSupply();

        uint256 normalizedReserve0 = reserve0 * (10**(WAD - token0Decimals));
        uint256 normalizedReserve1 = reserve1 * (10**(WAD - token1Decimals));

        uint256 k = normalizedReserve0 * normalizedReserve1;
        (, int256 priceFeed, , , ) = tokenOracle.latestRoundData();

        uint256 normalizedPriceFeed = uint256(priceFeed) * (10**(WAD - oracleDecimals));

        uint256 totalValue = uint256(sqrt((k / 1e18) * normalizedPriceFeed)) * 2;
        return int256((totalValue * 1e18) / totalSupply);
    }

    /// @notice Returns 1 USD price in LP denominated in USD
    /// @dev latestAnswer() returns the price of 1 LP in token denominator.
    /// It's then inverted so it gives how many LP can 1 USD buy.
    function _get() internal view returns (uint256) {
        return 1e36 / uint256(latestAnswer());
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
    function name(bytes calldata) public view override returns (string memory) {
        return desc;
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return desc;
    }
}
