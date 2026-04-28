"""Unit tests for the Phase-1 Bandarmology enrichment (services/idx_rapidapi.py).

Scope: `enrich_bandarmology()` + helper functions. Verifies:
  - Volume gate triggers on low rel-vol and softens the label
  - Multi-day persistence windows (30d + 90d) compute from dated filings
  - Normalized impact correctly buckets into material/notable/cosmetic
  - Shallow-copy behaviour — the raw cached dict is NOT mutated
  - Graceful fallback when inputs are missing (no history / no quote)

These signals run LOCALLY without any upstream broker-summary feed, so we
can test them with synthetic inputs and zero network I/O.
"""
from datetime import datetime, timedelta, timezone

from services.idx_rapidapi import (
    _impact_tier,
    _label_persistence,
    _rolling_accumulation,
    enrich_bandarmology,
)


def _filing(date_str: str, action: str, shares: int):
    """Shape-compatible with upstream /insider movement items."""
    return {
        "date": date_str,
        "action_type": action,
        "changes": {"value": f"{'+' if action == 'BUY' else '-'}{shares:,}"},
    }


def _date_str(days_ago: int) -> str:
    """Return a 'DD MMM YY' string N days ago — matches upstream format."""
    d = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return d.strftime("%d %b %y").lstrip("0")


def _base_bandar(buy=1_000_000, sell=500_000, label="Mild accumulation", movements=None):
    """Minimum-viable raw bandarmology dict mirroring `get_bandarmology()`."""
    return {
        "symbol": "TEST.JK",
        "regime": "mild_accumulation",
        "label": label,
        "accumulation_ratio": 0.67,
        "smart_money_accumulation": 0.62,
        "buy_shares": buy,
        "sell_shares": sell,
        "buy_count": 3,
        "sell_count": 1,
        "smart_money_buy_shares": 400_000,
        "smart_money_sell_shares": 200_000,
        "foreign_net_shares": 100_000,
        "total_movements": (movements and len(movements)) or 4,
        "recent": [],
        "source": "rapidapi.idx",
        "_raw_movements": movements or [],
    }


# ---------------------------------------------------------------------------
# Helper-level tests
# ---------------------------------------------------------------------------

def test_impact_tier_thresholds():
    assert _impact_tier(0.01) == "cosmetic"
    assert _impact_tier(0.24) == "cosmetic"
    assert _impact_tier(0.25) == "notable"
    assert _impact_tier(0.99) == "notable"
    assert _impact_tier(1.0) == "material"
    assert _impact_tier(3.5) == "material"


def test_persistence_label_bands():
    assert _label_persistence(None) == "insufficient_data"
    assert _label_persistence(0.75) == "persistent_accumulation"
    assert _label_persistence(0.60) == "mild_accumulation"
    assert _label_persistence(0.50) == "balanced"
    assert _label_persistence(0.40) == "mild_distribution"
    assert _label_persistence(0.30) == "persistent_distribution"


def test_rolling_accumulation_window():
    # 3 buys in last 15d, 1 sell in 45d window (outside 30d)
    movements = [
        _filing(_date_str(2), "BUY", 100_000),
        _filing(_date_str(8), "BUY", 200_000),
        _filing(_date_str(14), "BUY", 150_000),
        _filing(_date_str(45), "SELL", 300_000),
    ]
    w30 = _rolling_accumulation(movements, 30)
    w90 = _rolling_accumulation(movements, 90)
    assert w30 is not None and w30["filings"] == 3
    assert w30["ratio"] == 1.0  # 100% buys in 30d
    assert w90 is not None and w90["filings"] == 4
    # 30d < 90d → 90d window is more balanced
    assert w90["ratio"] < w30["ratio"]


def test_rolling_accumulation_insufficient_data_returns_none():
    # Only 1 movement in window → None
    movements = [_filing(_date_str(2), "BUY", 100_000)]
    assert _rolling_accumulation(movements, 30) is None


# ---------------------------------------------------------------------------
# enrich_bandarmology — end-to-end
# ---------------------------------------------------------------------------

def test_enrichment_volume_gate_trips_on_low_rel_vol():
    bandar = _base_bandar()
    # 21 days of history. Last day's volume = 10, prior 20 avg = 100 → rel_vol = 0.1
    history = [{"close": 100, "volume": 100} for _ in range(20)]
    history.append({"close": 100, "volume": 10})
    quote = {"price": 100, "market_cap": 100_000_000_000}

    out = enrich_bandarmology(bandar, history, quote)

    assert out["rel_volume_20d"] == 0.1
    assert out["volume_gate_tripped"] is True
    assert out["confidence_adjusted_label"].endswith("low-liquidity caveat")


def test_enrichment_volume_gate_clean_on_healthy_volume():
    bandar = _base_bandar()
    # Rel_vol = 1.0 → gate clean
    history = [{"close": 100, "volume": 100} for _ in range(21)]
    quote = {"price": 100, "market_cap": 100_000_000_000}

    out = enrich_bandarmology(bandar, history, quote)

    assert out["rel_volume_20d"] == 1.0
    assert out["volume_gate_tripped"] is False
    assert out["confidence_adjusted_label"] == "Mild accumulation"


def test_enrichment_multi_day_persistence_consistent():
    movements = [
        _filing(_date_str(5), "BUY", 500_000),
        _filing(_date_str(10), "BUY", 400_000),
        _filing(_date_str(25), "BUY", 300_000),  # 30d window
        _filing(_date_str(55), "BUY", 200_000),  # 90d-only
        _filing(_date_str(70), "BUY", 100_000),  # 90d-only
    ]
    bandar = _base_bandar(movements=movements)
    out = enrich_bandarmology(bandar, history=None, quote=None)

    assert out["persistence_30d"]["ratio"] == 1.0
    assert out["persistence_90d"]["ratio"] == 1.0
    assert out["persistence_label"] == "persistent_accumulation"
    assert out["persistence_consistent"] is True


def test_enrichment_multi_day_persistence_inconsistent():
    # 30d window: heavy sell. 90d window: balanced thanks to older buys.
    movements = [
        _filing(_date_str(5), "SELL", 500_000),
        _filing(_date_str(15), "SELL", 400_000),
        _filing(_date_str(60), "BUY", 900_000),
    ]
    bandar = _base_bandar(movements=movements)
    out = enrich_bandarmology(bandar, history=None, quote=None)

    assert out["persistence_30d"]["ratio"] == 0.0
    assert out["persistence_90d"]["ratio"] == 0.5
    # Inconsistent windows → persistence_consistent is False
    assert out["persistence_consistent"] is False


def test_enrichment_normalized_impact_material():
    # net_shares = 500k, price = 100 → net_value = 50M. mcap = 5B → 1.0% = material
    bandar = _base_bandar(buy=1_000_000, sell=500_000)
    quote = {"price": 100, "market_cap": 5_000_000_000}

    out = enrich_bandarmology(bandar, history=None, quote=quote)

    assert out["normalized_impact_pct"] == 1.0
    assert out["impact_tier"] == "material"


def test_enrichment_normalized_impact_cosmetic():
    # 0.05% → cosmetic
    bandar = _base_bandar(buy=1_000_000, sell=500_000)
    quote = {"price": 100, "market_cap": 100_000_000_000}

    out = enrich_bandarmology(bandar, history=None, quote=quote)

    assert out["normalized_impact_pct"] < 0.25
    assert out["impact_tier"] == "cosmetic"


def test_enrichment_does_not_mutate_cached_input():
    """The cache holds `_raw_movements` — if we mutate the cached dict,
    subsequent enrichment calls (after cache hit) won't have the movements
    list to compute persistence from. Verify the original stays intact."""
    movements = [_filing(_date_str(5), "BUY", 100_000), _filing(_date_str(10), "BUY", 100_000)]
    cached = _base_bandar(movements=movements)
    original_keys = set(cached.keys())

    out = enrich_bandarmology(cached, history=None, quote=None)

    # Original dict untouched
    assert set(cached.keys()) == original_keys
    assert cached["_raw_movements"] == movements
    # Output has enrichment but no raw_movements (stripped to avoid bloating storage)
    assert "rel_volume_20d" in out
    assert "_raw_movements" not in out


def test_enrichment_handles_missing_inputs_gracefully():
    out = enrich_bandarmology(_base_bandar(), history=None, quote=None)
    assert out["rel_volume_20d"] is None
    assert out["volume_gate_tripped"] is False
    assert out["normalized_impact_pct"] is None
    assert out["impact_tier"] is None
    assert out["persistence_30d"] is None  # no movements provided
    assert out["persistence_label"] == "insufficient_data"


def test_enrichment_on_none_returns_none():
    assert enrich_bandarmology(None, history=[], quote={}) is None
