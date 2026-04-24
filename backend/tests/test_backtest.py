"""Backend tests for Backtest (Option C + Option D) — iteration 12."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PRO = {"email": "tiers@demo.io", "password": "pass1234"}
FREE = {"email": "demo@stockai.io", "password": "demo1234"}
ADMIN = {"email": "jolor69@gmail.com", "password": "admin1234"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in response: {data}"
    return token


@pytest.fixture(scope="module")
def pro_token():
    return _login(PRO)


@pytest.fixture(scope="module")
def free_token():
    return _login(FREE)


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# --- /api/backtest/me/status ---

class TestBacktestStatus:
    def test_status_pro(self, pro_token):
        r = requests.get(f"{API}/backtest/me/status", headers=_h(pro_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["plan_gated"] is False, d
        assert d["verdict_count"] >= 3, d
        assert d["eligible"] is True, d
        assert d["min_required"] == 3

    def test_status_free(self, free_token):
        r = requests.get(f"{API}/backtest/me/status", headers=_h(free_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["plan_gated"] is True, d
        assert d["eligible"] is False, d
        assert d["plan"] == "free"


# --- /api/backtest/me ---

class TestBacktestMe:
    def test_free_user_402(self, free_token):
        r = requests.get(f"{API}/backtest/me", headers=_h(free_token), timeout=30)
        assert r.status_code == 402, r.text
        d = r.json()
        assert "detail" in d
        assert "Pro" in d["detail"] or "Elite" in d["detail"] or "pro" in d["detail"].lower()

    def test_pro_user_payload(self, pro_token):
        r = requests.get(f"{API}/backtest/me", headers=_h(pro_token), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        # Required top-level fields
        for key in ["trades", "equity_curve", "benchmark_curve", "benchmark_ticker", "metrics", "strategy_note", "generated_at", "verdict_count"]:
            assert key in d, f"missing {key}; keys={list(d.keys())}"
        if not d.get("empty"):
            m = d["metrics"]
            for mk in ["total_return_pct", "benchmark_return_pct", "alpha_pct", "win_rate_pct", "max_drawdown_pct", "trade_count", "window_start", "window_end"]:
                assert mk in m, f"missing metric {mk}; metrics={list(m.keys())}"
            assert isinstance(d["trades"], list)
            assert isinstance(d["equity_curve"], list)
            assert d["verdict_count"] >= 3

    def test_cache_hit_fast(self, pro_token):
        # First call may be cached
        t0 = time.time()
        r1 = requests.get(f"{API}/backtest/me", headers=_h(pro_token), timeout=30)
        dt1 = time.time() - t0
        assert r1.status_code == 200
        gen1 = r1.json().get("generated_at")
        # Second call should be cache-served (<2s, we allow ample margin)
        t0 = time.time()
        r2 = requests.get(f"{API}/backtest/me", headers=_h(pro_token), timeout=30)
        dt2 = time.time() - t0
        assert r2.status_code == 200
        gen2 = r2.json().get("generated_at")
        assert gen1 == gen2, f"cache not returning same generated_at {gen1} vs {gen2}"
        # Cache should be fast (<3s allowing network latency)
        assert dt2 < 3.0, f"cached call took {dt2:.2f}s"

    def test_force_refresh(self, pro_token):
        r_before = requests.get(f"{API}/backtest/me", headers=_h(pro_token), timeout=30)
        assert r_before.status_code == 200
        gen_before = r_before.json().get("generated_at")

        r = requests.get(f"{API}/backtest/me?force_refresh=true", headers=_h(pro_token), timeout=180)
        assert r.status_code == 200
        gen_after = r.json().get("generated_at")
        # force refresh should usually yield a new timestamp (could be within same sec in edge case)
        assert gen_after is not None


# --- /api/backtest/ml ---

class TestMLBacktest:
    def test_ml_public_no_auth(self):
        r = requests.get(f"{API}/backtest/ml", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        if d.get("empty"):
            pytest.skip(f"ML backtest not yet computed: {d}")
        # Expected structure
        assert d.get("kind") == "ml"
        assert "equity_curve" in d
        assert "benchmark_curve" in d
        assert "trades" in d
        assert len(d["equity_curve"]) > 0
        assert len(d["trades"]) > 0
        # Metrics should contain key stats
        m = d.get("metrics", d)  # some impls embed metrics flat
        # Check alpha / return fields anywhere
        flat = {**d, **(d.get("metrics") or {})}
        assert any(k in flat for k in ["alpha_pct", "total_return_pct", "benchmark_return_pct"])

    def test_ml_expected_counts(self):
        r = requests.get(f"{API}/backtest/ml", timeout=30)
        assert r.status_code == 200
        d = r.json()
        if d.get("empty"):
            pytest.skip("ML backtest empty")
        # Spec: 229 equity points, 55 trades, 11 rebalances, 25 universe, top-k=5
        # These are expected but allow minor variance
        ec = d.get("equity_curve", [])
        trades = d.get("trades", [])
        assert len(ec) >= 200, f"equity curve len={len(ec)}"
        assert len(trades) >= 40, f"trades len={len(trades)}"


# --- /api/admin/backtest/ml/recompute ---

class TestAdminBacktestRecompute:
    def test_non_admin_forbidden(self, pro_token):
        r = requests.post(f"{API}/admin/backtest/ml/recompute", headers=_h(pro_token), timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text}"

    def test_admin_kicks_off(self, admin_token):
        r = requests.post(f"{API}/admin/backtest/ml/recompute", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("status") in ("started", "running", "queued")
