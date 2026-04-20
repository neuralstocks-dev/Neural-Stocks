# Lucid — AI Stock Analysis Platform (Phase 1 MVP)

## Original Problem Statement
Build Phase 1 of AI Stock Analysis Agent Platform per uploaded PRD (PRD_AI_Stock_Analysis_v1.1). Core goal: democratize institutional-grade stock insights for retail investors by providing Claude-powered BUY/SELL/HOLD recommendations with explainable reasoning.

## User Choices (locked in Jan-2026 kickoff)
- AI Model: Claude Sonnet 4.5 via Emergent Universal LLM Key
- Stock data source: yfinance (free, no key required)
- News/social: skipped for MVP (faster ship)
- Auth: JWT email/password
- Alerts: in-app only (no email provider)

## Architecture
- Backend: FastAPI + MongoDB (Motor) + yfinance + emergentintegrations LlmChat
- Frontend: React 19 + Tailwind + shadcn components + recharts + lucide-react
- Design: "Old Money Tech" — dark-mode first, Cormorant Garamond + Outfit + IBM Plex Mono, sharp Swiss-brutalist modules with editorial serif hero numbers

## Core Requirements (static)
- Watchlist management (max 5 stocks, NYSE/NASDAQ/SGX, category tags)
- AI analysis engine returning recommendation + confidence + price target + stop loss + 200-500-word reasoning + 3-5 risk factors + technical/fundamental/peer analyses
- Real-time alert system (in-app, auto-created on BUY/SELL with >=75% confidence)
- Dashboard with watchlist overview, alerts feed, performance summary, quick actions (Top 5 / Bottom 5 / Refresh / Add)
- Detailed analysis report page with executive summary, price chart, verdict ring, reasoning (editorial drop-cap), technical/fundamental/peer modules, risk factors

## User Personas
- Busy professional (wants automated analysis)
- Novice investor (wants clear guidance & simplified visuals)
- Active trader (wants AI-augmented insights)

## What's been implemented (Apr 20, 2026 — Iteration 1)
### Backend (/app/backend/server.py)
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` (JWT, bcrypt)
- `GET /api/stocks/search?q=` — curated popular tickers (NYSE/NASDAQ/SGX)
- `GET /api/stocks/{ticker}/quote` — yfinance live quote
- `GET /api/stocks/{ticker}/history?period=&interval=` — price series
- `GET/POST/DELETE /api/watchlist` + `GET /api/watchlist/live` (embeds quotes + latest analysis)
- `POST /api/analysis/{ticker}` — Claude Sonnet 4.5 analysis (JSON response, auto-alert on conf≥75%)
- `GET /api/analysis/{ticker}/latest` + `/history`
- `POST /api/analysis/quick/{top|bottom}` — bulk analyze top/bottom performers
- `GET /api/alerts`, `POST /api/alerts/{id}/read`, `POST /api/alerts/read_all`
- yfinance helpers compute RSI(14), SMA20/50, EMA12/26, MACD from 6mo history
- Graceful 503 on Emergent LLM budget exhaustion

### Frontend (/app/frontend/src)
- Login + Signup pages with full-bleed cinematic slate/ambient background + asymmetric frosted sign-in panel + huge Cormorant italic hero ("An analyst in your pocket.")
- Dashboard with hero headline, 4 quick-action buttons, watchlist bento module, terminal-style alerts feed (left-border signal color), performance summary (avg change / gainers·losers / verdicts / unread)
- Watchlist rows: mono ticker + hero-number price + trend sparkline + signal badge + analyze/view/remove actions
- Analysis Report page: price chart (recharts), VerdictRing SVG component with tick marks, price target + stop loss modules, editorial drop-cap reasoning, 3-column technical/fundamental/peer cards, risks list with R.XX prefix
- Dark/light theme toggle (persisted in localStorage)
- Protected routes, axios interceptor with auto-logout on 401

## Testing Status (iteration_1.json)
- Backend: 35/39 passed (100% non-AI). AI endpoints failing due to EMERGENT_LLM_KEY budget exhaustion — NOT a code bug. Manually verified earlier: Claude analysis returned correct JSON for AAPL.
- Frontend: Manually verified — login → signup → dashboard with live AAPL quote working

## Known Issues / Action Items (prioritized)
### P0 — Unblock AI
1. **EMERGENT_LLM_KEY budget exhausted.** User needs to top up via Profile → Universal Key → Add Balance. All AI endpoints then become functional immediately.

### P1 — Phase 1 polish
2. Split server.py into routers (auth/stocks/watchlist/analysis) for maintainability
3. Add Pydantic validation to AI response (price_target, stop_loss, risk_factors etc.)
4. Cache yfinance quotes (30-60s TTL) to reduce latency on /watchlist/live
5. Add Mongo indexes on watchlist(user_id,ticker) and analyses(user_id,ticker,created_at)

### P2 — Phase 2 backlog (from PRD)
- Scale watchlist to 20 stocks
- Portfolio tracking with P&L
- Backtesting engine
- PDF export of reports
- SMS / email / Telegram alert channels
- Historical accuracy scorecard for AI recommendations
- News sentiment analysis (NewsAPI + Reddit/Twitter)
- Mobile apps (iOS / Android)

### P3 — Phase 3 backlog
- Multi-asset (Forex / Commodities / REITs / ETFs)
- Brokerage integration (Tiger / IBKR)
- Community features
- Developer API + white-label
- Paid tiers (Pro $9.99, Elite $29.99)

## Next Actions
1. User to top up Emergent LLM key budget → re-run testing_agent to verify all 39 tests green
2. Gather feedback on Phase 1 UI/UX → iterate
