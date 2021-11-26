// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "../interfaces/IOracle.sol";

// Chainlink Aggregator

interface IAggregator {
    function latestAnswer() external view returns (int256 answer);
}

interface IWOHM {
    function sOHMTowOHM( uint256 _amount ) external view returns ( uint256 );
}

contract wOHMOracle is IOracle {
    using BoringMath for uint256; // Keep everything in uint256

    IAggregator public constant ohmOracle = IAggregator(0x90c2098473852E2F07678Fe1B6d595b1bd9b16Ed);
    IAggregator public constant ethUSDOracle = IAggregator(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419);
    IWOHM public constant WOHM = IWOHM(0xCa76543Cf381ebBB277bE79574059e32108e3E65);

    // Calculates the lastest exchange rate
    // Uses both divide and multiply only for tokens not supported directly by Chainlink, for example MKR/USD
    function _get() internal view returns (uint256) {
        return 1e44 / (uint256(1e18).mul(uint256(ohmOracle.latestAnswer()).mul(uint256(ethUSDOracle.latestAnswer()))) / WOHM.sOHMTowOHM(1e9));
    }

    // Get the latest exchange rate
    /// @inheritdoc IOracle
    function get(bytes calldata) public override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata ) public view override returns (bool, uint256) {
        return (true, _get());
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        (, rate) = peek(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public view override returns (string memory) {
        return "wOHM Chainlink";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return "LINK/wOHM";
    }
}
