"""Regression: intrinsic-value anchor calculator.

Locks in the contract so future refactors can't silently regress:
  * Graham: positive EPS+BVPS → estimate; negative EPS → skip; missing → skip
  * RIM: profitable + positive book → estimate; loss-making → skip;
    anomalous ROE>100% → skip; uses CAPM with US/IDR risk-free routing
  * Auto-selection: Graham wins for asset-heavy sectors, RIM for tech, none
    for loss-makers
  * Premium classification bands at -25 / -7 / +7 / +25
"""
import math
import pytest

from services.intrinsic_value import (
    compute_graham_number,
    compute_rim,
    compute_intrinsic_anchor,
    _classify_premium,
)


class TestGrahamNumber:
    def test_typical_bank(self):
        # BBCA-style: EPS ≈ 480, BVPS ≈ 2900 → sqrt(22.5 × 480 × 2900) ≈ 5594
        r = compute_graham_number(eps=480, bvps=2900)
        assert r["applicability"] == "high_fit"
        assert 5500 < r["estimate"] < 5700

    def test_negative_earnings_skipped(self):
        r = compute_graham_number(eps=-1.5, bvps=20)
        assert r["estimate"] is None
        assert r["applicability"] == "negative_earnings"

    def test_negative_book_value_skipped(self):
        r = compute_graham_number(eps=2, bvps=-5)
        assert r["estimate"] is None
        assert r["applicability"] == "negative_book_value"

    def test_missing_inputs(self):
        assert compute_graham_number(eps=None, bvps=20)["estimate"] is None
        assert compute_graham_number(eps=2, bvps=None)["estimate"] is None
        assert compute_graham_number(eps=float("nan"), bvps=20)["estimate"] is None


class TestRIM:
    def test_profitable_us_tech(self):
        # MSFT-style: ROE 35%, BVPS $25, beta 0.9 → cost_of_equity = 4.2 + 0.9 × 5.5 = 9.15%
        # Intrinsic = 25 × 0.35 / 0.0915 ≈ 95.6
        r = compute_rim(bvps=25, roe=0.35, beta=0.9, ticker="MSFT")
        assert r["applicability"] == "high_fit"
        assert 90 < r["estimate"] < 102
        assert r["inputs"]["risk_free"] == 0.042
        assert r["inputs"]["erp"] == 0.055

    def test_idx_market_uses_higher_risk_free(self):
        r = compute_rim(bvps=2900, roe=0.18, beta=1.1, ticker="BBCA.JK")
        assert r["inputs"]["risk_free"] == 0.068
        assert r["inputs"]["erp"] == 0.075

    def test_negative_roe_skipped(self):
        r = compute_rim(bvps=10, roe=-0.05, beta=1.0, ticker="LOSS")
        assert r["estimate"] is None
        assert r["applicability"] == "negative_earnings"

    def test_anomalous_roe_skipped(self):
        # SBUX historically has negative equity → ROE > 100%, not real
        r = compute_rim(bvps=1, roe=2.5, beta=0.8, ticker="SBUX")
        assert r["estimate"] is None
        assert r["applicability"] == "low_fit_unrepresentative_roe"

    def test_value_destroying_company(self):
        # ROE 6%, cost of equity 9.15% → intrinsic BELOW book value
        r = compute_rim(bvps=20, roe=0.06, beta=0.9, ticker="WEAK")
        assert r["estimate"] is not None
        assert r["estimate"] < 20  # below book
        assert r["applicability"] == "high_fit_value_destroying"

    def test_missing_beta_uses_default(self):
        r = compute_rim(bvps=25, roe=0.20, beta=None, ticker="X")
        assert r["estimate"] is not None
        assert r["inputs"]["beta"] == 1.0


class TestPremiumClassification:
    @pytest.mark.parametrize("pct,expected", [
        (-30, "deep_discount"),
        (-25, "deep_discount"),
        (-15, "modest_discount"),
        (-7, "modest_discount"),
        (0, "fair"),
        (5, "fair"),
        (7, "modest_premium"),
        (15, "modest_premium"),
        (25, "deep_premium"),
        (50, "deep_premium"),
    ])
    def test_band_boundaries(self, pct, expected):
        assert _classify_premium(pct) == expected


class TestIntrinsicAnchorAutoSelection:
    def _bbca_fundamentals(self):
        return {
            "sector": "Financial Services",
            "trailingEps": 480,
            "bookValue": 2900,
            "returnOnEquity": 0.18,
            "beta": 1.1,
        }

    def _msft_fundamentals(self):
        return {
            "sector": "Technology",
            "trailingEps": 11.5,
            "bookValue": 25,
            "returnOnEquity": 0.35,
            "beta": 0.9,
        }

    def test_bank_selects_graham(self):
        r = compute_intrinsic_anchor(self._bbca_fundamentals(), "BBCA.JK", 6900)
        assert r["primary_anchor"] == "graham"
        assert r["primary_estimate"] is not None
        # 6900 well above ~5594 Graham → premium
        assert r["premium_to_anchor_pct"] > 0
        assert r["interpretation"] in ("modest_premium", "deep_premium")

    def test_tech_selects_rim(self):
        r = compute_intrinsic_anchor(self._msft_fundamentals(), "MSFT", 380)
        assert r["primary_anchor"] == "rim"
        assert r["primary_estimate"] is not None
        # 380 well above ~95 RIM → deep premium
        assert r["interpretation"] == "deep_premium"

    def test_loss_maker_returns_none(self):
        r = compute_intrinsic_anchor({
            "sector": "Technology",
            "trailingEps": -2.5,
            "bookValue": 5,
            "returnOnEquity": -0.10,
            "beta": 1.5,
        }, "LOSS", 50)
        assert r["primary_anchor"] == "none"

    def test_idx_market_routing(self):
        r = compute_intrinsic_anchor(self._bbca_fundamentals(), "BBCA.JK", 6900)
        assert r["market"] == "ID"
        assert r["rim"]["inputs"]["risk_free"] == 0.068

    def test_us_market_routing(self):
        r = compute_intrinsic_anchor(self._msft_fundamentals(), "MSFT", 380)
        assert r["market"] == "US"
        assert r["rim"]["inputs"]["risk_free"] == 0.042

    def test_intangible_heavy_graham_fallback_is_low_fit(self):
        # Tech sector with positive EPS+BVPS but poor ROE — RIM goes
        # value_destroying, but Graham still has a positive estimate; it
        # gets used as fallback with a low_fit caveat.
        r = compute_intrinsic_anchor({
            "sector": "Technology",
            "trailingEps": 1.5,
            "bookValue": 8,
            "returnOnEquity": 0.04,  # below cost of equity
            "beta": 1.2,
        }, "WEAKTECH", 50)
        # RIM has high_fit_value_destroying → it's primary
        assert r["primary_anchor"] == "rim"

    def test_no_fundamentals_returns_none(self):
        r = compute_intrinsic_anchor(None, "AAPL", 100)
        assert r["primary_anchor"] == "none"

    def test_premium_pct_uses_correct_sign(self):
        """Trading BELOW intrinsic = negative pct = discount."""
        # Build a setup where current_price is well below the estimate.
        r = compute_intrinsic_anchor({
            "sector": "Financial Services",
            "trailingEps": 100, "bookValue": 1000,
            "returnOnEquity": 0.15, "beta": 1.0,
        }, "BANK.JK", 800)
        # Graham ≈ sqrt(22.5 × 100 × 1000) ≈ 1500, current 800 → ~-47%
        assert r["primary_anchor"] == "graham"
        assert r["premium_to_anchor_pct"] < 0
        assert r["interpretation"] == "deep_discount"
