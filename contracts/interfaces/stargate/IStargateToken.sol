// SPDX-License-Identifier: BUSL-1.1
// solhint-disable contract-name-camelcase
pragma solidity >=0.6.12;

interface IStargateToken {
    function allowance(address owner, address spender)
        external
        view
        returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function chainId() external view returns (uint16);

    function decimals() external view returns (uint8);

    function decreaseAllowance(address spender, uint256 subtractedValue)
        external
        returns (bool);

    function dstContractLookup(uint16) external view returns (bytes memory);

    function endpoint() external view returns (address);

    function estimateSendTokensFee(
        uint16 _dstChainId,
        bool _useZro,
        bytes memory txParameters
    ) external view returns (uint256 nativeFee, uint256 zroFee);

    function forceResumeReceive(uint16 _srcChainId, bytes memory _srcAddress)
        external;

    function increaseAllowance(address spender, uint256 addedValue)
        external
        returns (bool);

    function isMain() external view returns (bool);

    function lzReceive(
        uint16 _srcChainId,
        bytes memory _fromAddress,
        uint64 nonce,
        bytes memory _payload
    ) external;

    function name() external view returns (string memory);

    function owner() external view returns (address);

    function pauseSendTokens(bool _pause) external;

    function paused() external view returns (bool);

    function renounceOwnership() external;

    function sendTokens(
        uint16 _dstChainId,
        bytes memory _to,
        uint256 _qty,
        address zroPaymentAddress,
        bytes memory adapterParam
    ) external payable;

    function setConfig(
        uint16 _version,
        uint16 _chainId,
        uint256 _configType,
        bytes memory _config
    ) external;

    function setDestination(
        uint16 _dstChainId,
        bytes memory _destinationContractAddress
    ) external;

    function setReceiveVersion(uint16 version) external;

    function setSendVersion(uint16 version) external;

    function symbol() external view returns (string memory);

    function totalSupply() external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function transferOwnership(address newOwner) external;
}