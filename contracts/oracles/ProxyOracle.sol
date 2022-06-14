// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "../interfaces/IOracle.sol";
import "@boringcrypto/boring-solidity/contracts/interfaces/IERC20.sol";
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";

/// @title ProxyOracle
/// @author 0xMerlin
/// @notice Oracle used for getting the price of an oracle implementation
contract ProxyOracle is IOracle, BoringOwnable {
    IOracle public oracleImplementation;

    event LogOracleImplementationChange(IOracle indexed oldOracle, IOracle indexed newOracle);

    constructor() public {}

    function changeOracleImplementation(IOracle newOracle) external onlyOwner {
        IOracle oldOracle = oracleImplementation;
        oracleImplementation = newOracle;
        emit LogOracleImplementationChange(oldOracle, newOracle);
    }

    // Get the latest exchange rate
    /// @inheritdoc IOracle
    function get(bytes calldata data) public override returns (bool, uint256) {
        return oracleImplementation.get(data);
    }

    // Check the last exchange rate without any state changes
    /// @inheritdoc IOracle
    function peek(bytes calldata data) public view override returns (bool, uint256) {
        return oracleImplementation.peek(data);
    }

    // Check the current spot exchange rate without any state changes
    /// @inheritdoc IOracle
    function peekSpot(bytes calldata data) external view override returns (uint256 rate) {
        return oracleImplementation.peekSpot(data);
    }

    /// @inheritdoc IOracle
    function name(bytes calldata) public view override returns (string memory) {
        return "Proxy Oracle";
    }

    /// @inheritdoc IOracle
    function symbol(bytes calldata) public view override returns (string memory) {
        return "Proxy";
    }
}
