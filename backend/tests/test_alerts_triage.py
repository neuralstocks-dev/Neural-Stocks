"""Backend tests for Smart Alert Triage feature (iteration 15).

Covers:
- Router migration (GET /alerts, POST /alerts/{id}/read, POST /alerts/read_all)
- Filter query param (all|unread|starred|taken|archived)
- Triage actions (star, archive, taken)
- Stats + resolve_pending
- 404 on non-existent and wrong-user alert_id
"""
import os
import pytest
import requests


def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASS = "admin1234"
FREE_EMAIL = "demo@stockai.io"
FREE_PASS = "demo1234"


def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def free_token():
    return _login(FREE_EMAIL, FREE_PASS)


@pytest.fixture(scope="module")
def admin_alerts(admin_token):
    r = requests.get(f"{BASE_URL}/api/alerts?filter=all&limit=200", headers=_hdr(admin_token), timeout=30)
    assert r.status_code == 200
    return r.json()


# ─── Router migration ───────────────────────────────────────────────────
class TestRouterMigration:
    def test_get_alerts_still_works(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/alerts", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_mark_all_read(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/alerts/read_all", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_mark_read_single(self, admin_token, admin_alerts):
        if not admin_alerts:
            pytest.skip("No alerts for admin")
        aid = admin_alerts[0]["id"]
        r = requests.post(f"{BASE_URL}/api/alerts/{aid}/read", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_mark_read_nonexistent_404(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/alerts/does-not-exist-xyz/read", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 404


# ─── Filter param ───────────────────────────────────────────────────────
class TestFilters:
    @pytest.mark.parametrize("flt", ["all", "unread", "starred", "taken", "archived"])
    def test_filter_returns_200(self, admin_token, flt):
        r = requests.get(f"{BASE_URL}/api/alerts?filter={flt}", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200, f"{flt} filter failed: {r.text}"
        assert isinstance(r.json(), list)

    def test_invalid_filter_rejected(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/alerts?filter=bogus", headers=_hdr(admin_token), timeout=30)
        assert r.status_code in (400, 422)

    def test_admin_has_many_alerts(self, admin_alerts):
        assert len(admin_alerts) >= 1, f"Admin expected >=1 alerts, got {len(admin_alerts)}"

    def test_all_filter_excludes_archived(self, admin_token):
        all_list = requests.get(f"{BASE_URL}/api/alerts?filter=all", headers=_hdr(admin_token), timeout=30).json()
        for a in all_list:
            assert a.get("archived") is not True, f"archived alert {a.get('id')} leaked into all"


# ─── Star action ────────────────────────────────────────────────────────
class TestStar:
    def test_star_toggle_and_filter(self, admin_token, admin_alerts):
        if not admin_alerts:
            pytest.skip("No alerts")
        aid = admin_alerts[0]["id"]
        try:
            # Star
            r = requests.post(f"{BASE_URL}/api/alerts/{aid}/star",
                              headers=_hdr(admin_token),
                              json={"starred": True}, timeout=30)
            assert r.status_code == 200
            assert r.json()["starred"] is True

            # Verify via starred filter
            starred = requests.get(f"{BASE_URL}/api/alerts?filter=starred",
                                   headers=_hdr(admin_token), timeout=30).json()
            ids = [a["id"] for a in starred]
            assert aid in ids, f"{aid} not in starred filter"
        finally:
            # Cleanup
            requests.post(f"{BASE_URL}/api/alerts/{aid}/star",
                          headers=_hdr(admin_token),
                          json={"starred": False}, timeout=30)

    def test_star_nonexistent_404(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/alerts/ghost-id-xyz/star",
                          headers=_hdr(admin_token),
                          json={"starred": True}, timeout=30)
        assert r.status_code == 404

    def test_star_wrong_user_404(self, free_token, admin_alerts):
        if not admin_alerts:
            pytest.skip("No admin alerts")
        aid = admin_alerts[0]["id"]
        r = requests.post(f"{BASE_URL}/api/alerts/{aid}/star",
                          headers=_hdr(free_token),
                          json={"starred": True}, timeout=30)
        assert r.status_code == 404


# ─── Archive action ─────────────────────────────────────────────────────
class TestArchive:
    def test_archive_toggle(self, admin_token, admin_alerts):
        if not admin_alerts:
            pytest.skip("No alerts")
        # Find a non-taken alert to archive to avoid disrupting taken fixture
        candidate = next((a for a in admin_alerts if not a.get("taken")), admin_alerts[0])
        aid = candidate["id"]
        try:
            r = requests.post(f"{BASE_URL}/api/alerts/{aid}/archive",
                              headers=_hdr(admin_token),
                              json={"archived": True}, timeout=30)
            assert r.status_code == 200
            assert r.json()["archived"] is True

            # Shows in archived filter
            arch = requests.get(f"{BASE_URL}/api/alerts?filter=archived",
                                headers=_hdr(admin_token), timeout=30).json()
            assert aid in [a["id"] for a in arch]

            # Excluded from default all
            all_list = requests.get(f"{BASE_URL}/api/alerts?filter=all",
                                    headers=_hdr(admin_token), timeout=30).json()
            assert aid not in [a["id"] for a in all_list], "archived alert still in default inbox"

            # Archived implies read=true
            arch_items = [a for a in arch if a["id"] == aid]
            if arch_items:
                assert arch_items[0].get("read") is True
        finally:
            requests.post(f"{BASE_URL}/api/alerts/{aid}/archive",
                          headers=_hdr(admin_token),
                          json={"archived": False}, timeout=30)

    def test_archive_nonexistent_404(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/alerts/ghost-archive/archive",
                          headers=_hdr(admin_token),
                          json={"archived": True}, timeout=30)
        assert r.status_code == 404


# ─── Taken action (real yfinance) ───────────────────────────────────────
class TestTaken:
    def test_taken_on_hold_rejected(self, admin_token, admin_alerts):
        hold_alert = next((a for a in admin_alerts if a.get("signal") == "HOLD"), None)
        if not hold_alert:
            pytest.skip("No HOLD alert available")
        r = requests.post(f"{BASE_URL}/api/alerts/{hold_alert['id']}/taken",
                          headers=_hdr(admin_token),
                          json={"taken": True}, timeout=60)
        assert r.status_code == 400

    def test_taken_lifecycle_on_aapl(self, admin_token, admin_alerts):
        # Prefer AAPL, fall back to MSFT/TSLA, else first BUY/SELL
        aapl = [a for a in admin_alerts
                if a.get("ticker") == "AAPL" and a.get("signal") in ("BUY", "SELL")
                and not a.get("taken")]
        if not aapl:
            aapl = [a for a in admin_alerts
                    if a.get("ticker") in ("MSFT", "TSLA")
                    and a.get("signal") in ("BUY", "SELL") and not a.get("taken")]
        if not aapl:
            aapl = [a for a in admin_alerts
                    if a.get("signal") in ("BUY", "SELL") and not a.get("taken")]
        if not aapl:
            pytest.skip("No suitable BUY/SELL alert to test taken lifecycle")

        alert = aapl[0]
        aid = alert["id"]
        try:
            # Mark taken
            r = requests.post(f"{BASE_URL}/api/alerts/{aid}/taken",
                              headers=_hdr(admin_token),
                              json={"taken": True}, timeout=60)
            assert r.status_code == 200, f"taken failed: {r.status_code} {r.text}"
            body = r.json()
            assert body["taken"] is True
            assert "entry_price" in body and body["entry_price"] > 0

            # Verify via taken filter
            taken_list = requests.get(f"{BASE_URL}/api/alerts?filter=taken",
                                      headers=_hdr(admin_token), timeout=30).json()
            found = [a for a in taken_list if a["id"] == aid]
            assert found, "alert not in taken filter"
            assert found[0].get("taken") is True
            assert found[0].get("entry_price") is not None
            assert found[0].get("taken_at") is not None
            assert found[0].get("read") is True

            # Stats reflects >=1 taken
            stats = requests.get(f"{BASE_URL}/api/alerts/stats",
                                 headers=_hdr(admin_token), timeout=60).json()
            assert stats["total_taken"] >= 1
            assert "signal" in stats["by_type"] or alert.get("type") in stats["by_type"]
        finally:
            # Reset
            r = requests.post(f"{BASE_URL}/api/alerts/{aid}/taken",
                              headers=_hdr(admin_token),
                              json={"taken": False}, timeout=30)
            assert r.status_code == 200
            # Verify clear
            lst = requests.get(f"{BASE_URL}/api/alerts?filter=taken",
                               headers=_hdr(admin_token), timeout=30).json()
            assert aid not in [a["id"] for a in lst], "taken state not cleared"

    def test_taken_nonexistent_404(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/alerts/ghost-taken/taken",
                          headers=_hdr(admin_token),
                          json={"taken": True}, timeout=30)
        assert r.status_code == 404


# ─── Stats + resolve_pending ────────────────────────────────────────────
class TestStatsAndResolve:
    def test_stats_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/alerts/stats", headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_taken", "total_resolved", "total_active", "total_wins",
                  "total_losses", "total_break_even", "overall_win_rate_pct",
                  "overall_avg_pnl_pct", "resolve_horizon_days", "by_type"]:
            assert k in d, f"missing key {k}"
        assert d["resolve_horizon_days"] == 20
        assert isinstance(d["by_type"], dict)

    def test_resolve_pending_endpoint(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/alerts/resolve_pending",
                          headers=_hdr(admin_token), timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert "resolved" in d
        assert isinstance(d["resolved"], int)

    def test_free_user_stats_empty(self, free_token):
        r = requests.get(f"{BASE_URL}/api/alerts/stats", headers=_hdr(free_token), timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["total_taken"] >= 0
        if d["total_taken"] == 0:
            assert d["overall_win_rate_pct"] is None
            assert d["overall_avg_pnl_pct"] is None


# ─── Unauthenticated ────────────────────────────────────────────────────
class TestUnauth:
    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/alerts", timeout=30)
        assert r.status_code in (401, 403)

    def test_stats_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/alerts/stats", timeout=30)
        assert r.status_code in (401, 403)
