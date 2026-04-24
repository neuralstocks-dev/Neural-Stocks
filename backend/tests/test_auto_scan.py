"""Pytest suite for Watchlist Auto-Scan endpoints (Option C).

Covers:
  - GET  /api/auth/me/auto-scan shape for admin
  - POST /api/auth/me/auto-scan enable/disable persistence for admin
  - POST /api/auth/me/auto-scan 402 gate for free user
  - POST /api/auth/me/auto-scan 400 telegram-required for Pro w/o Telegram
  - services.auto_scan import cleanliness and callable signature
"""
import os
import inspect
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("jolor69@gmail.com", "admin1234")
PRO = ("tiers@demo.io", "pass1234")
FREE = ("demo@stockai.io", "demo1234")


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


@pytest.fixture(scope="session")
def pro_headers():
    return {"Authorization": f"Bearer {_login(*PRO)}"}


@pytest.fixture(scope="session")
def free_headers():
    return {"Authorization": f"Bearer {_login(*FREE)}"}


# ─── GET /auth/me/auto-scan — admin shape ──────────────────────────────
class TestAutoScanGet:
    def test_admin_get_shape(self, admin_headers):
        r = requests.get(f"{API}/auth/me/auto-scan", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Required fields
        for key in ("enabled", "telegram_linked", "plan_eligible", "last_run_at", "last_alerts_sent"):
            assert key in data, f"missing key: {key}"
        # Admin: eligible + telegram linked
        assert data["plan_eligible"] is True
        assert data["telegram_linked"] is True
        assert isinstance(data["enabled"], bool)

    def test_free_user_get_shows_not_eligible(self, free_headers):
        r = requests.get(f"{API}/auth/me/auto-scan", headers=free_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["plan_eligible"] is False
        assert data["enabled"] is False


# ─── POST /auth/me/auto-scan — admin enable/disable persists ───────────
class TestAutoScanToggle:
    def test_admin_enable_then_disable_persists(self, admin_headers):
        # Enable
        r = requests.post(
            f"{API}/auth/me/auto-scan", headers=admin_headers, json={"enabled": True}, timeout=15
        )
        assert r.status_code == 200, r.text
        assert r.json().get("enabled") is True

        # Verify via GET
        r2 = requests.get(f"{API}/auth/me/auto-scan", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["enabled"] is True

        # Disable
        r3 = requests.post(
            f"{API}/auth/me/auto-scan", headers=admin_headers, json={"enabled": False}, timeout=15
        )
        assert r3.status_code == 200
        assert r3.json().get("enabled") is False

        # Verify via GET
        r4 = requests.get(f"{API}/auth/me/auto-scan", headers=admin_headers, timeout=15)
        assert r4.status_code == 200
        assert r4.json()["enabled"] is False


# ─── POST gates ────────────────────────────────────────────────────────
class TestAutoScanGates:
    def test_free_user_gets_402(self, free_headers):
        r = requests.post(
            f"{API}/auth/me/auto-scan", headers=free_headers, json={"enabled": True}, timeout=15
        )
        assert r.status_code == 402, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "pro" in detail or "elite" in detail

    def test_pro_without_telegram_gets_400(self, pro_headers):
        # Check current tg state first
        import sys
        sys.path.insert(0, "/app/backend")
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        cli = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbx = cli[os.environ.get("DB_NAME", "test_database")]
        u = asyncio.get_event_loop().run_until_complete(
            dbx.users.find_one({"email": PRO[0]}, {"telegram_chat_id": 1})
        )
        if u and u.get("telegram_chat_id"):
            pytest.skip(f"{PRO[0]} unexpectedly has telegram_chat_id; can't verify 400 gate")

        r = requests.post(
            f"{API}/auth/me/auto-scan", headers=pro_headers, json={"enabled": True}, timeout=15
        )
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "telegram" in detail


# ─── services.auto_scan import cleanliness ─────────────────────────────
class TestAutoScanServiceModule:
    def test_module_imports_and_callable(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from services import auto_scan  # should not raise
        assert hasattr(auto_scan, "run_auto_scan_batch")
        assert inspect.iscoroutinefunction(auto_scan.run_auto_scan_batch)
        sig = inspect.signature(auto_scan.run_auto_scan_batch)
        assert len(sig.parameters) == 0, "run_auto_scan_batch should take no args"
        assert hasattr(auto_scan, "auto_scan_loop")
        assert inspect.iscoroutinefunction(auto_scan.auto_scan_loop)
