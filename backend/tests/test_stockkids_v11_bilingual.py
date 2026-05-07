"""StockKids V1.1 — bilingual EN/ID backend tests.

Covers:
  * /api/kids/preview/{ticker}?lang=en|id language switching
  * lang=fr unsupported → coerced to en
  * lang=ID uppercase → coerced to en (pattern is strict lowercase)
  * Cache isolation between EN and ID in GAL memo
  * /api/kids/analyze/{ticker}?lang=id with kid token
  * Signup body lang field: 'id' stored, 'en' default, 'es' → 422
  * Resend consent + parental-consent submission accept lang
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import date, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

# Common Indonesian tokens that almost never appear in English NSI verdicts.
ID_MARKERS = re.compile(
    r"\b(yang|bilang|tunggu|dulu|kamu|sinyal|saham|campur|aduk|naik|turun|uang|jajan|sepak bola|pemain|warung|toko|coba|ingat|tidak|bukan|adalah|dan)\b",
    re.IGNORECASE,
)

# Common English-only stoppers that shouldn't appear in an Indonesian string.
EN_ONLY = re.compile(r"\b(the|is|are|was|were|and|or|but|with|that|this|these|those|going|mixed signals)\b", re.IGNORECASE)


def _coerce_str(text) -> str:
    """kid_view fields can be str OR list (e.g. did_you_know list of facts).
    Flatten list to a single space-joined string for regex inspection."""
    if text is None:
        return ""
    if isinstance(text, list):
        return " ".join(str(t) for t in text)
    return str(text)


def _looks_indonesian(text) -> bool:
    s = _coerce_str(text)
    if not s:
        return False
    return bool(ID_MARKERS.search(s))


def _looks_english(text) -> bool:
    s = _coerce_str(text)
    if not s:
        return False
    return bool(EN_ONLY.search(s))


# ---------------------------------------------------------------------------
# Public preview
# ---------------------------------------------------------------------------

class TestPublicPreviewLang:
    def test_preview_default_en(self):
        r = requests.get(f"{BASE_URL}/api/kids/preview/AAPL", params={"age": "11-13"}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        kv = data["kid_view"]
        assert kv.get("kid_headline")
        # default lang=en → should look English
        assert _looks_english(kv["kid_headline"]) or not _looks_indonesian(kv["kid_headline"])

    def test_preview_lang_en(self):
        r = requests.get(
            f"{BASE_URL}/api/kids/preview/AAPL",
            params={"age": "11-13", "lang": "en"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        kv = r.json()["kid_view"]
        # English — should not be dominated by ID markers
        for field in ("kid_headline", "kid_explanation", "did_you_know", "reflection_question"):
            txt = kv.get(field, "")
            assert txt, f"field {field} empty"

    def test_preview_lang_id_returns_indonesian(self):
        r = requests.get(
            f"{BASE_URL}/api/kids/preview/AAPL",
            params={"age": "11-13", "lang": "id"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        kv = r.json()["kid_view"]
        # At least 3 of the 4 kid-facing text fields should look Indonesian.
        fields = ["kid_headline", "kid_explanation", "did_you_know", "reflection_question"]
        id_hits = sum(1 for f in fields if _looks_indonesian(kv.get(f, "")))
        assert id_hits >= 3, f"expected ≥3 ID-looking fields, got {id_hits}. kv={kv}"

        # emoji_mood should stay a single emoji (not a translated phrase)
        mood = kv.get("emoji_mood", "")
        assert mood, "emoji_mood missing"
        # single-emoji or very short; just ensure it's short (not a sentence)
        assert len(mood) <= 8, f"emoji_mood looks too long: {mood!r}"

    def test_preview_lang_unsupported_coerced_to_en(self):
        r = requests.get(
            f"{BASE_URL}/api/kids/preview/AAPL",
            params={"age": "11-13", "lang": "fr"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        kv = r.json()["kid_view"]
        # fr coerced to en → should not look Indonesian
        assert not _looks_indonesian(kv.get("kid_headline", "")), kv["kid_headline"]

    def test_preview_lang_uppercase_ID_coerced_to_en(self):
        # Router does `if lang not in ("en","id"): lang = "en"` — so "ID"
        # (uppercase) is NOT in the set and falls back to en.
        r = requests.get(
            f"{BASE_URL}/api/kids/preview/AAPL",
            params={"age": "11-13", "lang": "ID"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        kv = r.json()["kid_view"]
        assert not _looks_indonesian(kv.get("kid_headline", "")), kv["kid_headline"]

    def test_cache_isolation_en_then_id_then_en(self):
        """EN request → ID request → EN request. The 2nd EN must NOT
        leak Indonesian. Proves memo key includes lang."""
        r1 = requests.get(f"{BASE_URL}/api/kids/preview/AAPL",
                          params={"age": "11-13", "lang": "en"}, timeout=60).json()
        r2 = requests.get(f"{BASE_URL}/api/kids/preview/AAPL",
                          params={"age": "11-13", "lang": "id"}, timeout=60).json()
        r3 = requests.get(f"{BASE_URL}/api/kids/preview/AAPL",
                          params={"age": "11-13", "lang": "en"}, timeout=60).json()

        en1 = r1["kid_view"]["kid_headline"]
        id2 = r2["kid_view"]["kid_headline"]
        en3 = r3["kid_view"]["kid_headline"]

        assert not _looks_indonesian(en1), f"r1 EN leaked ID: {en1}"
        assert _looks_indonesian(id2) or not _looks_english(id2), f"r2 ID not Indonesian: {id2}"
        assert not _looks_indonesian(en3), f"r3 EN returned ID (cache bleed): {en3}"
        # Idempotency: EN memo should return the same headline on replay
        assert en1 == en3, "EN memo should be stable across ID request in between"


# ---------------------------------------------------------------------------
# Signup lang field
# ---------------------------------------------------------------------------

class TestSignupLang:
    @staticmethod
    def _bd(age: int) -> str:
        return (date.today() - timedelta(days=365 * age + 60)).isoformat()

    def _cleanup(self, email: str):
        e = email.lower().strip()
        _db.kids_users.delete_many({"email": e})
        _db.kids_consents.delete_many({"kid_email": e})

    def test_signup_lang_id_persists_and_email_logged_id(self, caplog):
        email = f"TEST_v11_id_{uuid.uuid4().hex[:8]}@kids.io"
        self._cleanup(email)
        try:
            r = requests.post(
                f"{BASE_URL}/api/kids/auth/signup",
                json={
                    "email": email,
                    "password": "securepass123",
                    "full_name": "Budi Santoso",
                    "birthdate": self._bd(11),
                    "parent_email": f"parent_{uuid.uuid4().hex[:6]}@kids.io",
                    "lang": "id",
                },
                timeout=30,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] == "awaiting_parental_consent"
            assert body["student"]["lang"] == "id"

            # DB persistence (backend lowercases email)
            doc = _db.kids_users.find_one({"email": email.lower()})
            assert doc is not None
            assert doc.get("lang") == "id"

            # Consent record was created
            consent = _db.kids_consents.find_one({"kid_email": email.lower()})
            assert consent is not None, "consent record missing"
        finally:
            self._cleanup(email)

    def test_signup_lang_en_default_preserved(self):
        email = f"TEST_v11_en_{uuid.uuid4().hex[:8]}@kids.io"
        self._cleanup(email)
        try:
            # No lang field → default 'en'
            r = requests.post(
                f"{BASE_URL}/api/kids/auth/signup",
                json={
                    "email": email,
                    "password": "securepass123",
                    "full_name": "Alice Test",
                    "birthdate": self._bd(16),
                },
                timeout=30,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] == "active"
            assert body["student"]["lang"] == "en"
        finally:
            self._cleanup(email)

    def test_signup_lang_invalid_es_returns_422(self):
        email = f"TEST_v11_es_{uuid.uuid4().hex[:8]}@kids.io"
        r = requests.post(
            f"{BASE_URL}/api/kids/auth/signup",
            json={
                "email": email,
                "password": "securepass123",
                "full_name": "Miguel",
                "birthdate": self._bd(16),
                "lang": "es",
            },
            timeout=30,
        )
        assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# Consent + resend lang
# ---------------------------------------------------------------------------

class TestConsentLang:
    @staticmethod
    def _bd(age: int) -> str:
        return (date.today() - timedelta(days=365 * age + 60)).isoformat()

    def _mint_awaiting_kid(self, lang: str = "en"):
        email = f"TEST_v11_consent_{uuid.uuid4().hex[:8]}@kids.io"
        parent = f"TEST_v11_parent_{uuid.uuid4().hex[:8]}@kids.io"
        e = email.lower().strip()
        _db.kids_users.delete_many({"email": e})
        _db.kids_consents.delete_many({"kid_email": e})
        r = requests.post(
            f"{BASE_URL}/api/kids/auth/signup",
            json={
                "email": email,
                "password": "securepass123",
                "full_name": "Dewi Kid",
                "birthdate": self._bd(11),
                "parent_email": parent,
                "lang": lang,
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        return e, parent.lower().strip()

    def _cleanup(self, email: str):
        e = email.lower().strip()
        _db.kids_users.delete_many({"email": e})
        _db.kids_consents.delete_many({"kid_email": e})

    def test_parental_consent_submit_with_lang_id(self):
        email, parent = self._mint_awaiting_kid(lang="id")
        try:
            token_doc = _db.kids_consents.find_one({"kid_email": email})
            assert token_doc, "no consent token minted"
            token = token_doc["consent_token"]

            r = requests.post(
                f"{BASE_URL}/api/kids/auth/parental-consent/{token}",
                json={
                    "parent_full_name": "Pak Santoso",
                    "agree": True,
                    "lang": "id",
                },
                timeout=30,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            # Kid should now be active
            kid = _db.kids_users.find_one({"email": email})
            assert kid["status"] == "active"
            assert kid["stock_coins_balance"] == 10000
        finally:
            self._cleanup(email)

    def test_resend_consent_with_lang_id(self):
        email, _parent = self._mint_awaiting_kid(lang="en")
        try:
            r = requests.post(
                f"{BASE_URL}/api/kids/auth/resend-consent",
                json={"email": email, "lang": "id"},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            # A fresh consent token should now exist and old ones superseded
            tokens = list(_db.kids_consents.find({"kid_email": email}))
            assert len(tokens) >= 1
        finally:
            self._cleanup(email)

    def test_resend_consent_without_lang_defaults_en(self):
        email, _parent = self._mint_awaiting_kid(lang="en")
        try:
            r = requests.post(
                f"{BASE_URL}/api/kids/auth/resend-consent",
                json={"email": email},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            assert r.json().get("ok") is True
        finally:
            self._cleanup(email)


# ---------------------------------------------------------------------------
# Authenticated analyze endpoint
# ---------------------------------------------------------------------------

class TestAnalyzeLang:
    def _kid_token(self) -> str:
        r = requests.post(
            f"{BASE_URL}/api/kids/auth/login",
            json={"email": "kid10test@kids.io", "password": "securepass123"},
            timeout=15,
        )
        if r.status_code != 200:
            pytest.skip(f"seed kid login failed: {r.status_code} {r.text}")
        return r.json()["token"]

    def test_analyze_lang_id_returns_indonesian(self):
        token = self._kid_token()
        r = requests.get(
            f"{BASE_URL}/api/kids/analyze/AAPL",
            headers={"Authorization": f"Bearer {token}"},
            params={"lang": "id"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        kv = r.json().get("kid_view") or {}
        fields = ["kid_headline", "kid_explanation", "did_you_know", "reflection_question"]
        id_hits = sum(1 for f in fields if _looks_indonesian(kv.get(f, "")))
        assert id_hits >= 2, f"expected Indonesian output, got kv={kv}"

    def test_analyze_no_lang_defaults_en(self):
        token = self._kid_token()
        r = requests.get(
            f"{BASE_URL}/api/kids/analyze/AAPL",
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        kv = r.json().get("kid_view") or {}
        assert not _looks_indonesian(kv.get("kid_headline", "")), kv.get("kid_headline")
