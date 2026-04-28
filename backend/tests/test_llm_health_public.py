"""Regression tests for the public LLM health endpoint.

Scope: `GET /api/llm-health/public` must
  - require NO authentication (badge runs everywhere, incl. anonymous pages)
  - leak NO ops detail (no recent failure list, ticker names, surface counts)
  - report `operational` / `degraded` / `down` based on the breaker state
  - cap `consec_fail` at the int we expect (no float / None leakage)
"""
from unittest.mock import patch

from fastapi.testclient import TestClient

from server import app

client = TestClient(app)


def _patched_status(consec_fail=0, tripped=False):
    """Build a fake `llm_circuit_breaker.status()` snapshot with controlled
    breaker state. We patch the `status` function in the analysis router's
    namespace so the endpoint sees our values."""
    return {
        "tripped": tripped,
        "tripped_at": 1000.0 if tripped else None,
        "seconds_tripped": 30 if tripped else 0,
        "consec_fail": consec_fail,
        "consec_ok": 0 if tripped else 5,
        "recent": [{"outcome": "timeout", "ts": 999.0}],   # internal-only, must NOT leak
        "config": {"trip_after": 3, "reset_after": 2, "max_trip_seconds": 600},
    }


def test_public_health_no_auth_required():
    """Endpoint must answer with NO Authorization header. Used by the
    anonymous public-verdict pages and login screen."""
    r = client.get("/api/llm-health/public")
    assert r.status_code == 200


def test_public_health_operational_when_clean():
    with patch("routers.analysis.llm_circuit_breaker.status", return_value=_patched_status(0, False)):
        r = client.get("/api/llm-health/public")
    body = r.json()
    assert body["status"] == "operational"
    assert body["healthy"] is True
    assert body["consec_fail"] == 0


def test_public_health_degraded_on_recent_failures():
    """Any consec_fail > 0 → degraded (badge surfaces amber dot)."""
    with patch("routers.analysis.llm_circuit_breaker.status", return_value=_patched_status(2, False)):
        r = client.get("/api/llm-health/public")
    body = r.json()
    assert body["status"] == "degraded"
    assert body["healthy"] is False
    assert body["consec_fail"] == 2


def test_public_health_down_when_tripped():
    """Tripped breaker → down regardless of consec_fail value."""
    with patch("routers.analysis.llm_circuit_breaker.status", return_value=_patched_status(5, True)):
        r = client.get("/api/llm-health/public")
    body = r.json()
    assert body["status"] == "down"
    assert body["healthy"] is False


def test_public_health_does_not_leak_internal_fields():
    """Endpoint must NOT expose `recent`, `tripped_at`, `seconds_tripped`,
    `config` — those are admin-only. Frontend badge needs only
    {status, healthy, consec_fail}."""
    with patch("routers.analysis.llm_circuit_breaker.status", return_value=_patched_status(2, False)):
        r = client.get("/api/llm-health/public")
    body = r.json()
    # Whitelist — only these 3 keys allowed
    assert set(body.keys()) == {"status", "healthy", "consec_fail"}
    # Defensive — none of the leaky internals
    assert "recent" not in body
    assert "tripped_at" not in body
    assert "config" not in body
    assert "consec_ok" not in body
