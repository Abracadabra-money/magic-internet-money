pragma solidity >=0.8.10;

import "./Babylonian.sol";

/// @title SolidlyStableCurve
/// @author Barry Lyndon
/// @notice Fair value calculation of an AMM using rule x^3y + xy^3 = k.
/// @dev See /docs/fairLPValue.doc for an explanation of the algorithm
library SolidlyStableCurve {
    uint256 internal constant PRECISION = 1e18;
    uint256 internal constant DOUBLE_PRECISION = 1e36;
    // TODO: Test; 10k or 100k may be more appropriate
    uint256 internal constant PRICE_CUTOFF = PRECISION / 1000_000;

    function _k(uint256 r0, uint256 r1) internal pure returns (uint256 k) {
        // Should be safe; the pair used the same calculation to vet the trade
        uint256 r00 = (r0 * r0) / PRECISION;
        uint256 r11 = (r1 * r1) / PRECISION;
        uint256 r01 = (r0 * r1) / PRECISION;
        k = (r00 * r01) / PRECISION + (r01 * r11) / PRECISION;
    }

    /// Solves specifically THIS cubic:
    ///
    ///   v^3 - 3pv^2 + 3v - p
    ///
    /// for p in (0, 1) using Newton's method.
    /// Not safe to generalize. Not even guaranteed for p = 1 * PRECISION.
    function _solveCubic(uint256 p) internal pure returns (uint256 v) {
        uint256 p_triple = p * DOUBLE_PRECISION;
        uint256 three_double = 3 * DOUBLE_PRECISION;

        // v = 0
        uint256 v_next = p / 3;
        while (v < v_next) {
            v = v_next;
            // Note that we are keeping precision; this is safe for p < 1.0
            uint256 vv_double = v * v;
            uint256 three_pv_double = 3 * p * v;
            // Triple / double = single precicion
            // No underflow: see docs; numerator and denominator are positive.
            v_next = (vv_double * v + p_triple - three_pv_double * v) / (3 * vv_double + three_double - 2 * three_pv_double);
        }
    }

    /// Fourth root of a single-precision number, the simple wa
    /// @param x Positive number assumed to have 18 digits of precision
    /// @param r Approximate positive real fourth root; "quarter" precision
    function _fourthRoot_1e5(uint256 x) internal pure returns (uint256 r) {
        // TODO: Inline and skip the guessing logic the second time?
        uint256 s = 10 * Babylonian.sqrt(x); // Precision 10^10
        r = Babylonian.sqrt(s); // Precision 10^5
    }

    // Assumes px < py, and p = px / py
    function _calculate(uint256 k, uint256 p) internal pure returns (uint256 x_1e5, uint256 y_1e23) {
        uint256 v = _solveCubic(p);

        // Numerator: double-precision; fits by construction of k. We can
        // probably increase precision even more, but I do not want to count
        // Denominator: third power fits by construction of v.
        x_1e5 = _fourthRoot_1e5((k * PRECISION) / (v + (v * v * v) / DOUBLE_PRECISION));
        y_1e23 = x_1e5 * v;
    }

    /// @param r0 Reported reserves of first token. 18 decimals assumed.
    /// @param r1 Reported reserves of second token. 18 decimals assumed.
    /// @param p0 Price of 1.0 first token. 18 decimals assumed.
    /// @param p1 Price of 1.0 second token. 18 decimals assumed.
    /// @notice `p0` and `p1` must use the same units.
    /// @return totalValue All liquidity. Precision and units of `p0` and `p1`.
    function totalValue(
        uint256 r0,
        uint256 r1,
        uint256 p0,
        uint256 p1
    ) internal pure returns (uint256 totalValue) {
        uint256 k = _k(r0, r1); // Single precision, as per the contract

        if (p0 == p1) {
            // 2 * p0 * (k/2)^(1/4).
            // A factor 2^4 will fit into k by construction:
            return (p0 * _fourthRoot_1e5(8*k)) / 1e5;
        }

        uint256 px;
        uint256 py;
        // TODO: Special-case a high price difference
        if (p0 < p1) {
            (px, py) = (p0, p1);
        } else {
            (py, px) = (p0, p1);
        }

        // Risks overflowing if this does not fit...
        uint256 p = (px * PRECISION) / py;
        uint256 x_1e5;
        uint256 y_1e23;

        if (p < PRICE_CUTOFF) {
            (x_1e5, y_1e23) = _calculate(k, PRICE_CUTOFF);
            x_1e5 = (x_1e5 * p) / PRICE_CUTOFF;
            y_1e23 = (y_1e23 * p) / PRICE_CUTOFF;
        } else {
            (x_1e5, y_1e23) = _calculate(k, p);
        }
        totalValue = (px * x_1e5) / 1e5 + (py * y_1e23) / 1e23;
    }
}
