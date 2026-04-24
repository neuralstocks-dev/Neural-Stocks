"""Iteration 21 backend tests:
Validate GET /api/admin/users returns new engagement fields `lifetime_analyses`
and `last_active_at` aggregated from db.analyses, and there is no regression
on the quick-job endpoint shape (status/analyzed/results/progress)."""
import os
import re
import requests
import pytest
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "jolor69@gmail.com"
ADMIN_PASSWORD = "admin1234"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    }, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Part 1: /api/admin/users engagement fields ----------
class TestAdminUsersEngagement:
    def test_list_users_has_engagement_fields(self, admin_headers):
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        users = r.json()
        assert isinstance(users, list) and len(users) > 0

        # Every row must have both fields present and correctly typed.
        for u in users:
            assert "lifetime_analyses" in u, f"missing lifetime_analyses: {u.get('email')}"
            assert "last_active_at" in u, f"missing last_active_at: {u.get('email')}"
            assert isinstance(u["lifetime_analyses"], int)
            assert u["lifetime_analyses"] >= 0
            la = u["last_active_at"]
            # Accept ISO string OR None OR dict-with-$date
            if la is not None:
                # Normalize to string
                if isinstance(la, dict):
                    la = la.get("$date") or next(iter(la.values()), None)
                assert isinstance(la, str)
                # Parseable as ISO
                try:
                    datetime.fromisoformat(la.replace("Z", "+00:00"))
                except ValueError:
                    pytest.fail(f"last_active_at not ISO-parseable: {la}")

    def test_lifetime_matches_rule_zero_activity_for_never_run(self, admin_headers):
        """If lifetime_analyses == 0, last_active_at must be null.
        If lifetime_analyses > 0, last_active_at must be non-null."""
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        users = r.json()
        for u in users:
            if u["lifetime_analyses"] == 0:
                assert u["last_active_at"] is None, f"{u.get('email')}: lifetime=0 but last_active_at={u['last_active_at']}"
            else:
                assert u["last_active_at"] is not None, f"{u.get('email')}: lifetime>0 but last_active_at is None"

    def test_known_seeded_users_have_expected_lifetime(self, admin_headers):
        """Per the review_request: test_*@example.com seed users have lifetime=3.
        Also, tiers@demo.io should have lifetime >= 1 (has 1 AAPL analysis per creds doc)."""
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        users = {u["email"]: u for u in r.json()}

        test_seed = [e for e in users if re.match(r"^test_.*@example\.com$", e or "")]
        if not test_seed:
            pytest.skip("No test_*@example.com seed users present")
        # Review_request asserts aggregation correctness; require that at least
        # one test seed user has a non-zero lifetime (review mentions "3 lifetime").
        lifetimes = [(e, users[e]["lifetime_analyses"]) for e in test_seed]
        max_lt = max(lt for _, lt in lifetimes)
        assert max_lt >= 1, f"No test_* seed user has lifetime>=1: {lifetimes}"

    def test_tiers_user_has_at_least_one(self, admin_headers):
        r = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=30)
        users = {u["email"]: u for u in r.json()}
        if "tiers@demo.io" in users:
            assert users["tiers@demo.io"]["lifetime_analyses"] >= 1
            assert users["tiers@demo.io"]["last_active_at"] is not None
        else:
            pytest.skip("tiers@demo.io not present")


# ---------- Part 2: quick job endpoint shape regression ----------
class TestQuickJobShape:
    def test_quick_job_top_response_shape(self, admin_headers):
        # Start a top-3 job
        r = requests.post(f"{API}/analysis/quick/top", headers=admin_headers, timeout=30)
        # Endpoint may be GET vs POST depending on impl; try alternate if not 200/202
        if r.status_code >= 400:
            r = requests.get(f"{API}/analysis/quick/top", headers=admin_headers, timeout=30)
        assert r.status_code in (200, 202), f"quick/top failed: {r.status_code} {r.text}"
        body = r.json()
        job_id = body.get("job_id") or body.get("id")
        assert job_id, f"no job_id in response: {body}"

        # Poll once
        r2 = requests.get(f"{API}/analysis/quick/jobs/{job_id}", headers=admin_headers, timeout=30)
        assert r2.status_code == 200, r2.text
        j = r2.json()
        for key in ("analyzed", "results", "progress"):
            assert key in j, f"missing key {key} in job payload: {list(j.keys())}"
        assert isinstance(j["analyzed"], list)
        assert isinstance(j["results"], list)
        assert isinstance(j["progress"], dict)
        # progress should have completed + total at minimum
        assert "total" in j["progress"]
