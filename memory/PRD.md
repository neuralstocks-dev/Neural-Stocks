# Neural — AI Stock Analysis Platform

## Original Problem Statement
Phase 1 MVP per uploaded PRD: AI Stock Analysis Agent with Claude-powered verdicts + explainable reasoning. Later extended with admin console, subscription tiers, share verdicts, Google OAuth, accuracy scorecard, mandatory disclaimer gate, background-job quick-analyze, and **PayPal subscription billing + Resend email receipts + dynamic admin pricing**.

## Tech
- Backend: FastAPI (split into `core/` `services/` `routers/`) + MongoDB (Motor) + yfinance + emergentintegrations (Claude Sonnet 4.5) + httpx + bcrypt + PyJWT + **resend (email) + PayPal REST via httpx**
- Frontend: React 19 + Tailwind + shadcn/ui + recharts + lucide-react + react-router-dom + **@paypal/react-paypal-js**
- Design: "Old Money Tech" — dark-first, Cormorant Garamond + Outfit + IBM Plex Mono

## Feature Log

### Iteration 1
Watchlist, Claude verdict engine, in-app alerts, dashboard, detailed report, JWT auth

### Iteration 2
Lucid → **Neural** rebrand · Emergent Google OAuth · Free/Pro/Elite tiers · Share Verdict

### Iteration 3
Backend refactor (core/services/routers) · Admin auto-elevation (ADMIN_EMAILS) · Admin console (users, logins, unlock/reset) · AI Accuracy Scorecard

### Iteration 4
Background-job quick-analyze + mandatory disclaimer gate

### Iteration 5 (current — Feb 2026)
- **PayPal Subscriptions (sandbox)**: `/api/billing/config` returns client_id + auto-created PayPal plan_ids. `/api/billing/activate` verifies subscriptions via PayPal, upgrades plan, sends receipt. `/api/billing/cancel` cancels via PayPal + downgrades to Free. `/api/billing/webhook` handles BILLING.SUBSCRIPTION.* + PAYMENT.SALE.COMPLETED (signature-verified when `PAYPAL_WEBHOOK_ID` set).
- **Resend email receipts**: Branded HTML receipts with plan / amount / subscription ID + mandatory financial disclaimer footer sent from `onboarding@resend.dev` on activation and recurring renewals.
- **Dynamic admin pricing**: `PUT /api/admin/pricing` rotates PayPal billing plans. Current subscribers keep old price; new checkouts use new price.
- **Admin user deletion**: `DELETE /api/admin/users/{id}` cascades watchlist/analyses/alerts/shares/subscriptions + cancels any live PayPal sub. Blocks admins + self.
- **Admin alert-list removal**: `DELETE /api/admin/users/{id}/alerts` clears alerts for any user.
- **Share rate limit**: `/api/analysis/{id}/share` daily limits — Free 5, Pro 50, Elite unlimited. Returns HTTP 429 on exceed.
- **Plan upgrade gating**: `/plan/upgrade` blocks free→paid for non-admins (forces PayPal checkout).
- **Frontend**: PayPal Smart Subscribe buttons on Pricing page · Admin pricing editor + per-user Reset/ClearAlerts/Delete icons · sandbox banner.

## Testing Status
| Iter | Score | Notes |
|------|-------|-------|
| 1 | 35/39 (100% non-AI) | LLM budget blocked |
| 2 | 59/60 (98.3%) | quick/top ingress fixed |
| 3 | 82/84 (97.6%) | scorecard/global auth fixed |
| 4 | **13/13 (100%)** | bg-job & disclaimer gate |
| **5** | **22/22 backend (100%) + frontend verified** | PayPal sandbox + Resend + admin pricing + delete + share limit |

## Known non-blockers
- `PAYPAL_WEBHOOK_ID` intentionally unset — webhooks log to `db.webhook_events` but don't mutate state. Set env var and register webhook in PayPal dashboard before going live.
- No TTL on `quick_jobs` / `webhook_events` collections.
- First `/billing/config` hit takes 5-15s (cold PayPal product+plan creation); subsequent calls are fast.
- `db.settings.pricing` read on every `/plans` call — fine for current scale; add TTL cache if >1k RPM.
- Sliding 24h share window (not calendar day) — acceptable.

## Backlog
### Phase 2 (deferred per user Feb 2026)
- Portfolio P&L, backtesting, PDF export, SMS/Telegram alerts, NewsAPI sentiment, CSV import/export
- Mobile responsiveness audit
- Yearly plan / annual discount (PayPal yearly billing cycle)
- Webhook signature verification flow (requires `PAYPAL_WEBHOOK_ID` setup)
- Switch `PAYPAL_ENV=live` when ready
- Custom sender domain in Resend (replace `onboarding@resend.dev`)

### Phase 3
- Multi-asset, brokerage integration, developer API, white-label
