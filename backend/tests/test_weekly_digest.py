"""Backend tests for Weekly RF Digest feature (iteration 14)."""
import os
import inspect
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
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data, f"no token in response: {data}"
    return data["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def free_token():
    return _login(FREE_EMAIL, FREE_PASS)


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── Module import + signatures ─────────────────────────────────────────────
class TestModuleImport:
    def test_module_imports_cleanly(self):
        from services import weekly_digest  # noqa: F401
        assert hasattr(weekly_digest, "run_weekly_digest_batch")
        assert hasattr(weekly_digest, "weekly_digest_loop")

    def test_functions_are_async(self):
        from services.weekly_digest import run_weekly_digest_batch, weekly_digest_loop
        assert inspect.iscoroutinefunction(run_weekly_digest_batch)
        assert inspect.iscoroutinefunction(weekly_digest_loop)

    def test_email_module_has_send_fn(self):
        from services.email import send_weekly_digest_email
        assert inspect.iscoroutinefunction(send_weekly_digest_email)

    def test_server_registers_digest_task(self):
        with open("/app/backend/server.py", "r") as f:
            content = f.read()
        assert "weekly_digest_loop" in content
        assert "create_task(weekly_digest_loop())" in content
        # Confirm ordering: auto_scan before weekly_digest before index ensure
        idx_auto = content.find("auto_scan_loop()")
        idx_digest = content.find("weekly_digest_loop()")
        assert idx_auto != -1 and idx_digest != -1
        assert idx_auto < idx_digest


# ─── GET /api/auth/me/weekly-digest ─────────────────────────────────────────
class TestGetPrefs:
    def test_admin_get_default(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/auth/me/weekly-digest", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        for k in ["enabled", "is_paid", "last_run_at", "last_signal_count"]:
            assert k in data, f"missing key {k} in {data}"
        assert data["is_paid"] is True, f"admin should be is_paid=True, got {data}"
        assert isinstance(data["enabled"], bool)

    def test_free_user_get(self, free_token):
        r = requests.get(f"{BASE_URL}/api/auth/me/weekly-digest", headers=_hdr(free_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["is_paid"] is False, f"free user should be is_paid=False, got {data}"
        assert "enabled" in data

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{BASE_URL}/api/auth/me/weekly-digest", timeout=30)
        assert r.status_code in (401, 403)


# ─── POST /api/auth/me/weekly-digest  (no plan gate!) ───────────────────────
class TestPostPrefs:
    def _reset_off(self, token):
        requests.post(
            f"{BASE_URL}/api/auth/me/weekly-digest",
            headers=_hdr(token),
            json={"enabled": False},
            timeout=30,
        )

    def test_admin_can_enable_and_disable(self, admin_token):
        # Enable
        r = requests.post(
            f"{BASE_URL}/api/auth/me/weekly-digest",
            headers=_hdr(admin_token),
            json={"enabled": True},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        assert r.json().get("enabled") is True

        # Verify persistence
        r2 = requests.get(f"{BASE_URL}/api/auth/me/weekly-digest", headers=_hdr(admin_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("enabled") is True

        # Disable
        r3 = requests.post(
            f"{BASE_URL}/api/auth/me/weekly-digest",
            headers=_hdr(admin_token),
            json={"enabled": False},
            timeout=30,
        )
        assert r3.status_code == 200
        assert r3.json().get("enabled") is False

        r4 = requests.get(f"{BASE_URL}/api/auth/me/weekly-digest", headers=_hdr(admin_token), timeout=30)
        assert r4.json().get("enabled") is False

    def test_free_user_can_enable_no_402(self, free_token):
        """Critical: Weekly Digest is open to Free (no 402)."""
        try:
            r = requests.post(
                f"{BASE_URL}/api/auth/me/weekly-digest",
                headers=_hdr(free_token),
                json={"enabled": True},
                timeout=30,
            )
            assert r.status_code == 200, f"Free user got {r.status_code}: {r.text}"
            assert r.json().get("enabled") is True

            # persistence
            r2 = requests.get(
                f"{BASE_URL}/api/auth/me/weekly-digest", headers=_hdr(free_token), timeout=30
            )
            assert r2.status_code == 200
            assert r2.json().get("enabled") is True
            assert r2.json().get("is_paid") is False
        finally:
            self._reset_off(free_token)

    def test_unauthenticated_post_rejected(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/me/weekly-digest",
            headers={"Content-Type": "application/json"},
            json={"enabled": True},
            timeout=30,
        )
        assert r.status_code in (401, 403)
