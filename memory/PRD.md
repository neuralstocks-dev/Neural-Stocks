# Neural — AI Stock Analysis Platform

## Original Problem Statement
Build Phase 1 of AI Stock Analysis Agent Platform per uploaded PRD. Core goal: democratize institutional-grade stock insights for retail investors with Claude-powered BUY/SELL/HOLD recommendations plus explainable reasoning.

## User Choices
- AI Model: Claude Sonnet 4.5 via Emergent Universal LLM Key
- Stock data source: yfinance (free)
- News/social: skipped for MVP
- Auth: JWT email/password **+ Emergent-managed Google OAuth** (both supported)
- Alerts: in-app only

## Architecture
- Backend: FastAPI + MongoDB (Motor) + yfinance + emergentintegrations (Claude Sonnet 4.5) + httpx + bcrypt + PyJWT
- Frontend: React 19 + Tailwind + shadcn/ui + recharts + lucide-react
- Design: "Old Money Tech" — dark-first, Cormorant Garamond + Outfit + IBM Plex Mono

## Core Features (Phase 1 shipped)

### Iteration 1 (Apr 20, 2026)
- Watchlist management (max N per plan, NYSE/NASDAQ/SGX, category tags)
- AI analysis engine (Claude Sonnet 4.5) → recommendation + confidence + price target + stop loss + reasoning + risk factors + technical/fundamental/peer analyses
- Real-time alert system (in-app, auto-created on BUY/SELL @ ≥75% confidence)
- Dashboard: watchlist bento, alerts feed, performance summary, quick-actions
- Detailed report page: verdict ring, price chart (recharts), editorial reasoning w/ drop-cap, risk factors
- JWT auth (register/login/me) + bcrypt + axios interceptor auto-logout on 401
- Dark/light theme toggle

### Iteration 2 (Apr 20, 2026)
- **Rebrand**: Lucid → **Neural** (all surfaces)
- **Emergent Google OAuth** side-by-side with email/password. `POST /api/auth/google/session` exchanges Emergent session_id for a Neural JWT. Frontend AuthCallback handles `#session_id=` fragment with race-safe `useRef` guard.
- **Subscription tiers** (Free / Pro $9.99 / Elite $29.99):
  - Free: 3 stocks, 1 analysis/day, 2/week, no quick-actions, no share, 30-day history
  - Pro: 10 stocks, 15/day, 60/week, quick-actions + share enabled, 1-year history
  - Elite: 25 stocks, unlimited analyses, all Pro features, 10-year history
  - Backend enforcement on all gated endpoints returns HTTP 402 with upgrade messaging
  - Pricing page with 3 plan cards + side-by-side feature matrix + MVP instant-switch upgrade stub (`POST /api/plan/upgrade`)
  - Dashboard shows live quota banner (plan badge, watchlist X/Y, analyses today/week)
- **Share Verdict**:
  - `POST /api/analysis/{analysis_id}/share` (Pro/Elite only, idempotent per analysis)
  - Public route `GET /api/public/verdict/{share_id}` (**no auth**) sanitized to strip user_id/email/plan
  - Frontend `/v/:shareId` public page with own minimal header, shareable URL modal, "Get your own verdicts →" CTA
  - "Share" button on AnalysisReportPage (padlock for Free users → upgrade flow)
- **Parallel quick-analyze**: `quick/top|bottom` now runs up to 3 concurrent Claude calls via `asyncio.gather` (was sequential / timing out at ingress)

## User Personas
- Busy professional (wants automated analysis)
- Novice investor (wants clear guidance + simplified visuals)
- Active trader (wants AI-augmented insights + quick sweeps)

## Testing Status
- **Iteration 1**: 35/39 backend (non-AI 100%; AI blocked by LLM budget at that time)
- **Iteration 2**: **59/60 backend (98.3%)**. Only failure was quick_top ingress timeout; FIXED by parallelizing with `asyncio.gather` + cap to 3 tickers. AI analysis + share verdict flow manually verified end-to-end after fix.
- Frontend: login, signup, dashboard, add AAPL, analyze AAPL, share verdict, public view, pricing page — all rendered and verified via screenshot.

## Known Issues / Backlog

### Optional hardening (post-ship)
- Split server.py into routers + services (now 1040+ lines)
- Add Pydantic validation for full AI analysis response (currently only recommendation is validated)
- Anonymize `shared_by_name` on public verdict (first name + last initial) to prevent accidental PII leakage
- Cache yfinance quotes with 30-60s TTL
- Mongo indexes on shared_verdicts.share_id, analyses(user_id,ticker,created_at)

### Phase 2 backlog (from PRD)
- Stripe checkout for Pro/Elite (currently stub)
- Portfolio tracking, backtesting, PDF export, SMS/Telegram alerts
- NewsAPI + Reddit/Twitter sentiment
- Mobile apps (iOS/Android)
- Historical AI accuracy scorecard

### Phase 3 backlog
- Multi-asset (Forex/Commodities/REITs/ETFs)
- Brokerage integration (Tiger/IBKR)
- Developer API + white-label

## Next Action Items
1. Top up Emergent LLM key budget if it runs low again (Profile → Universal Key → Add Balance)
2. Wire Stripe checkout to replace the `POST /api/plan/upgrade` stub (Phase 2)
3. Gather Phase 1 user feedback, iterate
