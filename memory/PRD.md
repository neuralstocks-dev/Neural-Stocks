# Neural Stock Intelligence™ — PRD

Owner: Emergent Labs Inc. · Product: Neural Stock Intelligence™
Last updated: Apr 2026

---

## 1. Original Problem Statement

Build an AI Stock Analysis Platform (Phase 1 MVP):
- Institutional-grade AI reasoning accessible to retail investors
- Watchlist-based workflow with AI verdicts (BUY/SELL/HOLD)
- Tiered monetization (Free / Pro / Elite)
- Public share verdicts + transparent accuracy scorecard
- Admin console for user management + pricing control
- PayPal subscriptions + Resend email receipts

## 1a. Recent Changes (Apr 2026)

- **Apr 23 — `/technical` page (engineering transparency)**: new deep-dive that honestly documents what Neulab uses (Claude Sonnet 4.5 + deterministic indicators + rule-based pattern engine + keyword heuristic sentiment) and what it does NOT (SVM, Random Forest, CNN, LSTM, FinBERT, proprietary datasets). Eleven sections: hero, myth-buster, 7-stage pipeline, confidence-score mechanics (4 signal families × 5 confidence bands), indicator formulas (RSI / SMA / MACD / volume ratio) replicable in Excel, all 15 candlestick patterns with bias chips + rule summaries, 3 analysis modes, 10-row data-source attribution table, 6 feature specs, honest-limits disclosure, full stack footer. Linked in top nav as "Technical".

- **Apr 22 — Promo discounts + Day Pass one-time tier**:
  - **Promo discount engine** — admin can set independent % discounts on Pro-monthly and Elite-monthly (plus optional label like "Launch Week"). Stored in `db.settings.pricing`; live PayPal plans are auto-rotated to the discounted monthly price on save. Non-admin Pricing page shows a promo banner + per-card strikethrough + `SAVE X%` badge + label.
  - **Day Pass (one-time $5)** — new 4th tier in `PLANS["daypass"]` with admin-editable price, duration (days), and quotas (analyses/day, analyses/week, watchlist, shares/day). Quick batch sweep intentionally disabled; Standard + Candlestick + Hybrid + Pattern Scan always on.
  - Backend: `POST /api/billing/daypass/order` (creates PayPal Order v2 CAPTURE intent) + `POST /api/billing/daypass/capture` (captures + sets `user.plan="daypass"` + `daypass_expires_at`, auto-reverts to free on expiry via `quota.effective_plan_key`). Receipt email sent via Resend. Audit trail in `db.daypass_orders`.
  - `services/paypal.py` extended with `create_order` / `capture_order` / `get_order`.
  - `services/pricing.py` + `routers/admin.py` refactored to support promo fields (`promo_pro_discount_pct`, `promo_elite_discount_pct`, `promo_label`, `promo_ends_at`) and Day Pass config (`daypass_price`, `daypass_duration_days`).
  - Frontend Pricing page — 3 PayPal button variants render for Day Pass (Buy Now / Pay Later / Debit or Credit Card). Banner shows when the user has an active pass (with expiry date).
  - Admin console — new "Promo discount (monthly)" block (Pro % / Elite % / Label) and "Day Pass · one-time purchase" block (price / duration). Tier limits table now includes a fourth `Day Pass` row with an extra `Watchlist` column.
  - Live validation: activated 20% Pro / 15% Elite promo + $5 / 7-day Day Pass → live PayPal plans rotated, Order v2 created with real order_id (`0A428550DT000811T`), Pricing page screenshots confirm strikethrough + SAVE badges + full Day Pass card render.

- **Apr 22 — IDX (Indonesia Stock Exchange) support + Bahasa news**:
  - 20 IDX blue-chip tickers added to catalog (`routers/stocks.py`) under new `IDX` exchange bucket — BBCA.JK, BBRI.JK, BMRI.JK, BBNI.JK, TLKM.JK, ASII.JK, UNVR.JK, GOTO.JK, ICBP.JK, INDF.JK, KLBF.JK, SMGR.JK, ADRO.JK, PTBA.JK, ANTM.JK, GGRM.JK, HMSP.JK, EXCL.JK, JSMR.JK, BREN.JK.
  - `services/idx_news.py` — new RSS scraper for CNBC Indonesia Market + Detik Finance (10-min TTL cache, word-boundary ticker+alias matcher with Bahasa company-name aliases). Returns same shape as Finnhub's `get_company_news()` so UI/PDF don't need to branch.
  - `services/sentiment.py` — shared Neulab keyword classifier extended with ~80 Bahasa Indonesia words (melonjak/anjlok/cuan/laba/rugi/dilaporkan/digugat etc.). Finnhub service now delegates to this shared module.
  - `routers/analysis.py` — `.JK` tickers route through `get_market_context_idx()` instead of Finnhub. Non-IDX tickers unchanged.
  - IDR currency formatting: `formatPrice` (frontend) uses `id-ID` locale (`Rp 6.450`), `_fmt_price` (PDF) uses `Rp ` with zero-decimal precision. Also covers JPY/KRW/VND edge cases.
  - Verdict-page header already shows `{exchange} · {currency}` ⇒ IDX stocks render as `JKT · IDR` with no extra code.
  - Live validation: `POST /api/analysis/BBCA.JK?mode=hybrid` → HOLD @ 62% conf, price Rp 6,450, target Rp 7,100, stop Rp 6,200; yfinance quotes/fundamentals, IDX news source populated (0 articles for BBCA this window is expected — graceful empty state).
  - Limitations: Finnhub's paid-only IDX quotes/consensus/earnings are intentionally skipped on free tier. News coverage depends on feed freshness and whether the ticker/company is mentioned by headline in the last ~100 items per source.

- **Apr 22 — PayPal smoke test + cancel endpoint (admin diagnostic)**:
  - `/admin/paypal-smoke-test` page + `GET /api/billing/smoke-test/plan` / `POST /api/billing/smoke-test/activate` / `GET /api/billing/smoke-test/history` / `POST /api/billing/smoke-test/cancel/{sub_id}`.
  - $1/mo Live PayPal plan (`P-4G394907YL6715359NHUNGJY`) created lazily and cached. End-to-end proven with a real Wise card purchase (`I-BG1V3KRJVK5U`, ACTIVE → CANCELLED after verification).
  - Prominent "Cancel smoke test" banner + per-row Cancel button in Recent diagnostics table.

- **Apr 22 — Sentiment transparency + roadmap on Why Us + CI**:
  - **Finnhub sentiment now transparent**: every headline carries `sentiment_triggers` (positive/negative keyword lists), and the payload includes a `daily_sentiment` 8-point sparkline (today + 7 prior days) built from the full article window.
  - **"Why this sentiment?" tooltip** on each headline — hover the sentiment badge to see matched trigger words (POS/NEG chips) with the "Neulab keyword heuristic" footer.
  - **7-day sentiment sparkline** rendered in the Headlines module header next to the overall score — SVG line + colored dots (green/red/amber) with native-tooltip hover detail per day.
  - **Why Us — roadmap modules added**: `WhyUsPage.jsx` grid expanded from 5 → 8 cards:
    - Watchlists & Alerts copy rewritten to explicitly mention @neulab_bot Telegram push alerts.
    - 3 new "Coming soon" blocks: **Autonomous AI Trading** (broker-connected autopilot), **Native Mobile Apps** (iOS + Android with Touch/Face ID), **SMS · CSV · Backtesting** (SMS alerts, watchlist CSV import/export, 12-month backtesting lab).
  - **CI: Finnhub Contract GitHub Action** (`.github/workflows/finnhub-contract.yml`):
    - `unit` job — PR blocker, runs the 6 offline sentiment/is_configured tests.
    - `integration` job — nightly (02:15 UTC) + on push to main, runs full 16-test contract against the preview backend via `PREVIEW_BACKEND_URL` secret.
  - **Pytest regression locked in** (`backend/tests/test_finnhub_contract.py`): 16 tests — 6 offline + 10 integration incl. trigger-word shape, 8-point sparkline bounds, PDF download contract. 1 LLM call per run via module-scoped fixture.

- **Apr 22 — Finnhub market context surfaced in UI + PDF**:
  - `MarketContextModules.jsx` renders 3 new modules on every Analysis Report between Candlestick Findings and Technical/Fundamental/Peer:
    - **Recent Headlines** — top 5 news items (last 7 days) with source, timeAgo, per-article sentiment chip (pos/neg/neutral), and click-out link; aggregate sentiment summary + score (-1..+1) in the header.
    - **Wall Street Consensus** — stacked bar of Strong Buy / Buy / Hold / Sell / Strong Sell, total analyst count, weighted score, and label (BUY / OVERWEIGHT / HOLD / UNDERWEIGHT / SELL). Graceful empty state when no coverage.
    - **Next Earnings** — date, days-until countdown (amber if ≤7 days), BMO/AMC/DMH label, quarter/year, EPS estimate, revenue estimate.
  - **PDF export** extended (`services/pdf.py`) — same 3 sections appear in the branded PDF under a "Market Context" header (headlines table, consensus row table, earnings summary line).
  - **Data Sources footer** (web + PDF) rewritten: live quotes & market context via Finnhub.io; fundamentals/history via yfinance; news sentiment via Neulab keyword heuristic; AI reasoning via Claude Sonnet 4.5.

## 1b. Recent Changes (Feb 2026)

- **Feb 22 — Live Desk guide + full free-tier candlestick**:
  - **Live Desk Guide** (`LiveDeskGuide.jsx`): New dismissable 4-step onboarding banner on Dashboard — (01) Pick a mode → (02) Click Analyze → (03) Read the verdict → (04) Export or share. Persists dismissal in localStorage.
  - **Watchlist Pattern Scan is now FREE** for all tiers (deterministic detector, no LLM). Removed the Pro gate on `/api/patterns/scan` + Dashboard's Scan Patterns button no longer shows the Pro lock.
  - **Pricing page**: Updated Free tier card to show checkmarks on Candlestick/Hybrid modes AND Watchlist pattern scan. Quick batch sweep (Top/Bottom 3) remains Pro (LLM-gated).
  - **Why Us page**: Refreshed competitive matrix — 17 rows now including Three analyzer modes, 15 candlestick patterns, Daily+weekly scan, Portfolio P&L, PDF export, Telegram push alerts, and "Candlestick & Hybrid on free tier" — with competitor comparison updated accordingly.
- **Telegram LIVE (Feb 22)**: `neulab_bot` is operational. Pattern alerts + high-conviction verdict alerts (BUY/SELL with conf ≥75) auto-push to linked chats.
- **Candlestick modes now FREE for all tiers (Feb 22)**: Removed the Pro/Elite gate on `mode=candlestick|hybrid` in `/api/analysis/{ticker}`. Pricing matrix + feature bullets updated — all 3 modes available to Free users. Pattern scan (bulk watchlist) remains a Pro/Elite perk.
- **Pattern Reference Guide (Feb 22)**: New `PatternGuideDialog` component (accessible via "Learn about patterns" button inside the Candlestick Findings section of any verdict). Displays all 15 supported patterns with Shape / What it means / How to read it / Best when. Searchable + bias-filterable. Patterns detected in the current verdict are highlighted and surface first.
- **Phase 2 — Portfolio, PDF, Telegram (Feb 22)**:
  - **Portfolio P&L** (`/portfolio`): New DB collection `portfolio`. Full CRUD at `/api/portfolio`. Computes live cost basis, market value, unrealized P&L (+ %), day change (+ %), allocation % per position using yfinance quotes. Add/Edit/Delete inline. Ticker deep-links to Analysis Report. Date picker uses shadcn Calendar + Popover.
  - **PDF Export**: `GET /api/analysis/{analysis_id}/pdf` returns a branded PDF via `reportlab`. Includes verdict, reasoning, candlestick findings (Daily/Weekly tables + Primary/Confirmation/Rejected summary), risks, and disclaimer. Owner-scoped (404 for cross-user). "Export PDF" button on AnalysisReportPage.
  - **Telegram Alerts**: New `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_USERNAME` env vars. Routes: `/api/telegram/status|link|poll|unlink|test`. User generates a 6-digit code in Settings, sends to the bot, frontend polls `/telegram/poll` which runs `getUpdates` and auto-links any matching code. Pattern alerts now push to linked chats via fire-and-forget `send_alert_to_user()`. Works out-of-the-box once admin provides bot token — currently shows "Bot not configured" banner gracefully.
  - Nav: added **Portfolio** and **Settings** to main AppShell menu.
  - Dependencies: added `reportlab==4.4.10` for PDF generation.
- **UI polish (earlier Feb 22)**: Analysis Report mode selector disabled on existing verdicts. Why Us cleanup. Pricing updated. Admin list shows analyses/day + ∞ for admins/unlock.
- **Pattern Alerts**: `POST /api/patterns/scan`
  - Analysis Report page: mode selector is now **disabled when viewing an existing verdict** — all three pills are locked, the active pill reflects `analysis.mode`, cursor is `not-allowed`, and the label changes from "Mode" to "Mode used" with a description stating the verdict's mode. Re-analyze preserves the same mode. To run a different mode, user returns to Dashboard and picks it there.
  - Why Us page: removed 4 coming-soon modules (Catalyst Radar, Risk Guard, Market Pulse, Screener Studio). Added new **Candlestick Strategy** module that mentions the 3 analyzer modes (Standard AI / Candlestick / Hybrid) with a link to pattern detectors, timeframes, and Claude reasoning.
  - Pricing page: added 3 new bullet points per tier — "Standard AI analysis mode" (always on), "Candlestick & Hybrid analysis modes" (Pro/Elite), "Watchlist pattern scan (15 patterns)" (Pro/Elite). Matrix shows strike-through on Free, check on Pro/Elite.
  - Admin users table: added **Analyses / day** column showing `used / limit`. Admin users and active test-unlock users render as `used / ∞` (amber) to reflect effective Elite tier.
  - Analysis Report `canPro` gate now respects `user.is_admin` and `user.test_unlock_expires_at` so admin/unlock accounts see candlestick modes as unlocked.
  - Backend `GET /admin/users` now returns `analyses_today`, `analyses_day_limit`, `effective_plan`, `test_unlock_active` per row.
  - AuthCallback: improved error copy + idempotency guard (skips exchange if JWT already present) to prevent double-consumption of the single-use Google session_id under React StrictMode.
- **Pattern Alerts**: `POST /api/patterns/scan` — one-click watchlist-wide candlestick scanner (Pro/Elite). Scans daily + weekly candles across every watchlist stock. Creates alerts for patterns with strength ≥ 70. Idempotent. No LLM calls. New "Scan Patterns" button in Dashboard quick actions.
- **Analysis Modes**: The Analyze Now engine now supports three modes selectable from the Dashboard and the Analysis Report page:
  - **Standard** (Mode A) — existing AI analysis using technicals, fundamentals, momentum. Available to all users (default for Free).
  - **Candlestick** (Mode B) — AI verdict driven primarily by detected candlestick patterns. *Pro/Elite only.*
  - **Hybrid** (Mode C, ★ default for Pro+) — AI fuses fundamentals + technicals + candlestick patterns, using patterns as timing/confirmation signals. *Pro/Elite only.*
  - Backend: `POST /api/analysis/{ticker}?mode=standard|candlestick|hybrid`. Pure-Python detector `services/candlestick.py` scans 15 common patterns (Doji, Hammer, Inverted Hammer, Shooting Star, Hanging Man, Bullish/Bearish Engulfing, Morning/Evening Star, Harami, Three White Soldiers / Black Crows, Piercing Line, Dark Cloud Cover, Tweezer Top/Bottom) on both **daily and weekly** timeframes and returns bias, strength, explanation per pattern + combined bias score.
  - UI: New `AnalysisModeSelector` component (3-pill group, Pro-gated) + new `CandlestickFindings` section on Analysis Report showing Daily/Weekly pattern columns + Primary/Confirmation/Rejected pattern summary from the AI.
  - Tests: `backend/tests/test_candlestick.py` (11/11 passing).
- Scorecard **timeframe filter** (7 days / 1 month / 3 months). Backend `/api/scorecard/me` and `/api/scorecard/global` accept `?timeframe=7|30|90` overriding `min_age_days`.
- WhyUs module rename: **"Alpha Score" → "Score Card"** (clickable — routes to `/scorecard`).
- WhyUs module rename: **"Explain Panel" → "AI Explain Panels"** with new description referencing confidence % + short/medium/long-term fit.
- WhyUs "How it works" step 02 updated: "composite Score Card ratings".
- **PayPal LIVE webhook** registered and verified reachable: `PAYPAL_WEBHOOK_ID=8LP24872BC452025J`. Simulator events fail signature (known quirk); real events will verify correctly.

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · MongoDB (Motor) · yfinance · emergentintegrations (Claude Sonnet 4.5) · httpx · PyJWT · bcrypt · Resend |
| Frontend | React 19 · Tailwind · shadcn/ui · recharts · lucide-react · react-router-dom · @paypal/react-paypal-js |
| Auth | JWT email/password + Emergent Google OAuth |
| Design | "Old Money Tech" — dark-first, Cormorant Garamond + Outfit + IBM Plex Mono |

## 3. Architecture

```
/app/
├── backend/
│   ├── core/            # config, db, models, security (JWT + admin elevation + auto-downgrade)
│   ├── routers/         # auth, plans, stocks, watchlist, analysis, admin, scorecard,
│   │                    # disclaimer, billing
│   ├── services/        # ai, quota (resolved limits), pricing, paypal, email, yfinance_svc
│   ├── tests/           # iteration1..iteration8 + backend_test
│   └── server.py
├── frontend/src/
│   ├── pages/           # Dashboard, AnalysisReport, Login, Signup, Pricing, PublicVerdict,
│   │                    # AuthCallback, Admin, Scorecard, WhyUs
│   ├── components/      # AppShell, AddStockModal, TimelineFitModal, DisclaimerModal,
│   │                    # VerdictRing, SignalBadge, ShareVerdictButton, Sparkline, ui/*
│   ├── context/         # AuthContext (memoized), ThemeContext (memoized)
│   └── lib/             # api, errors, format
└── memory/              # PRD.md + test_credentials.md
```

## 4. Key API Endpoints

- **Auth**: `POST /api/auth/register`, `/login`, `/google/session`, `GET /me`
- **Plans + Quota**: `GET /api/plans` (live prices + limits), `GET /quota`, `POST /plan/upgrade`
- **Stocks**: `GET /stocks/search` (category + exchange filters), `/stocks/exchanges`, `/stocks/{t}/quote`, `/stocks/{t}/history`
- **Watchlist**: `GET/POST/DELETE /api/watchlist`, `GET /watchlist/live` (batched aggregation)
- **Analysis**: `POST /analysis/{ticker}`, `POST /analysis/quick/{kind}` (bg-job), `GET /analysis/job/{id}`, `POST /analysis/{id}/share`, `GET /analysis/share/{id}` (public), `POST /analysis/timeline/{ticker}` (Pro+), `GET /analysis/timeline/{t}/latest`
- **Disclaimer**: `GET /disclaimer`, `POST /disclaimer/accept`
- **Billing**: `GET /billing/config`, `POST /billing/activate`, `POST /billing/cancel`, `POST /billing/webhook`
- **Admin**: `GET /admin/users`, `/logins`, `/pricing`, `/tier-limits` · `PUT /admin/pricing`, `/tier-limits` · `POST /admin/users/{id}/unlock`, `/reset`, `/users/delete` (bulk), `/logins/delete` (bulk) · `DELETE /admin/users/{id}`, `/users/{id}/alerts`, `/logins`
- **Scorecard**: `GET /scorecard`

## 5. Data Model

- `users`, `watchlist`, `analyses`, `timeline_recos`, `shared_verdicts`, `quick_jobs`, `alerts`, `disclaimers`, `subscriptions`, `webhook_events`, `login_events`, `settings` (pricing + tier_limits + PayPal plan IDs)

---

## 6. Feature Log

### ✅ Iteration 1 — MVP (shipped + deployed)
Watchlist, Claude verdict engine, in-app alerts, dashboard, detailed report, JWT auth

### ✅ Iteration 2 — Neural rebrand + tiers (shipped + deployed)
Lucid → Neural rebrand · Emergent Google OAuth · Free/Pro/Elite tiers · Share Verdict

### ✅ Iteration 3 — Admin + Scorecard (shipped + deployed)
Backend refactor (core/services/routers) · Admin auto-elevation (ADMIN_EMAILS) · Admin console (users, logins, unlock/reset) · AI Accuracy Scorecard

### ✅ Iteration 4 — Bg jobs + disclaimer (shipped + deployed)
Background-job quick-analyze + mandatory disclaimer gate

### ✅ Iteration 5 — PayPal + Resend + Admin (deployed)
PayPal sandbox subscriptions · Resend receipts · Admin dynamic pricing · Admin user delete · Admin alert-list clear · Share rate limit (5/50/∞) · Plan upgrade gating

### ✅ Iteration 6 — Yearly billing (deployed)
Yearly plans + 20% annual discount · Admin-configurable discount · Bulk login-event delete · "Top/Bottom 3" rename

### ✅ Iteration 7 — Timeline Fit (deployed)
Pro/Elite · Claude scores short/medium/long-term horizons · 24h cache · Modal UI with best-fit highlighting

### 🚀 Iteration 8 — Pending deploy (READY, not yet live)
*(tested locally, lint clean, ready to click Deploy)*
- **Cancellation grace period** — `/billing/cancel` keeps access until `next_billing_time`, auto-downgrade on expiry via `get_current_user`
- **Admin tier-limits editor** — configure analyses/day, analyses/week, shares/day per tier; blank = unlimited
- **Bulk user delete** — `POST /admin/users/delete` with PayPal cancellation cascade + paid-subscriber warning UI
- **Paid-subscriber warning banner** in admin before destructive delete
- **Expanded stocks catalog** — 90+ curated tickers across NASDAQ/NYSE/NYSEARCA/LSE/SGX/HKEX/TSE/TSX · category + exchange filters · "+N more exchanges" toggle · dynamic result caption
- **Why Us page** (`/why`) — product pitch + 10×7 competitive matrix vs moomoo/Tiger/TradingView/StashAway/TradeIdeas/DBSVickers · persuasion architecture (loss aversion, authority anchor, transparent scorecard) · trademarked branding
- **Test-unlock / admin banner** on pricing page explaining all-features-unlocked state
- **Cancellation banner** on pricing page showing cancels-at date
- **Elite card now renders PayPal Subscribe + Card buttons** (same as Pro) when not an active paid subscriber
- **Dashboard copy** — "Three positions" · "Analyze Now" (nbsp) · "Add up to three symbols"
- **AppShell header** — "Powered by Neural Labs Inc"
- **TimelineFitModal** — "AI RECOMMENDATION" label
- **Feature matrix alignment** — check/X icons right-aligned
- **Code review follow-ups** — memoized AuthContext + ThemeContext values, hoisted recharts config, fixed 3 empty catch blocks, fixed 5 array-index React keys
- **Removed `.env` from .gitignore** — required for deploy
- **N+1 removal in `/watchlist/live`** — single `$group` aggregation

## 7. Deployment Priority

🔴 **P0 — Deploy now**
1. All of Iteration 8 (listed above) — tested, lint clean, approved by deployment agent

🟡 **P1 — Set up before real-money launch**
2. Register PayPal webhook URL at `POST /api/billing/webhook` in PayPal Dashboard
3. Set `PAYPAL_WEBHOOK_ID` in `/app/backend/.env` — without this, recurring renewal receipts and lifecycle mutations stay in log-only mode
4. Flip `PAYPAL_ENV=live` when ready for real money (currently `sandbox`)

🟢 **P2 — Nice to have**
5. Verify custom domain in Resend → replace `onboarding@resend.dev`
6. Mobile responsiveness audit (tested desktop thoroughly, mobile not regression-tested)

## 8. Pending / Backlog (deferred per user)

### Phase 2 (deferred Feb 2026)
- Portfolio P&L tracking + CSV import/export
- Backtesting engine
- PDF export of analysis reports
- SMS / Telegram alert channels
- NewsAPI sentiment integration

### Phase 3 (future)
- Multi-asset support (crypto, forex)
- Brokerage execution integration
- Public developer API
- White-label / team plans
- Referral / "free month" mechanic

## 9. Testing Log

| Iter | Score | Notes |
|---|---|---|
| 1 | 35/39 | non-AI 100%; LLM budget blocked |
| 2 | 59/60 | 98.3% |
| 3 | 82/84 | 97.6% |
| 4 | 13/13 | 100% |
| 5 | 22/22 | 100% |
| 6 | 14/14 | 100% |
| 7 | 14/14 backend + 12/12 frontend | 100% |
| 8 | Manual smoke tested · pending full regression on prod | Ready to deploy |
| 9 | Manual smoke (Feb 2026) — scorecard timeframe filter + Why Us module rename verified | ✅ |
| 10 | 6/6 backend + 11/12 frontend — Analysis Modes (standard / candlestick / hybrid) end-to-end | ✅ zero critical issues |

## 10. Known Non-Blockers

- `PAYPAL_WEBHOOK_ID` unset — webhook events logged to `db.webhook_events` but don't mutate state. Lifecycle fallbacks handled by on-activation + auto-downgrade. Register before going live.
- No TTL on `quick_jobs` or `webhook_events` collections — low priority; volume is small.
- First `/billing/config` call is cold (~10-15s) because it lazy-creates 4 PayPal plans. Subsequent calls are fast.
- Resend still using `onboarding@resend.dev` sender — emails only deliver to verified address in Resend test mode. Verify custom domain before going wide.
- Sliding 24h share window (not calendar day) — acceptable for MVP.
- Auth uses JWT in localStorage. Architectural, not a bug. Future migration to httpOnly cookies is a separate P2 task.

## 11. Test Credentials

See `/app/memory/test_credentials.md`.

Primary test accounts:
- `jolor69@gmail.com` / `admin1234` — admin, auto-elevated to Elite via ADMIN_EMAILS
- `tiers@demo.io` / `pass1234` — regular Pro user
- `demo@stockai.io` / `demo1234` — Free user

---

*This document is the single source of truth for product scope. Update before each deploy.*
