"""AI Stock Analysis Platform - Phase 1 MVP backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import json
import re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt as pyjwt
import yfinance as yf

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 24 * 7  # 7 days
MAX_WATCHLIST = 5

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="AI Stock Analysis Platform")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---------- Helpers ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_jwt(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------- Models ----------
class SignupReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=1, max_length=80)


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class AuthResp(BaseModel):
    token: str
    user: dict


class AddStockReq(BaseModel):
    ticker: str = Field(min_length=1, max_length=15)
    category: Optional[str] = "other"  # tech/finance/commodities/healthcare/etc


class Quote(BaseModel):
    ticker: str
    name: Optional[str] = None
    price: Optional[float] = None
    previous_close: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    currency: Optional[str] = None
    market_state: Optional[str] = None
    volume: Optional[int] = None
    day_high: Optional[float] = None
    day_low: Optional[float] = None
    exchange: Optional[str] = None


class WatchlistItem(BaseModel):
    ticker: str
    category: str
    added_at: str


class StockSearchResult(BaseModel):
    ticker: str
    name: str
    exchange: Optional[str] = None


class AnalysisReq(BaseModel):
    ticker: Optional[str] = None  # optional override, else from path


# ---------- yfinance helpers ----------
def _yf_quote_sync(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    info = {}
    try:
        info = t.fast_info or {}
        info = dict(info) if info else {}
    except Exception:
        info = {}
    # fallback to .info when fast_info misses things
    name = None
    exchange = None
    currency = info.get("currency")
    try:
        meta = t.info or {}
        name = meta.get("shortName") or meta.get("longName")
        exchange = meta.get("exchange") or meta.get("fullExchangeName")
        currency = currency or meta.get("currency")
    except Exception:
        meta = {}

    price = info.get("last_price") or info.get("lastPrice")
    prev_close = info.get("previous_close") or info.get("previousClose")
    day_high = info.get("day_high") or info.get("dayHigh")
    day_low = info.get("day_low") or info.get("dayLow")
    volume = info.get("last_volume") or info.get("lastVolume")
    market_state = info.get("market_state") or info.get("marketState")

    # If still missing, fallback to recent history
    if price is None or prev_close is None:
        try:
            hist = t.history(period="5d", interval="1d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1]) if price is None else price
                if prev_close is None and len(hist) >= 2:
                    prev_close = float(hist["Close"].iloc[-2])
                if day_high is None:
                    day_high = float(hist["High"].iloc[-1])
                if day_low is None:
                    day_low = float(hist["Low"].iloc[-1])
                if volume is None:
                    volume = int(hist["Volume"].iloc[-1])
        except Exception:
            pass

    change = None
    change_pct = None
    if price is not None and prev_close:
        change = price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else None

    return {
        "ticker": ticker.upper(),
        "name": name or ticker.upper(),
        "price": float(price) if price is not None else None,
        "previous_close": float(prev_close) if prev_close is not None else None,
        "change": round(float(change), 4) if change is not None else None,
        "change_pct": round(float(change_pct), 4) if change_pct is not None else None,
        "currency": currency,
        "market_state": market_state,
        "volume": int(volume) if volume is not None else None,
        "day_high": float(day_high) if day_high is not None else None,
        "day_low": float(day_low) if day_low is not None else None,
        "exchange": exchange,
    }


async def get_quote(ticker: str) -> dict:
    return await asyncio.to_thread(_yf_quote_sync, ticker)


def _yf_history_sync(ticker: str, period: str = "3mo", interval: str = "1d") -> list:
    t = yf.Ticker(ticker)
    try:
        hist = t.history(period=period, interval=interval)
    except Exception:
        return []
    if hist is None or hist.empty:
        return []
    out = []
    for idx, row in hist.iterrows():
        out.append(
            {
                "date": idx.isoformat(),
                "open": float(row["Open"]) if not _isnan(row["Open"]) else None,
                "high": float(row["High"]) if not _isnan(row["High"]) else None,
                "low": float(row["Low"]) if not _isnan(row["Low"]) else None,
                "close": float(row["Close"]) if not _isnan(row["Close"]) else None,
                "volume": int(row["Volume"]) if not _isnan(row["Volume"]) else 0,
            }
        )
    return out


def _isnan(x) -> bool:
    try:
        import math
        return math.isnan(float(x))
    except Exception:
        return False


def _yf_fundamentals_sync(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    try:
        info = t.info or {}
    except Exception:
        info = {}
    keys = [
        "shortName",
        "longName",
        "sector",
        "industry",
        "marketCap",
        "trailingPE",
        "forwardPE",
        "priceToBook",
        "dividendYield",
        "beta",
        "fiftyTwoWeekHigh",
        "fiftyTwoWeekLow",
        "averageVolume",
        "profitMargins",
        "returnOnEquity",
        "trailingEps",
        "revenueGrowth",
        "earningsGrowth",
        "debtToEquity",
        "recommendationKey",
        "targetMeanPrice",
        "longBusinessSummary",
    ]
    return {k: info.get(k) for k in keys}


def _compute_technicals(history: list) -> dict:
    """Compute basic technical indicators from close-price series."""
    closes = [h["close"] for h in history if h.get("close") is not None]
    if len(closes) < 15:
        return {"rsi_14": None, "sma_20": None, "sma_50": None, "ema_12": None, "ema_26": None, "macd": None, "macd_signal": None}

    def sma(values, n):
        if len(values) < n:
            return None
        return sum(values[-n:]) / n

    def ema(values, n):
        if len(values) < n:
            return None
        k = 2 / (n + 1)
        e = sum(values[:n]) / n
        for v in values[n:]:
            e = v * k + e * (1 - k)
        return e

    def rsi(values, n=14):
        if len(values) < n + 1:
            return None
        gains = []
        losses = []
        for i in range(1, len(values)):
            d = values[i] - values[i - 1]
            gains.append(max(d, 0))
            losses.append(abs(min(d, 0)))
        avg_gain = sum(gains[-n:]) / n
        avg_loss = sum(losses[-n:]) / n
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd = (ema12 - ema26) if (ema12 is not None and ema26 is not None) else None
    # signal ema 9 of macd series - approximate using last macd
    return {
        "rsi_14": round(rsi(closes, 14), 2) if rsi(closes, 14) is not None else None,
        "sma_20": round(sma(closes, 20), 4) if sma(closes, 20) is not None else None,
        "sma_50": round(sma(closes, 50), 4) if sma(closes, 50) is not None else None,
        "ema_12": round(ema12, 4) if ema12 is not None else None,
        "ema_26": round(ema26, 4) if ema26 is not None else None,
        "macd": round(macd, 4) if macd is not None else None,
    }


# ---------- Routes: Health ----------
@api_router.get("/")
async def root():
    return {"service": "ai-stock-analysis", "status": "ok"}


# ---------- Routes: Auth ----------
@api_router.post("/auth/register", response_model=AuthResp)
async def register(req: SignupReq):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": req.email.lower(),
        "full_name": req.full_name,
        "password_hash": hash_password(req.password),
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(doc)
    token = create_jwt(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": doc["email"],
            "full_name": doc["full_name"],
        },
    }


@api_router.post("/auth/login", response_model=AuthResp)
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_jwt(user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
        },
    }


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


# ---------- Routes: Stocks ----------
# A curated popular-tickers list for search (simple prefix filter)
POPULAR = [
    {"ticker": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ"},
    {"ticker": "MSFT", "name": "Microsoft Corp.", "exchange": "NASDAQ"},
    {"ticker": "GOOGL", "name": "Alphabet Inc. Class A", "exchange": "NASDAQ"},
    {"ticker": "AMZN", "name": "Amazon.com Inc.", "exchange": "NASDAQ"},
    {"ticker": "META", "name": "Meta Platforms Inc.", "exchange": "NASDAQ"},
    {"ticker": "NVDA", "name": "NVIDIA Corp.", "exchange": "NASDAQ"},
    {"ticker": "TSLA", "name": "Tesla Inc.", "exchange": "NASDAQ"},
    {"ticker": "NFLX", "name": "Netflix Inc.", "exchange": "NASDAQ"},
    {"ticker": "AMD", "name": "Advanced Micro Devices", "exchange": "NASDAQ"},
    {"ticker": "INTC", "name": "Intel Corp.", "exchange": "NASDAQ"},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "exchange": "NYSE"},
    {"ticker": "BAC", "name": "Bank of America", "exchange": "NYSE"},
    {"ticker": "V", "name": "Visa Inc.", "exchange": "NYSE"},
    {"ticker": "MA", "name": "Mastercard Inc.", "exchange": "NYSE"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE"},
    {"ticker": "PG", "name": "Procter & Gamble", "exchange": "NYSE"},
    {"ticker": "XOM", "name": "Exxon Mobil", "exchange": "NYSE"},
    {"ticker": "KO", "name": "Coca-Cola", "exchange": "NYSE"},
    {"ticker": "DIS", "name": "The Walt Disney Company", "exchange": "NYSE"},
    {"ticker": "BA", "name": "The Boeing Company", "exchange": "NYSE"},
    {"ticker": "D05.SI", "name": "DBS Group (SGX)", "exchange": "SGX"},
    {"ticker": "U11.SI", "name": "United Overseas Bank (SGX)", "exchange": "SGX"},
    {"ticker": "O39.SI", "name": "OCBC Bank (SGX)", "exchange": "SGX"},
    {"ticker": "Z74.SI", "name": "Singtel (SGX)", "exchange": "SGX"},
    {"ticker": "C6L.SI", "name": "Singapore Airlines (SGX)", "exchange": "SGX"},
]


@api_router.get("/stocks/search")
async def search_stocks(q: str = ""):
    q = q.strip().upper()
    if not q:
        return POPULAR[:15]
    results = [s for s in POPULAR if q in s["ticker"] or q.lower() in s["name"].lower()]
    # Always include direct ticker option even if not in curated list
    if q not in [s["ticker"] for s in results]:
        results.insert(0, {"ticker": q, "name": q, "exchange": "?"})
    return results[:15]


@api_router.get("/stocks/{ticker}/quote", response_model=Quote)
async def stock_quote(ticker: str, user=Depends(get_current_user)):
    q = await get_quote(ticker)
    if q.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No data for ticker {ticker}")
    return q


@api_router.get("/stocks/{ticker}/history")
async def stock_history(
    ticker: str,
    period: str = "3mo",
    interval: str = "1d",
    user=Depends(get_current_user),
):
    hist = await asyncio.to_thread(_yf_history_sync, ticker, period, interval)
    return {"ticker": ticker.upper(), "period": period, "interval": interval, "points": hist}


# ---------- Routes: Watchlist ----------
@api_router.get("/watchlist")
async def get_watchlist(user=Depends(get_current_user)):
    items = (
        await db.watchlist.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0})
        .sort("added_at", 1)
        .to_list(20)
    )
    return items


@api_router.post("/watchlist")
async def add_to_watchlist(req: AddStockReq, user=Depends(get_current_user)):
    ticker = req.ticker.upper().strip()
    count = await db.watchlist.count_documents({"user_id": user["id"]})
    if count >= MAX_WATCHLIST:
        raise HTTPException(status_code=400, detail=f"Watchlist limit of {MAX_WATCHLIST} reached")
    existing = await db.watchlist.find_one({"user_id": user["id"], "ticker": ticker})
    if existing:
        raise HTTPException(status_code=400, detail="Ticker already in watchlist")
    # Validate ticker by fetching quote
    q = await get_quote(ticker)
    if q.get("price") is None:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker} not found or no data")
    item = {
        "user_id": user["id"],
        "ticker": ticker,
        "name": q.get("name"),
        "category": (req.category or "other").lower(),
        "added_at": iso(now_utc()),
    }
    await db.watchlist.insert_one(item)
    return {"ok": True, "ticker": ticker, "name": q.get("name")}


@api_router.delete("/watchlist/{ticker}")
async def remove_from_watchlist(ticker: str, user=Depends(get_current_user)):
    res = await db.watchlist.delete_one({"user_id": user["id"], "ticker": ticker.upper()})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ticker not in watchlist")
    return {"ok": True}


@api_router.get("/watchlist/live")
async def watchlist_live(user=Depends(get_current_user)):
    items = await db.watchlist.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).to_list(20)
    tickers = [i["ticker"] for i in items]
    quotes = await asyncio.gather(*[get_quote(t) for t in tickers]) if tickers else []
    # Fetch latest analyses
    merged = []
    for item, q in zip(items, quotes):
        latest = await db.analyses.find_one(
            {"user_id": user["id"], "ticker": item["ticker"]},
            sort=[("created_at", -1)],
            projection={"_id": 0},
        )
        merged.append(
            {
                **item,
                "quote": q,
                "latest_analysis": {
                    "recommendation": latest["recommendation"] if latest else None,
                    "confidence_score": latest["confidence_score"] if latest else None,
                    "created_at": latest["created_at"] if latest else None,
                }
                if latest
                else None,
            }
        )
    return merged


# ---------- AI Analysis ----------
SYSTEM_PROMPT = """You are an institutional-grade equity analyst AI. Given quantitative data for a single stock (price action, technical indicators, fundamental ratios), produce a disciplined, evidence-backed analysis.

Return ONLY a valid JSON object with this exact schema — no markdown, no prose outside JSON:
{
  "recommendation": "BUY" | "SELL" | "HOLD",
  "confidence_score": integer 0-100,
  "price_target": number (12-week target in same currency as price),
  "stop_loss": number (suggested stop loss price),
  "executive_summary": string (2-3 sentence crisp thesis),
  "reasoning": string (200-500 words, cite specific numbers from the data),
  "technical_analysis": string (80-150 words on RSI, MA crossovers, momentum),
  "fundamental_analysis": string (80-150 words on valuation, growth, margins),
  "risk_factors": [3 to 5 short strings, each 1 sentence],
  "peer_comparison": string (1-2 sentences comparing to sector peers),
  "time_horizon_weeks": integer 4-12
}

Rules:
- Be decisive. Avoid "it depends" hedging. Pick BUY/SELL/HOLD based on weight of evidence.
- Confidence >= 75 only when technicals AND fundamentals align.
- Use the *actual* current price to place price_target and stop_loss realistically (typically ±5-25% range).
- Never recommend penny-stock speculation without warning in risk_factors.
- This is educational analysis, not a financial advice license.
"""


async def run_ai_analysis(ticker: str, quote: dict, history: list, fundamentals: dict, technicals: dict) -> dict:
    payload = {
        "ticker": ticker,
        "quote": quote,
        "technical_indicators": technicals,
        "fundamentals": fundamentals,
        "recent_price_series_last_20": [
            {"date": h["date"], "close": h["close"]} for h in history[-20:]
        ],
    }
    session_id = f"analysis-{ticker}-{uuid.uuid4().hex[:8]}"
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=SYSTEM_PROMPT,
        )
        .with_model("anthropic", "claude-sonnet-4-5-20250929")
    )
    msg = UserMessage(
        text=(
            "Analyze this stock using the data below. Return ONLY valid JSON.\n\n"
            + json.dumps(payload, default=str)
        )
    )
    raw = await chat.send_message(msg)
    text = raw if isinstance(raw, str) else str(raw)
    # Extract JSON
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise HTTPException(status_code=502, detail="AI did not return valid JSON")
    try:
        parsed = json.loads(m.group(0))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI JSON parse error: {e}")
    # Basic shape validation
    if parsed.get("recommendation") not in ("BUY", "SELL", "HOLD"):
        raise HTTPException(status_code=502, detail="AI returned invalid recommendation")
    return parsed


async def _maybe_create_alert(user_id: str, ticker: str, analysis: dict):
    """Create alert if high confidence BUY/SELL."""
    rec = analysis.get("recommendation")
    conf = int(analysis.get("confidence_score", 0))
    if rec in ("BUY", "SELL") and conf >= 75:
        await db.alerts.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "ticker": ticker,
                "type": "signal",
                "signal": rec,
                "confidence_score": conf,
                "title": f"{rec} signal · {ticker}",
                "message": analysis.get("executive_summary", ""),
                "read": False,
                "created_at": iso(now_utc()),
            }
        )


@api_router.post("/analysis/{ticker}")
async def create_analysis(ticker: str, user=Depends(get_current_user)):
    ticker = ticker.upper().strip()
    # Gather data in parallel
    quote_task = get_quote(ticker)
    hist_task = asyncio.to_thread(_yf_history_sync, ticker, "6mo", "1d")
    fund_task = asyncio.to_thread(_yf_fundamentals_sync, ticker)
    quote, history, fundamentals = await asyncio.gather(quote_task, hist_task, fund_task)
    if quote.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No data for ticker {ticker}")
    technicals = _compute_technicals(history)

    analysis = await run_ai_analysis(ticker, quote, history, fundamentals, technicals)

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "ticker": ticker,
        "created_at": iso(now_utc()),
        "price_at_analysis": quote.get("price"),
        "quote_snapshot": quote,
        "technicals": technicals,
        "fundamentals": fundamentals,
        **analysis,
    }
    await db.analyses.insert_one(doc)
    doc.pop("_id", None)
    await _maybe_create_alert(user["id"], ticker, analysis)
    return doc


@api_router.get("/analysis/{ticker}/latest")
async def latest_analysis(ticker: str, user=Depends(get_current_user)):
    doc = await db.analyses.find_one(
        {"user_id": user["id"], "ticker": ticker.upper()},
        sort=[("created_at", -1)],
        projection={"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No analysis yet")
    return doc


@api_router.get("/analysis/{ticker}/history")
async def analysis_history(ticker: str, user=Depends(get_current_user)):
    docs = (
        await db.analyses.find(
            {"user_id": user["id"], "ticker": ticker.upper()}, {"_id": 0}
        )
        .sort("created_at", -1)
        .to_list(20)
    )
    return docs


# ---------- Quick Analyze (Top / Bottom) ----------
@api_router.post("/analysis/quick/{kind}")
async def quick_analyze(kind: str, user=Depends(get_current_user)):
    if kind not in ("top", "bottom"):
        raise HTTPException(status_code=400, detail="kind must be 'top' or 'bottom'")
    items = await db.watchlist.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).to_list(20)
    if not items:
        raise HTTPException(status_code=400, detail="Watchlist is empty")
    tickers = [i["ticker"] for i in items]
    quotes = await asyncio.gather(*[get_quote(t) for t in tickers])
    ranked = sorted(
        zip(items, quotes),
        key=lambda iq: (iq[1].get("change_pct") or 0),
        reverse=(kind == "top"),
    )
    selected = [iq[0]["ticker"] for iq in ranked[:5]]
    # Run analyses sequentially to avoid LLM rate-limit spikes
    results = []
    for tk in selected:
        try:
            res = await create_analysis(tk, user=user)
            results.append(res)
        except HTTPException as e:
            results.append({"ticker": tk, "error": e.detail})
    return {"kind": kind, "analyzed": selected, "results": results}


# ---------- Alerts ----------
@api_router.get("/alerts")
async def list_alerts(user=Depends(get_current_user)):
    docs = (
        await db.alerts.find({"user_id": user["id"]}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    return docs


@api_router.post("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: str, user=Depends(get_current_user)):
    res = await db.alerts.update_one(
        {"id": alert_id, "user_id": user["id"]}, {"$set": {"read": True}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@api_router.post("/alerts/read_all")
async def mark_all_alerts_read(user=Depends(get_current_user)):
    await db.alerts.update_many({"user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- Mount router ----------
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
