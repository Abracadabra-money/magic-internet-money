// SPDX-License-Identifier: AGPL-3.0-only
// Using the same Copyleft License as in the original Repository
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;
import "../interfaces/IOracle.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/interfaces/IERC20.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Factory.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IUniswapV2Pair.sol";
import "../libraries/FixedPoint.sol";

import "hardhat/console.sol";

// solhint-disable not-rely-on-time

// adapted from https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleSlidingWindowOracle.sol
interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

contract XJoeOracleV2 is IOracle {
    using FixedPoint for *;
    using BoringMath for uint256;
    uint256 public constant PERIOD = 10 minutes;
    IAggregator public constant AVAX_USD = IAggregator(0x0A77230d17318075983913bC2145DB16C7366156);
    IUniswapV2Pair public constant JOE_AVAX = IUniswapV2Pair(0x454E67025631C065d3cFAD6d71E6892f74487a15);
    IERC20 public constant JOE = IERC20(0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd);
    IERC20 public constant XJOE = IERC20(0x57319d41F71E81F3c65F2a47CA4e001EbAFd4F33);

    struct PairInfo {
        uint256 priceCumulativeLast;
        uint32 blockTimestampLast;
        uint144 priceAverage;
    }

    PairInfo public pairInfo;

    function _get(uint32 blockTimestamp) public view returns (uint256) {
        uint256 priceCumulative = JOE_AVAX.price0CumulativeLast();

        // if time has elapsed since the last update on the pair, mock the accumulated price values
        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(JOE_AVAX).getReserves();
        priceCumulative += uint256(FixedPoint.fraction(reserve1, reserve0)._x) * (blockTimestamp - blockTimestampLast); // overflows ok

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        return priceCumulative;
    }

    function toXJOE(uint256 amount) internal view returns (uint256) {
        return amount.mul(JOE.balanceOf(address(XJOE))) / XJOE.totalSupply();
    }

    // Get the latest exchange rate, if no valid (recent) rate is available, return false
    /// @inheritdoc IOracle
    function get(bytes calldata) external override returns (bool, uint256) {
        uint32 blockTimestamp = uint32(block.timestamp);
        if (pairInfo.blockTimestampLast == 0) {
            pairInfo.blockTimestampLast = blockTimestamp;
            pairInfo.priceCumulativeLast = _get(blockTimestamp);
            return (false, 0);
        }
        uint32 timeElapsed = blockTimestamp - pairInfo.blockTimestampLast; // overflow is desired
        console.log(timeElapsed);
        if (timeElapsed < PERIOD) {
            return (true, pairInfo.priceAverage);
        }

        uint256 priceCumulative = _get(blockTimestamp);
        pairInfo.priceAverage = uint144(
            1e44 /
                toXJOE(
                    uint256(
                        FixedPoint.uq112x112(uint224((priceCumulative - pairInfo.priceCumulativeLast) / timeElapsed)).mul(1e18).decode144()
                    )
                ).mul(uint256(AVAX_USD.latestAnswer()))
        );
        pairInfo.blockTimestampLast = blockTimestamp;
        pairInfo.priceCumulativeLast = priceCumulative;

        return (true, pairInfo.priceAverage);
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata) public view override returns (bool, uint256) {
        uint32 blockTimestamp = uint32(block.timestamp);
        if (pairInfo.blockTimestampLast == 0) {
            return (false, 0);
        }
        uint32 timeElapsed = blockTimestamp - pairInfo.blockTimestampLast; // overflow is desired
        if (timeElapsed < PERIOD) {
            return (true, pairInfo.priceAverage);
        }

        uint256 priceCumulative = _get(blockTimestamp);
        uint144 priceAverage = uint144(
            1e44 /
                toXJOE(
                    uint256(
                        FixedPoint.uq112x112(uint224((priceCumulative - pairInfo.priceCumulativeLast) / timeElapsed)).mul(1e18).decode144()
                    )
                ).mul(uint256(AVAX_USD.latestAnswer()))
        );

        return (true, priceAverage);
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata) external view override returns (uint256 rate) {
        (uint256 reserve0, uint256 reserve1, ) = JOE_AVAX.getReserves();
        rate = 1e44 / toXJOE(reserve1.mul(1e18) / reserve0).mul(uint256(AVAX_USD.latestAnswer()));
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public view override returns (string memory) {
        return "xJOE TWAP";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return "xJOE";
    }
}
