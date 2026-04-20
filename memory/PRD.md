# Neural — AI Stock Analysis Platform

## Original Problem Statement
Phase 1 MVP per uploaded PRD: AI Stock Analysis Agent with Claude-powered verdicts + explainable reasoning. Later extended with admin console, subscription tiers, share verdicts, Google OAuth, accuracy scorecard, mandatory disclaimer gate, and background-job quick-analyze.

## Tech
- Backend: FastAPI (split into `core/` `services/` `routers/`) + MongoDB (Motor) + yfinance + emergentintegrations (Claude Sonnet 4.5) + httpx + bcrypt + PyJWT
- Frontend: React 19 + Tailwind + shadcn/ui + recharts + lucide-react + react-router-dom
- Design: "Old Money Tech" — dark-first, Cormorant Garamond + Outfit + IBM Plex Mono

## Feature Log

### Iteration 1
Watchlist, Claude verdict engine, in-app alerts, dashboard, detailed report, JWT auth

### Iteration 2
Lucid → **Neural** rebrand · Emergent Google OAuth · Free/Pro/Elite tiers · Share Verdict

### Iteration 3
Backend refactor (core/services/routers) · Admin auto-elevation (ADMIN_EMAILS) · Admin console (users, logins, unlock/reset) · AI Accuracy Scorecard

### Iteration 4 (current — two items)
- **Background-job quick-analyze**: `POST /api/analysis/quick/{kind}` returns `{job_id, status:'running'}` instantly (~150ms through live ingress). Background worker processes tickers **sequentially** with `asyncio.wait_for(..., timeout=90s)`, writes progress to `db.quick_jobs` after each ticker, and yields with `asyncio.sleep(0)` between LLM calls so other endpoints stay responsive. Client polls `GET /api/analysis/quick/jobs/{job_id}` every 2.5s. Concurrent logins during bg work confirmed at ~400ms.
- **Mandatory disclaimer gate**: `GET/POST /api/disclaimer` with versioned acceptance (`v1-2026-04`). `require_accepted()` guard on `/analysis/{ticker}` + `/analysis/quick/{kind}` returns HTTP 428 with structured detail `{code:'disclaimer_required', version, message}` before running any AI. Frontend auto-opens a modal with 7-clause legal text, two required checkboxes, and "I understand & accept" CTA. Global axios interceptor normalizes 428 dict-details to strings so no page can crash on render.

## Testing Status
| Iter | Score | Notes |
|------|-------|-------|
| 1 | 35/39 (100% non-AI) | LLM budget blocked |
| 2 | 59/60 (98.3%) | quick/top ingress timeout → since fixed |
| 3 | 82/84 (97.6%) | scorecard/global auth → fixed |
| 4 (sync quick) | 95/99 | quick/top ingress ~60s — FIXED by bg-job |
| 4 (bg-job) | **13/13 iteration-5 tests (100%)** | Feature goal achieved |

## Known non-blockers
- Some legacy tests in `/app/backend/tests/backend_test.py` still assert the OLD synchronous `quick/top` response shape `{analyzed, results, summary}`. They should be updated to poll the new `job_id`. Not a product regression.
- No TTL on `quick_jobs` collection — will grow over time. Add a 7-day TTL index when cleanup becomes relevant.
- No job-cancel endpoint — once started, cannot abort. Acceptable for MVP.

## Backlog
### Phase 2
- Stripe checkout to replace `/plan/upgrade` stub
- Portfolio P&L, backtesting, PDF export, SMS/Telegram alerts, NewsAPI sentiment, mobile apps
- Evaluate scorecard at exact time-horizon-end date instead of current price
- Retire / update legacy quick_top tests
- Add TTL index on `quick_jobs.started_at`

### Phase 3
- Multi-asset, brokerage integration, developer API, white-label

## Remaining ETA for Phase-1 Polish
All user-asked items are now shipped. **~0 min remaining** for Phase 1.  
Suggested next sprint (~2-3 days): Stripe checkout + mobile responsiveness audit + scorecard exact-horizon evaluation.
