// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "../interfaces/IOracle.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "@boringcrypto/boring-solidity/contracts/interfaces/IERC20.sol";
import "../libraries/FixedPoint.sol";

// solhint-disable not-rely-on-time

// adapted from https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleSlidingWindowOracle.sol

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

contract SpellTWAPOracle is IOracle {
    using FixedPoint for *;
    using BoringMath for uint256;
    uint256 public constant PERIOD = 10 minutes;
    IAggregator public constant ETH_USD = IAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
    IUniswapV2Pair public constant pair = IUniswapV2Pair(0xb5De0C3753b6E1B4dBA616Db82767F17513E6d4E);

    IERC20 public constant SSPELL = IERC20(0x26FA3fFFB6EfE8c1E69103aCb4044C26B9A106a9);
    IERC20 public constant SPELL = IERC20(0x090185f2135308BaD17527004364eBcC2D37e5F6);

    struct PairInfo {
        uint256 priceCumulativeLast;
        uint32 blockTimestampLast;
        uint144 priceAverage;
    }

    PairInfo public pairInfo;
    function _get(uint32 blockTimestamp) public view returns (uint256) {
        uint256 priceCumulative = pair.price0CumulativeLast();

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pair).getReserves();
        priceCumulative += uint256(FixedPoint.fraction(reserve1, reserve0)._x) * (blockTimestamp - blockTimestampLast); // overflows ok

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        return priceCumulative;
    }

    function toSSpell(uint256 amount) internal view returns (uint256) {
        return amount.mul(SPELL.balanceOf(address(SSPELL))) / SSPELL.totalSupply();
    }

    // Get the latest exchange rate, if no valid (recent) rate is available, return false
    /// @inheritdoc IOracle
    function get(bytes calldata data) external override returns (bool, uint256) {
        uint32 blockTimestamp = uint32(block.timestamp);
        if (pairInfo.blockTimestampLast == 0) {
            pairInfo.blockTimestampLast = blockTimestamp;
            pairInfo.priceCumulativeLast = _get(blockTimestamp);
            return (false, 0);
        }
        uint32 timeElapsed = blockTimestamp - pairInfo.blockTimestampLast; // overflow is desired
        if (timeElapsed < PERIOD) {
            return (true, pairInfo.priceAverage);
        }

        uint256 priceCumulative = _get(blockTimestamp);
        pairInfo.priceAverage = uint144(1e44 / toSSpell(uint256(FixedPoint
            .uq112x112(uint224((priceCumulative - pairInfo.priceCumulativeLast) / timeElapsed))
            .mul(1e18)
            .decode144())).mul(uint256(ETH_USD.latestAnswer())));
        pairInfo.blockTimestampLast = blockTimestamp;
        pairInfo.priceCumulativeLast = priceCumulative;

        return (true, pairInfo.priceAverage);
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata data) public view override returns (bool, uint256) {
        uint32 blockTimestamp = uint32(block.timestamp);
        if (pairInfo.blockTimestampLast == 0) {
            return (false, 0);
        }
        uint32 timeElapsed = blockTimestamp - pairInfo.blockTimestampLast; // overflow is desired
        if (timeElapsed < PERIOD) {
            return (true, pairInfo.priceAverage);
        }

        uint256 priceCumulative = _get(blockTimestamp);
        uint144 priceAverage = uint144(1e44 / toSSpell(uint256(FixedPoint
            .uq112x112(uint224((priceCumulative - pairInfo.priceCumulativeLast) / timeElapsed))
            .mul(1e18)
            .decode144())).mul(uint256(ETH_USD.latestAnswer())));

        return (true, priceAverage);
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        rate = 1e44 / toSSpell(reserve1.mul(1e18) / reserve0).mul(uint256(ETH_USD.latestAnswer()));
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public view override returns (string memory) {
        return "SSpell TWAP CHAINLINK";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return "SSpell";
    }
}
