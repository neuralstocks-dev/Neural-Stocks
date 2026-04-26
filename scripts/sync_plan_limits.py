"""Dump backend PLANS limits to a JSON fixture the frontend can import.

This snapshot is the single source of truth for marketing-page copy
assertions. Run it whenever core/config.py PLANS change:

    python /app/scripts/sync_plan_limits.py

The fixture is committed at:
    /app/frontend/src/__fixtures__/plan_limits.json

The marketing-claims regression test reads this fixture and greps the
marketing pages for the exact numbers — so if you change a limit in
config.py, run this script and the test will tell you which pages need
their copy updated.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path("/app/backend")))
from core.config import PLANS  # noqa: E402

OUT = Path("/app/frontend/src/__fixtures__/plan_limits.json")

# Subset of fields that surface in marketing copy. Everything else
# (price, period, copy strings) lives elsewhere and isn't tested.
TIERS = ("free", "pro", "elite", "daypass")
KEYS = (
    "watchlist_limit",
    "analyses_per_day",
    "analyses_per_week",
    "share_per_day",
)


def main():
    snap = {}
    for tier in TIERS:
        if tier not in PLANS:
            continue
        snap[tier] = {k: PLANS[tier].get(k) for k in KEYS}
        # Keep the human-friendly display label too — useful when a backend
        # value is non-null but rendered as "Unlimited" (e.g., elite fair-use).
        snap[tier]["analyses_per_day_display"] = PLANS[tier].get(
            "analyses_per_day_display"
        )
        # Customer-facing plan name (e.g., daypass renders as "Week Pass").
        snap[tier]["name"] = PLANS[tier].get("name")

    # Expose the daypass duration explicitly so marketing pages can be
    # asserted against a single source of truth for "X-day access" copy.
    if "daypass" in PLANS:
        snap["daypass"]["duration_days"] = PLANS["daypass"].get("duration_days")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snap, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {OUT} with tiers: {list(snap.keys())}")


if __name__ == "__main__":
    main()
