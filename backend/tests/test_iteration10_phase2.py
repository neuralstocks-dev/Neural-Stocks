"""Phase 2 testing — Portfolio CRUD, PDF export, Telegram status/link/unlink endpoints."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://p1-builder.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PRO_EMAIL = "tiers@demo.io"
PRO_PASS = "pass1234"
FREE_EMAIL = "demo@stockai.io"
FREE_PASS = "demo1234"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def pro_headers():
    tok = _login(PRO_EMAIL, PRO_PASS)
    if not tok:
        pytest.skip("Pro login returned no token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def free_headers():
    tok = _login(FREE_EMAIL, FREE_PASS)
    if not tok:
        pytest.skip("Free login returned no token")
    return {"Authorization": f"Bearer {tok}"}


# ---------- Portfolio ----------
class TestPortfolio:
    def test_get_empty_or_existing(self, pro_headers):
        r = requests.get(f"{API}/portfolio", headers=pro_headers, timeout=30)
        assert r.status_code == 200
        body = r.json()
        for k in ("positions", "total_cost_basis", "total_market_value",
                  "total_unrealized_pl", "total_day_change", "currency"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["positions"], list)

    def test_create_invalid_ticker_404(self, pro_headers):
        r = requests.post(f"{API}/portfolio",
                          headers=pro_headers,
                          json={"ticker": "ZZZZZZZ", "shares": 5, "avg_cost": 100},
                          timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        assert "No market data" in r.text

    def test_create_invalid_shares_422(self, pro_headers):
        r = requests.post(f"{API}/portfolio",
                          headers=pro_headers,
                          json={"ticker": "AAPL", "shares": -5, "avg_cost": 100},
                          timeout=15)
        assert r.status_code == 422

    def test_create_invalid_cost_422(self, pro_headers):
        r = requests.post(f"{API}/portfolio",
                          headers=pro_headers,
                          json={"ticker": "AAPL", "shares": 5, "avg_cost": -1},
                          timeout=15)
        assert r.status_code == 422

    def test_create_update_delete_position(self, pro_headers):
        # CREATE — use AAPL (live yfinance reliable)
        r = requests.post(f"{API}/portfolio",
                          headers=pro_headers,
                          json={"ticker": "AAPL", "shares": 1.5, "avg_cost": 150.0,
                                "notes": "TEST_iter10"},
                          timeout=30)
        assert r.status_code == 201, f"create failed: {r.status_code} {r.text[:200]}"
        created = r.json()
        assert created["ticker"] == "AAPL"
        assert created["shares"] == 1.5
        assert created["avg_cost"] == 150.0
        assert "id" in created
        pid = created["id"]

        try:
            # GET — verify enriched fields present
            r2 = requests.get(f"{API}/portfolio", headers=pro_headers, timeout=30)
            assert r2.status_code == 200
            positions = r2.json()["positions"]
            mine = [p for p in positions if p["id"] == pid]
            assert mine, "newly created position not present in GET"
            row = mine[0]
            for k in ("current_price", "market_value", "unrealized_pl",
                      "allocation_pct", "day_change", "cost_basis"):
                assert k in row, f"enriched field {k} missing"
            assert row["current_price"] is not None and row["current_price"] > 0
            assert row["cost_basis"] == round(1.5 * 150.0, 2)

            # UPDATE — partial
            r3 = requests.put(f"{API}/portfolio/{pid}",
                              headers=pro_headers,
                              json={"shares": 2.0},
                              timeout=15)
            assert r3.status_code == 200
            assert r3.json()["shares"] == 2.0
            assert r3.json()["avg_cost"] == 150.0  # untouched

        finally:
            # DELETE
            r4 = requests.delete(f"{API}/portfolio/{pid}", headers=pro_headers, timeout=15)
            assert r4.status_code == 200
            assert r4.json().get("deleted") is True

        # DELETE again -> 404
        r5 = requests.delete(f"{API}/portfolio/{pid}", headers=pro_headers, timeout=15)
        assert r5.status_code == 404


# ---------- PDF Export ----------
class TestPdfExport:
    def test_pdf_download_for_existing_analysis(self, pro_headers):
        # Find an existing analysis (TSLA hybrid expected per test_credentials)
        # Try TSLA latest first, then AAPL
        analysis_id = None
        for tk in ("TSLA", "AAPL", "MSFT"):
            r = requests.get(f"{API}/analysis/{tk}/latest", headers=pro_headers, timeout=20)
            if r.status_code == 200:
                analysis_id = r.json().get("id")
                if analysis_id:
                    break
        if not analysis_id:
            pytest.skip("No existing analysis available for pro user to test PDF export")

        r2 = requests.get(f"{API}/analysis/{analysis_id}/pdf", headers=pro_headers, timeout=30)
        assert r2.status_code == 200, f"pdf download failed: {r2.status_code} {r2.text[:200]}"
        ct = r2.headers.get("content-type", "")
        assert "application/pdf" in ct, f"wrong content-type: {ct}"
        cd = r2.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert ".pdf" in cd.lower()
        body = r2.content
        assert body[:4] == b"%PDF", "body is not a PDF"
        assert len(body) > 5000, f"PDF unexpectedly small: {len(body)} bytes"

    def test_pdf_unknown_id_404(self, pro_headers):
        r = requests.get(f"{API}/analysis/nonexistent-fake-id-xyz/pdf",
                         headers=pro_headers, timeout=15)
        assert r.status_code == 404

    def test_pdf_other_user_id_404(self, free_headers, pro_headers):
        # Get pro user's analysis id, attempt download with free creds
        analysis_id = None
        for tk in ("TSLA", "AAPL", "MSFT"):
            r = requests.get(f"{API}/analysis/{tk}/latest", headers=pro_headers, timeout=20)
            if r.status_code == 200:
                analysis_id = r.json().get("id")
                if analysis_id:
                    break
        if not analysis_id:
            pytest.skip("No pro analysis available to test cross-user owner check")
        r2 = requests.get(f"{API}/analysis/{analysis_id}/pdf",
                          headers=free_headers, timeout=15)
        assert r2.status_code == 404, "cross-user download should 404"


# ---------- Telegram ----------
class TestTelegram:
    def test_status_unconfigured(self, pro_headers):
        r = requests.get(f"{API}/telegram/status", headers=pro_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "configured" in body and "linked" in body
        # Token expected empty per problem statement
        assert body["configured"] is False
        assert body["linked"] is False

    def test_link_503_when_not_configured(self, pro_headers):
        r = requests.post(f"{API}/telegram/link", headers=pro_headers, timeout=15)
        assert r.status_code == 503, f"expected 503, got {r.status_code}: {r.text[:200]}"
        assert "not configured" in r.text.lower()

    def test_unlink_returns_unlinked_flag(self, pro_headers):
        r = requests.post(f"{API}/telegram/unlink", headers=pro_headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "unlinked" in body
        assert isinstance(body["unlinked"], bool)

    def test_status_requires_auth(self):
        r = requests.get(f"{API}/telegram/status", timeout=10)
        assert r.status_code in (401, 403)
