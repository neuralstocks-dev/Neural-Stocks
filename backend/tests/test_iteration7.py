"""Iteration 7 tests: yearly billing w/ 20% discount, admin login-event deletion,
/billing/config with 4 plan_ids, activate with cycle param.

First /billing/config call may take 10-15s (lazy-creates 4 PayPal billing plans).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASS = "admin1234"
PRO_EMAIL = "tiers@demo.io"
PRO_PASS = "pass1234"
FREE_EMAIL = "demo@stockai.io"
FREE_PASS = "demo1234"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} → {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def pro_token():
    # tiers@demo.io is re-seeded to pro; but even if it's on free, JWT works
    return _login(PRO_EMAIL, PRO_PASS)


@pytest.fixture(scope="session")
def free_token():
    return _login(FREE_EMAIL, FREE_PASS)


# ---------------- GET /admin/pricing new shape ----------------
class TestAdminPricingShape:
    def test_get_pricing_has_new_fields(self, admin_token):
        r = requests.get(f"{API}/admin/pricing", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        required = {"pro_monthly", "elite_monthly", "annual_discount_pct",
                    "pro_yearly", "elite_yearly"}
        assert required.issubset(d.keys()), f"Missing keys: {required - set(d.keys())}"
        for k in required:
            assert isinstance(d[k], (int, float)), f"{k} not numeric"
        # Yearly math: monthly × 12 × (1 - discount/100)
        disc = d["annual_discount_pct"]
        expected_pro_yr = round(d["pro_monthly"] * 12 * (1 - disc / 100.0), 2)
        expected_elite_yr = round(d["elite_monthly"] * 12 * (1 - disc / 100.0), 2)
        assert d["pro_yearly"] == expected_pro_yr
        assert d["elite_yearly"] == expected_elite_yr

    def test_non_admin_gets_403(self, free_token):
        r = requests.get(f"{API}/admin/pricing", headers=_hdr(free_token), timeout=15)
        assert r.status_code == 403


# ---------------- PUT /admin/pricing with discount ----------------
class TestAdminPricingUpdate:
    def test_put_rejects_discount_out_of_range(self, admin_token):
        r = requests.put(
            f"{API}/admin/pricing",
            json={"pro_price": 9, "elite_price": 29, "annual_discount_pct": 95},
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 422

        r2 = requests.put(
            f"{API}/admin/pricing",
            json={"pro_price": 9, "elite_price": 29, "annual_discount_pct": -1},
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r2.status_code == 422

    def test_put_updates_and_returns_four_plan_ids(self, admin_token):
        orig = requests.get(f"{API}/admin/pricing", headers=_hdr(admin_token), timeout=15).json()
        try:
            r = requests.put(
                f"{API}/admin/pricing",
                json={
                    "pro_price": 9,
                    "elite_price": 29,
                    "annual_discount_pct": 20,
                },
                headers=_hdr(admin_token),
                timeout=120,  # may rotate up to 4 PayPal plans
            )
            assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
            d = r.json()
            assert d["ok"] is True
            assert d["prices"]["pro_monthly"] == 9
            assert d["prices"]["elite_monthly"] == 29
            assert d["prices"]["annual_discount_pct"] == 20
            assert d["prices"]["pro_yearly"] == 86.40
            assert d["prices"]["elite_yearly"] == 278.40

            # 4 plan_ids returned
            plan_ids = d["plan_ids"]
            required_keys = {"pro_monthly", "pro_yearly", "elite_monthly", "elite_yearly"}
            assert required_keys.issubset(plan_ids.keys()), (
                f"missing plan keys: {required_keys - set(plan_ids.keys())}"
            )
            for k in required_keys:
                assert isinstance(plan_ids[k], str) and plan_ids[k].startswith("P-"), (
                    f"{k} not a valid PayPal plan id: {plan_ids[k]}"
                )
        finally:
            # Restore original prices
            requests.put(
                f"{API}/admin/pricing",
                json={
                    "pro_price": orig.get("pro_monthly", 9),
                    "elite_price": orig.get("elite_monthly", 29),
                    "annual_discount_pct": orig.get("annual_discount_pct", 20),
                },
                headers=_hdr(admin_token),
                timeout=120,
            )


# ---------------- GET /billing/config 4 plan_ids ----------------
class TestBillingConfigFourPlans:
    def test_returns_four_plan_ids(self, pro_token):
        r = requests.get(f"{API}/billing/config", headers=_hdr(pro_token), timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        d = r.json()
        assert d["env"] == "sandbox"
        assert d["client_id"]
        required = {"pro_monthly", "pro_yearly", "elite_monthly", "elite_yearly"}
        plan_ids = d["plan_ids"]
        assert required.issubset(plan_ids.keys()), (
            f"missing: {required - set(plan_ids.keys())}"
        )
        for k in required:
            assert isinstance(plan_ids[k], str) and plan_ids[k].startswith("P-"), (
                f"{k}: {plan_ids[k]}"
            )
        # prices still present
        assert "prices" in d
        prices = d["prices"]
        assert "pro_monthly" in prices and "pro_yearly" in prices
        assert "elite_monthly" in prices and "elite_yearly" in prices


# ---------------- POST /billing/activate with cycle ----------------
class TestBillingActivateCycle:
    def test_activate_accepts_cycle_yearly_but_fails_paypal_lookup(self, pro_token):
        body = {
            "subscription_id": "I-FAKEYEARLY000",
            "plan": "pro",
            "cycle": "yearly",
        }
        r = requests.post(f"{API}/billing/activate", json=body, headers=_hdr(pro_token), timeout=30)
        # Fake subscription id → PayPal lookup fails → 502 (or 400)
        assert r.status_code in (400, 502), f"unexpected {r.status_code}: {r.text[:200]}"

    def test_activate_default_cycle_monthly(self, pro_token):
        # No cycle → defaults to monthly; still fails with fake id
        body = {"subscription_id": "I-FAKEMONTHLY000", "plan": "elite"}
        r = requests.post(f"{API}/billing/activate", json=body, headers=_hdr(pro_token), timeout=30)
        assert r.status_code in (400, 502)

    def test_activate_rejects_invalid_cycle(self, pro_token):
        body = {"subscription_id": "I-FAKE", "plan": "pro", "cycle": "weekly"}
        r = requests.post(f"{API}/billing/activate", json=body, headers=_hdr(pro_token), timeout=15)
        assert r.status_code == 422


# ---------------- DELETE /admin/logins + POST /admin/logins/delete ----------------
class TestAdminLoginsDelete:
    def test_non_admin_cannot_clear_logins(self, free_token):
        r = requests.delete(f"{API}/admin/logins", headers=_hdr(free_token), timeout=15)
        assert r.status_code == 403

    def test_non_admin_cannot_delete_selected(self, free_token):
        r = requests.post(
            f"{API}/admin/logins/delete",
            json={"ids": ["abc"]},
            headers=_hdr(free_token),
            timeout=15,
        )
        assert r.status_code == 403

    def test_delete_selected_subset(self, admin_token):
        # Generate new login events by triggering a login
        _login(FREE_EMAIL, FREE_PASS)
        _login(FREE_EMAIL, FREE_PASS)

        # Fetch latest
        events = requests.get(
            f"{API}/admin/logins?limit=50", headers=_hdr(admin_token), timeout=15
        ).json()
        assert isinstance(events, list) and len(events) >= 1, "need at least 1 login event"
        # take up to 2 ids
        ids = [e["id"] for e in events[:2] if e.get("id")]
        assert ids, "events missing 'id' field"

        before_count = len(events)
        r = requests.post(
            f"{API}/admin/logins/delete",
            json={"ids": ids},
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        d = r.json()
        assert "removed" in d and isinstance(d["removed"], int)
        assert d["removed"] == len(ids), f"expected {len(ids)} removed, got {d['removed']}"

        # Verify those ids are gone
        events_after = requests.get(
            f"{API}/admin/logins?limit=500", headers=_hdr(admin_token), timeout=15
        ).json()
        remaining_ids = {e["id"] for e in events_after}
        for deleted in ids:
            assert deleted not in remaining_ids, f"{deleted} still present after delete"

    def test_delete_selected_requires_ids(self, admin_token):
        r = requests.post(
            f"{API}/admin/logins/delete",
            json={"ids": []},
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 422  # min_length=1

    def test_clear_all_login_events(self, admin_token):
        # Seed a fresh login
        _login(FREE_EMAIL, FREE_PASS)
        r = requests.delete(f"{API}/admin/logins", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "removed" in d and isinstance(d["removed"], int)
        assert d["removed"] >= 1

        # Verify now empty
        events = requests.get(
            f"{API}/admin/logins?limit=10", headers=_hdr(admin_token), timeout=15
        ).json()
        assert events == [] or len(events) == 0


# ---------------- /plans price shape ----------------
class TestPlansYearly:
    def test_plans_includes_yearly_and_discount(self, admin_token):
        # Ensure defaults first
        requests.put(
            f"{API}/admin/pricing",
            json={"pro_price": 9, "elite_price": 29, "annual_discount_pct": 20},
            headers=_hdr(admin_token),
            timeout=120,
        )
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["pro"]["price_usd"] == 9
        assert d["elite"]["price_usd"] == 29
        # New yearly fields
        assert d["pro"].get("price_yearly") == 86.40
        assert d["elite"].get("price_yearly") == 278.40
        assert d["pro"].get("annual_discount_pct") == 20
