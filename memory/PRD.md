# Neural — AI Stock Analysis Platform

## Original Problem Statement
Phase 1 MVP of an AI Stock Analysis Agent Platform (per uploaded PRD). Later extended with admin console, subscription tiers, shareable verdicts, Google OAuth, and an accuracy scorecard.

## Tech
- Backend: FastAPI (split into `core/` `services/` `routers/`) + MongoDB (Motor) + yfinance + emergentintegrations (Claude Sonnet 4.5) + httpx + bcrypt + PyJWT
- Frontend: React 19 + Tailwind + shadcn/ui + recharts + lucide-react + react-router-dom
- Design: "Old Money Tech" — dark-first, Cormorant Garamond + Outfit + IBM Plex Mono

## Backend Module Layout (post-iteration-3 refactor)
```
/app/backend/
├── server.py                 # thin app bootstrap (mount routers, CORS)
├── core/
│   ├── config.py             # env vars, PLANS, UNLOCK_DURATIONS, ADMIN_EMAILS
│   ├── db.py                 # Mongo client singleton
│   ├── security.py           # JWT, bcrypt, get_current_user, admin_required
│   └── models.py             # Pydantic request/response
├── services/
│   ├── yfinance_svc.py       # quote / history / fundamentals / technicals
│   ├── ai.py                 # Claude Sonnet 4.5 wrapper + system prompt
│   └── quota.py              # plan_for / effective_plan_key / test_unlock_active
└── routers/
    ├── auth.py               # /auth/register, /auth/login, /auth/google/session, /auth/me (+ login tracking)
    ├── plans.py              # /plans, /quota, /plan/upgrade
    ├── stocks.py             # /stocks/search, /stocks/{t}/quote, /stocks/{t}/history
    ├── watchlist.py          # /watchlist CRUD + /watchlist/live
    ├── analysis.py           # /analysis/{t}, /analysis/{t}/latest|history, /analysis/quick/{kind}, /alerts/*, /analysis/{id}/share, /public/verdict/{share_id}
    ├── admin.py              # /admin/users, /admin/logins, /admin/users/{id}/unlock|reset
    └── scorecard.py          # /scorecard/me, /scorecard/global
```

## Core Features

### Iteration 1 (Apr 20)
- Watchlist (max per plan), Claude verdict engine, in-app alerts, dashboard w/ performance summary, detailed report page, JWT auth

### Iteration 2 (Apr 20)
- Rebrand Lucid → **Neural**
- Emergent-managed Google OAuth side-by-side with email/password
- Free / Pro $9.99 / Elite $29.99 subscription tiers with real backend enforcement (HTTP 402 on gated endpoints)
- Public **Share Verdict** pages (`/v/:shareId`, no auth)

### Iteration 3 (Apr 20)
- **Refactor**: `server.py` → `core/ + services/ + routers/` (zero regressions, 82/84 backend tests)
- **Admin system**:
  - `ADMIN_EMAILS` env (default `jolor69@gmail.com`) auto-elevates any matching user to `is_admin=true` and effective plan = Elite
  - Login tracking: `login_events` collection + `users.last_login_at` + `users.login_count`
  - Admin console page with users table, per-row duration select, Unlock + Reset buttons, recent logins panel
  - Endpoints: `GET /admin/users`, `GET /admin/logins`, `POST /admin/users/{id}/unlock {duration}`, `POST /admin/users/{id}/reset`
  - Durations: 1h, 2h, 4h, 12h, 1d, 3d, 1w, 2w, 3w, 4w, forever
  - Granted unlock sets `test_unlock_expires_at` (ISO or "forever"); `plan_for()` returns Elite while active
  - Test-unlock banner on dashboard (amber, shows "Xd remaining · base plan: FREE")
  - Instruction in every admin response: "User must log out & log back in to see changes"
- **AI Accuracy Scorecard** (`/scorecard`):
  - `/scorecard/me` and `/scorecard/global` (both auth-required)
  - Verdicts <7 days old → `pending`. Older: BUY hit if +≥5%, SELL hit if ≤-5%, HOLD hit if |Δ|≤5%
  - Per-recommendation breakdown, platform benchmark row, verdict history table

## User Personas
- Busy professional / novice investor / active trader / **admin (QA / internal team)**

## Testing Status
| Iteration | Backend | Notes |
|-----------|---------|-------|
| 1 | 35/39 (100% non-AI) | AI blocked by LLM budget |
| 2 | 59/60 (98.3%) | quick/top timeout → fixed |
| 3 | **82/84 (97.6%)** | Scorecard/global auth fixed post-test (1-liner). Pre-existing quick/top 502 on slow LLM calls remains. |

## Known non-blockers
- `quick/top` can hit preview ingress 60s limit if 3 parallel Claude calls all cold-start. Mitigation: switch to `asyncio.wait` with per-task timeout, or convert to async job + polling (P1)
- `services/quota.enforce_analysis_quota` is NOT called inside `quick/top`'s 3 sub-analyses individually — they share the single pre-check. Acceptable but document.
- ADMIN_EMAILS has a default of `jolor69@gmail.com` in code even when env is missing (fine for product, prod should fail-closed)

## Backlog
### Phase 2
- Stripe for Pro/Elite (currently stub)
- Portfolio P&L, backtesting, PDF export, SMS / Telegram alerts, NewsAPI sentiment, mobile apps
- Historical accuracy hardening: evaluate at exact time_horizon_weeks end-date instead of today

### Phase 3
- Multi-asset (Forex/Commodities/REITs/ETFs), brokerage integration, developer API, white-label

## Next Actions
1. Decide between `asyncio.wait` vs background-jobs approach to fully harden quick_analyze
2. Wire Stripe checkout to replace `POST /api/plan/upgrade`
3. Anonymize `shared_by_name` on public verdict (first-name + last-initial) to avoid accidental PII
