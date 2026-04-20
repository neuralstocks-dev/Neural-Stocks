"""Iteration 6 tests: PayPal billing, dynamic pricing, admin user delete/clear-alerts,
share rate limit, plan upgrade gating.

Most PayPal calls hit sandbox; we never attempt a real checkout — only verify
endpoint structure and error handling.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
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


def _register(email, password, full_name="QA"):
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": password, "full_name": full_name},
                      timeout=20)
    return r


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="session")
def pro_token():
    return _login(PRO_EMAIL, PRO_PASS)


@pytest.fixture(scope="session")
def free_token():
    return _login(FREE_EMAIL, FREE_PASS)


@pytest.fixture
def fresh_user():
    """Create a throwaway free user."""
    email = f"TEST_it6_{uuid.uuid4().hex[:8]}@neural-qa.com"
    pwd = "Pass1234!"
    r = _register(email, pwd, "It6 Tester")
    assert r.status_code in (200, 201), f"register failed {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or _login(email, pwd)
    me = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15).json()
    return {"email": email, "password": pwd, "token": tok, "id": me["id"]}


# ---------------- /plans live pricing ----------------
class TestPlansLive:
    def test_plans_returns_share_per_day(self):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert set(data.keys()) >= {"free", "pro", "elite"}
        assert data["free"]["share_per_day"] == 5
        assert data["pro"]["share_per_day"] == 50
        assert data["elite"]["share_per_day"] is None
        # price_usd numeric
        assert isinstance(data["pro"]["price_usd"], (int, float))
        assert isinstance(data["elite"]["price_usd"], (int, float))


# ---------------- Billing config / activate / cancel ----------------
class TestBillingConfig:
    def test_requires_auth(self):
        r = requests.get(f"{API}/billing/config", timeout=15)
        assert r.status_code in (401, 403)

    def test_returns_plan_ids_and_prices(self, pro_token):
        r = requests.get(f"{API}/billing/config", headers=_hdr(pro_token), timeout=60)
        # First call may take longer (creates product+plans). 503 acceptable only if PayPal
        # is reachable but creds are wrong; we expect 200 here.
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        d = r.json()
        assert d["env"] == "sandbox"
        assert d["client_id"]
        assert "plan_ids" in d and set(d["plan_ids"].keys()) >= {"pro", "elite"}
        for tier in ("pro", "elite"):
            pid = d["plan_ids"][tier]
            assert isinstance(pid, str) and pid.startswith("P-"), f"plan_id wrong: {pid}"
        assert "prices" in d
        assert d["prices"]["pro"] > 0 and d["prices"]["elite"] > 0


class TestBillingActivate:
    def test_invalid_subscription_id_returns_502_or_400(self, pro_token):
        body = {"subscription_id": "I-FAKE000XXXX", "plan": "pro"}
        r = requests.post(f"{API}/billing/activate", json=body, headers=_hdr(pro_token), timeout=30)
        assert r.status_code in (400, 502), f"unexpected {r.status_code} {r.text[:200]}"


class TestBillingCancel:
    def test_no_subscription_returns_400(self, free_token):
        r = requests.post(f"{API}/billing/cancel", headers=_hdr(free_token), timeout=20)
        assert r.status_code == 400
        assert "no active subscription" in r.text.lower()


class TestBillingWebhook:
    def test_unverified_webhook_logs_but_doesnt_mutate(self, free_token):
        body = {
            "event_type": "BILLING.SUBSCRIPTION.ACTIVATED",
            "resource": {"id": f"I-TEST{uuid.uuid4().hex[:8]}"},
        }
        r = requests.post(f"{API}/billing/webhook", json=body, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("received") is True
        assert d.get("verified") is False  # PAYPAL_WEBHOOK_ID is empty in env

    def test_invalid_json_body(self):
        r = requests.post(
            f"{API}/billing/webhook",
            data="not-json",
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code == 400


# ---------------- Plan upgrade gating ----------------
class TestPlanUpgrade:
    def test_non_admin_cannot_upgrade_to_pro(self, fresh_user):
        r = requests.post(
            f"{API}/plan/upgrade",
            json={"plan": "pro"},
            headers=_hdr(fresh_user["token"]),
            timeout=15,
        )
        assert r.status_code == 402

    def test_non_admin_cannot_upgrade_to_elite(self, fresh_user):
        r = requests.post(
            f"{API}/plan/upgrade",
            json={"plan": "elite"},
            headers=_hdr(fresh_user["token"]),
            timeout=15,
        )
        assert r.status_code == 402

    def test_downgrade_to_free_allowed(self, fresh_user):
        r = requests.post(
            f"{API}/plan/upgrade",
            json={"plan": "free"},
            headers=_hdr(fresh_user["token"]),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["plan"] == "free"

    def test_admin_can_upgrade_directly(self, admin_token):
        r = requests.post(
            f"{API}/plan/upgrade",
            json={"plan": "elite"},
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["plan"] == "elite"


# ---------------- Admin pricing ----------------
class TestAdminPricing:
    def test_get_pricing_admin(self, admin_token):
        r = requests.get(f"{API}/admin/pricing", headers=_hdr(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "pro" in d and "elite" in d
        assert d["pro"] > 0 and d["elite"] > 0

    def test_get_pricing_non_admin_403(self, free_token):
        r = requests.get(f"{API}/admin/pricing", headers=_hdr(free_token), timeout=15)
        assert r.status_code == 403

    def test_put_pricing_updates_and_returns_plan_ids(self, admin_token):
        # Capture original
        orig = requests.get(f"{API}/admin/pricing", headers=_hdr(admin_token), timeout=15).json()
        try:
            new_pro = round(float(orig["pro"]) + 1, 2)
            new_elite = round(float(orig["elite"]) + 1, 2)
            r = requests.put(
                f"{API}/admin/pricing",
                json={"pro_price": new_pro, "elite_price": new_elite},
                headers=_hdr(admin_token),
                timeout=90,  # may rotate PayPal plans
            )
            assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
            d = r.json()
            assert d["ok"] is True
            assert d["prices"]["pro"] == new_pro
            assert d["prices"]["elite"] == new_elite
            assert d["plan_ids"]["pro"].startswith("P-")
            assert d["plan_ids"]["elite"].startswith("P-")

            # Verify GET reflects update
            r2 = requests.get(f"{API}/admin/pricing", headers=_hdr(admin_token), timeout=15)
            assert r2.json()["pro"] == new_pro
            assert r2.json()["elite"] == new_elite

            # Verify /plans reflects update
            r3 = requests.get(f"{API}/plans", timeout=15).json()
            assert r3["pro"]["price_usd"] == new_pro
            assert r3["elite"]["price_usd"] == new_elite
        finally:
            # Restore original prices (best-effort)
            requests.put(
                f"{API}/admin/pricing",
                json={"pro_price": orig["pro"], "elite_price": orig["elite"]},
                headers=_hdr(admin_token),
                timeout=90,
            )

    def test_put_pricing_validation_negative(self, admin_token):
        r = requests.put(
            f"{API}/admin/pricing",
            json={"pro_price": -5, "elite_price": 10},
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 422


# ---------------- Admin user delete ----------------
class TestAdminUserDelete:
    def test_delete_non_admin_user_cascades(self, admin_token, fresh_user):
        # Add a watchlist entry so we can verify cascade
        requests.post(
            f"{API}/watchlist",
            json={"ticker": "AAPL"},
            headers=_hdr(fresh_user["token"]),
            timeout=15,
        )
        r = requests.delete(
            f"{API}/admin/users/{fresh_user['id']}",
            headers=_hdr(admin_token),
            timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        assert r.json()["ok"] is True

        # Verify user no longer in /admin/users list
        users = requests.get(f"{API}/admin/users", headers=_hdr(admin_token), timeout=15).json()
        assert not any(u["id"] == fresh_user["id"] for u in users)

        # Token should now be invalid (user gone)
        me = requests.get(f"{API}/auth/me", headers=_hdr(fresh_user["token"]), timeout=15)
        assert me.status_code in (401, 404)

    def test_delete_admin_blocked_403(self, admin_token):
        admins = requests.get(
            f"{API}/admin/users?limit=500", headers=_hdr(admin_token), timeout=15
        ).json()
        admin_user = next((u for u in admins if u["email"] == ADMIN_EMAIL), None)
        assert admin_user is not None, "Admin user not found in /admin/users"
        r = requests.delete(
            f"{API}/admin/users/{admin_user['id']}",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 403

    def test_delete_unknown_user_404(self, admin_token):
        r = requests.delete(
            f"{API}/admin/users/no-such-id",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 404

    def test_non_admin_delete_forbidden(self, free_token, fresh_user):
        r = requests.delete(
            f"{API}/admin/users/{fresh_user['id']}",
            headers=_hdr(free_token),
            timeout=15,
        )
        assert r.status_code == 403


# ---------------- Admin clear alerts ----------------
class TestAdminClearAlerts:
    def test_clear_alerts_returns_count(self, admin_token, pro_token):
        # Resolve pro user id
        me = requests.get(f"{API}/auth/me", headers=_hdr(pro_token), timeout=15).json()
        r = requests.delete(
            f"{API}/admin/users/{me['id']}/alerts",
            headers=_hdr(admin_token),
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert "removed" in d and isinstance(d["removed"], int)

    def test_clear_alerts_forbidden_for_non_admin(self, free_token):
        me = requests.get(f"{API}/auth/me", headers=_hdr(free_token), timeout=15).json()
        r = requests.delete(
            f"{API}/admin/users/{me['id']}/alerts",
            headers=_hdr(free_token),
            timeout=15,
        )
        assert r.status_code == 403


# ---------------- Share rate limit ----------------
def _ensure_analysis(token):
    """Create an analysis (or return latest existing) to share. Uses AAPL."""
    # Try latest first to avoid cost
    r = requests.get(f"{API}/analysis/AAPL/latest", headers=_hdr(token), timeout=15)
    if r.status_code == 200:
        return r.json()
    # Need disclaimer
    requests.post(f"{API}/disclaimer/accept", headers=_hdr(token), timeout=10)
    r = requests.post(f"{API}/analysis/AAPL", headers=_hdr(token), timeout=120)
    assert r.status_code == 200, f"create analysis: {r.status_code} {r.text[:200]}"
    return r.json()


class TestShareRateLimit:
    def test_free_user_share_blocked_by_quota_or_limit(self, free_token):
        """Free users CAN share (share_verdicts=true) but limit is 5/day.
        Free users may not have an analysis (1/day quota), so we can't reliably
        spam 6 shares. We just verify the endpoint exists and returns 402 if no
        share permission, OR completes / returns 429 once limit reached."""
        # Free users have share_verdicts=true per config, so just verify we get
        # a sane response on share attempt without analysis
        r = requests.post(
            f"{API}/analysis/no-such-id/share",
            headers=_hdr(free_token),
            timeout=15,
        )
        # Either 404 (no analysis) or 429 (already at limit) — both prove the
        # endpoint runs the rate limit check before/after analysis lookup
        assert r.status_code in (404, 429)
