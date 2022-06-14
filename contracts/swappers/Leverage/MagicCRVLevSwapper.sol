// SPDX-License-Identifier: MIT
// solhint-disable func-name-mixedcase, var-name-mixedcase
pragma solidity ^0.8.10;

import "../../interfaces/IBentoBoxV1.sol";
import "../../interfaces/Tether.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/curve/ICurveThreeCryptoPool.sol";
import "../../interfaces/curve/ICurvePool.sol";

interface IMagicCRV is IERC20 {
    function mintFor(uint256 amount, address recipient) external returns (uint256 share);
}

contract MagicCRVLevSwapper {
    IBentoBoxV1 public constant DEGENBOX = IBentoBoxV1(0xd96f48665a1410C0cd669A88898ecA36B9Fc2cce);
    CurvePool public constant MIM3POOL = CurvePool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    CurvePool public constant CRVETH = CurvePool(0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511);
    CurveThreeCryptoPool public constant THREECRYPTO = CurveThreeCryptoPool(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    Tether public constant USDT = Tether(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IERC20 public constant MIM = IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);
    IERC20 public constant WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    IERC20 public constant CRV = IERC20(0xD533a949740bb3306d119CC777fa900bA034cd52);

    IMagicCRV public immutable magicCRV;

    constructor(IMagicCRV _magicCRV) {
        magicCRV = _magicCRV;
        MIM.approve(address(MIM3POOL), type(uint256).max);
        USDT.approve(address(THREECRYPTO), type(uint256).max);
        WETH.approve(address(DEGENBOX), type(uint256).max);
        CRV.approve(address(magicCRV), type(uint256).max);
    }

    function swap(
        address recipient,
        uint256 shareToMin,
        uint256 shareFrom
    ) public returns (uint256 extraShare, uint256 shareReturned) {
        (uint256 amount, ) = DEGENBOX.withdraw(MIM, address(this), address(this), 0, shareFrom);

        // MIM -> USDT
        amount = MIM3POOL.exchange_underlying(0, 3, amount, 0, address(this));

        // USDT -> WETH
        THREECRYPTO.exchange(0, 2, amount, 0);
        amount = WETH.balanceOf(address(this));

        // WETH -> CRV
        amount = CRVETH.exchange(0, 1, amount, 0);

        // CRV -> MagicCRV
        amount = magicCRV.mintFor(amount, address(DEGENBOX));

        (, shareReturned) = DEGENBOX.deposit(magicCRV, address(DEGENBOX), recipient, amount, 0);
        extraShare = shareReturned - shareToMin;
    }
}
