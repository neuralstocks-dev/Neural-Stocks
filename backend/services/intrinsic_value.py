"""Intrinsic-value anchors — Graham Number + 1-year Residual Income Model.

Why two methods, not one:
  * Graham Number is asset-/earnings-based and works brilliantly for banks,
    industrials, materials, utilities, REITs — the asset-heavy sectors where
    book value is a meaningful proxy for fair value.
  * Residual Income Model (RIM) uses accounting earnings + cost of equity
    (CAPM), so it works for profitable tech/services where Graham fails
    (intangible-heavy book value undercounts goodwill, IP, brand). It also
    handles the negative-FCF-but-positive-NI gap that breaks DCF.

Why NOT DCF:
  * Multi-year FCF projections require analyst estimates not in yfinance
    free tier.
  * Long-horizon model (5–10 years) is structurally mismatched with the
    app's 4–12 week horizon — DCF noise dominates anything useful at that
    timeframe.
  * WACC requires multiple judgment calls; assumption sensitivity grows
    multiplicatively. Incompatible with the deterministic, auditable inputs
    approach we use elsewhere in the verdict-accuracy pipeline.

Output is one anchor object per analysis. The LLM consumes it via the new
`intrinsic_value_anchor` field in each prompt's JSON schema and uses it to
inform `fundamental_analysis` prose. Frontend surfaces it in a small chip
inside the fundamentals module.
"""
from __future__ import annotations
import math
from typing import Literal


# Sector-aware applicability gating ------------------------------------------
#
# These sets reflect where each method is structurally appropriate. A
# misclassified sector (e.g. yfinance assigns "Technology" to a hardware
# manufacturer that's really asset-heavy) just falls into the "neither
# fits" branch and is skipped — silent degradation, no misleading number.
_GRAHAM_FRIENDLY_SECTORS = {
    "Financial Services",
    "Financials",
    "Banks",
    "Utilities",
    "Industrials",
    "Materials",
    "Basic Materials",
    "Real Estate",
    "Energy",
    "Consumer Defensive",
    "Consumer Cyclical",  # autos, retail — usually book-value-meaningful
}

# Tech / services / health where intangibles dominate book value. Graham
# generally produces meaninglessly low estimates for these. RIM uses
# earnings power, so it captures intangible value indirectly.
_INTANGIBLE_HEAVY_SECTORS = {
    "Technology",
    "Communication Services",
    "Healthcare",
}


# Risk-free rate by market — used in CAPM cost of equity.
# Roughly tracks 10Y sovereign yields as of 2026; review annually. Stored
# as constants rather than fetched live to keep the calculator deterministic
# (an audit trail of "this estimate used a 4.2% risk-free rate" is more
# valuable than a 2bp daily fluctuation).
_RISK_FREE_RATE = {
    "US": 0.042,   # 10Y UST
    "ID": 0.068,   # IDR 10Y govt yield
}

# Equity risk premium — Damodaran-style. Higher for emerging markets to
# reflect country / liquidity / governance risk.
_EQUITY_RISK_PREMIUM = {
    "US": 0.055,
    "ID": 0.075,
}


def _market_for_ticker(ticker: str) -> str:
    """Route the ticker to its market for risk-free + ERP selection."""
    return "ID" if ticker.upper().endswith(".JK") else "US"


def _safe_float(value) -> float | None:
    """Coerce yfinance values defensively. yfinance frequently returns
    None, NaN, or floats wrapped in numpy types — all are treated as
    missing. Numeric zero is preserved (real signal)."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


# Graham Number --------------------------------------------------------------

def compute_graham_number(eps: float | None, bvps: float | None) -> dict:
    """Classic Graham Number = sqrt(22.5 × EPS × BVPS).

    The 22.5 constant comes from Graham's "P/E × P/B ≤ 22.5" rule (i.e.
    P/E ≤ 15 AND P/B ≤ 1.5 — multiplied gives 22.5).

    Returns a dict with `estimate` (None when inputs invalid) and a string
    `applicability` reason so the caller can render an honest empty state.
    """
    eps = _safe_float(eps)
    bvps = _safe_float(bvps)
    if eps is None or bvps is None:
        return {"estimate": None, "applicability": "missing_data"}
    if eps <= 0:
        # Graham's formula breaks on negative earnings — sqrt of negative.
        return {"estimate": None, "applicability": "negative_earnings"}
    if bvps <= 0:
        # Negative book value → distressed balance sheet, no Graham anchor.
        return {"estimate": None, "applicability": "negative_book_value"}
    estimate = math.sqrt(22.5 * eps * bvps)
    return {
        "estimate": round(estimate, 2),
        "applicability": "high_fit",
        "inputs": {"eps_ttm": eps, "bvps": bvps},
    }


# Residual Income Model (1-year, perpetuity-style simplification) ------------

def compute_rim(
    bvps: float | None,
    roe: float | None,
    beta: float | None,
    ticker: str,
) -> dict:
    """1-year RIM intrinsic estimate.

    Formula: Intrinsic = BVPS + (ROE × BVPS − r_e × BVPS) / r_e
                       = BVPS × (1 + (ROE − r_e) / r_e)
                       = BVPS × ROE / r_e   (algebraic simplification)

    where r_e = risk_free + beta × ERP (CAPM).

    This is the perpetuity form of RIM under stable-state assumption (ROE
    constant). For a 4–12 week research horizon this is far more honest
    than projecting 5+ years of declining excess returns — those projections
    would carry more noise than signal.

    Edge cases:
      * ROE ≤ 0 → loss-making company, no meaningful anchor
      * BVPS ≤ 0 → distressed balance sheet
      * beta missing → use 1.0 as market-average default (documented in output)
      * ROE > 100% (e.g. SBUX with negative equity) → ROE is unrepresentative,
        skip rather than produce an absurd estimate
    """
    bvps = _safe_float(bvps)
    roe = _safe_float(roe)
    beta = _safe_float(beta)
    if bvps is None or roe is None:
        return {"estimate": None, "applicability": "missing_data"}
    if bvps <= 0:
        return {"estimate": None, "applicability": "negative_book_value"}
    if roe <= 0:
        return {"estimate": None, "applicability": "negative_earnings"}
    if roe > 1.0:
        # ROE > 100% almost always means anomalous balance sheet (negative
        # or near-zero equity from buybacks, e.g. SBUX, MCD, HD historically).
        # The RIM perpetuity-form yields a meaningless multiple of book value.
        return {"estimate": None, "applicability": "low_fit_unrepresentative_roe"}

    market = _market_for_ticker(ticker)
    rf = _RISK_FREE_RATE[market]
    erp = _EQUITY_RISK_PREMIUM[market]
    beta_used = beta if beta is not None and beta > 0 else 1.0
    cost_of_equity = rf + beta_used * erp

    if cost_of_equity <= 0:
        # Defensive: shouldn't be reachable with positive rf + erp + beta,
        # but guards against future config edits that flip a sign.
        return {"estimate": None, "applicability": "invalid_cost_of_equity"}

    if roe <= cost_of_equity:
        # Company earning less than its cost of equity → fair value is at
        # OR BELOW book. The perpetuity form still works (returns a number
        # close to but below BVPS), but flag the finding for the LLM.
        estimate = bvps * roe / cost_of_equity
        return {
            "estimate": round(estimate, 2),
            "applicability": "high_fit_value_destroying",
            "inputs": {
                "bvps": bvps, "roe": roe, "beta": beta_used,
                "risk_free": rf, "erp": erp, "cost_of_equity": round(cost_of_equity, 4),
            },
        }

    estimate = bvps * roe / cost_of_equity
    return {
        "estimate": round(estimate, 2),
        "applicability": "high_fit",
        "inputs": {
            "bvps": bvps, "roe": roe, "beta": beta_used,
            "risk_free": rf, "erp": erp, "cost_of_equity": round(cost_of_equity, 4),
        },
    }


# Auto-selection -------------------------------------------------------------

def _classify_premium(pct: float) -> Literal[
    "deep_discount", "modest_discount", "fair", "modest_premium", "deep_premium"
]:
    """Translate a numeric premium into a human label for the UI/LLM. Bands
    chosen to be informative without being false-precision — a 5% gap is
    noise; a 30% gap is a story."""
    if pct <= -25:
        return "deep_discount"
    if pct <= -7:
        return "modest_discount"
    if pct < 7:
        return "fair"
    if pct < 25:
        return "modest_premium"
    return "deep_premium"


def compute_intrinsic_anchor(
    fundamentals: dict | None,
    ticker: str,
    current_price: float | None,
) -> dict:
    """Compute Graham + RIM anchors and auto-select the primary one.

    Selection rules:
      1. Sector is in `_GRAHAM_FRIENDLY_SECTORS` AND Graham produced an
         estimate → primary = Graham (asset-heavy stocks; both methods
         usually agree, Graham is simpler/more transparent).
      2. Else if RIM produced a `high_fit` or `high_fit_value_destroying`
         estimate → primary = RIM.
      3. Else if Graham produced an estimate (Tech with profitable EPS) →
         primary = Graham (better than nothing, with a low-fit caveat).
      4. Else → primary = none, anchor is omitted from the verdict.

    Returns a flat dict that's safe to JSON-serialize and pass to the LLM.
    """
    if not isinstance(fundamentals, dict):
        return {"primary_anchor": "none", "reason": "no_fundamentals"}

    eps = fundamentals.get("trailingEps")
    bvps = fundamentals.get("bookValue")
    roe = fundamentals.get("returnOnEquity")
    beta = fundamentals.get("beta")
    sector = (fundamentals.get("sector") or "").strip()

    graham = compute_graham_number(eps, bvps)
    rim = compute_rim(bvps, roe, beta, ticker)

    # Selection
    if sector in _GRAHAM_FRIENDLY_SECTORS and graham["estimate"] is not None:
        primary_method = "graham"
    elif rim["estimate"] is not None and rim["applicability"].startswith("high_fit"):
        primary_method = "rim"
    elif graham["estimate"] is not None:
        # Tech/intangible-heavy sector but Graham still has positive EPS+BVPS.
        # Use it but flag low_fit so the LLM knows to caveat.
        primary_method = "graham"
    else:
        return {
            "primary_anchor": "none",
            "reason": rim["applicability"] if rim["estimate"] is None else "no_method_fit",
            "graham": graham,
            "rim": rim,
            "sector": sector,
        }

    primary_estimate = graham["estimate"] if primary_method == "graham" else rim["estimate"]
    cur = _safe_float(current_price)
    if cur is None or cur <= 0 or primary_estimate is None or primary_estimate <= 0:
        premium_pct = None
        interpretation = None
    else:
        # Negative pct = trading BELOW intrinsic anchor (potential discount).
        premium_pct = round((cur - primary_estimate) / primary_estimate * 100, 1)
        interpretation = _classify_premium(premium_pct)

    # When sector is intangible-heavy AND we picked Graham as fallback,
    # downgrade applicability so the LLM caveats the prose.
    primary_applicability = (
        graham["applicability"] if primary_method == "graham" else rim["applicability"]
    )
    if (
        primary_method == "graham"
        and sector in _INTANGIBLE_HEAVY_SECTORS
    ):
        primary_applicability = "low_fit_intangible_heavy"

    return {
        "primary_anchor": primary_method,
        "primary_estimate": primary_estimate,
        "primary_applicability": primary_applicability,
        "current_price": cur,
        "premium_to_anchor_pct": premium_pct,
        "interpretation": interpretation,
        "graham": graham,
        "rim": rim,
        "sector": sector,
        "market": _market_for_ticker(ticker),
    }
