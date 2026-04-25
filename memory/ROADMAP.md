# Neulab — Roadmap

> Living backlog of upcoming + future work. Phase numbers map to product maturity, not calendar dates.

---

## Phase 3 — In flight (current)

- **P1**: Confirm PayPal webhook `Verified=yes` on next live renewal/cancel event (waiting on organic traffic).
- **P2**: SMS alert channel (Twilio).
- **P2**: Watchlist CSV import/export.
- **P2**: "Coming soon" pages — Autonomous AI Trading, Native Mobile Apps.
- **P2 (optional polish)**: `React.memo(WatchlistRow)` to bring admin spinner first-paint from ~1.2s → ~400ms (testing-agent flagged in iter 27, low-priority).

---

## Phase 4 — Multi-asset expansion (parked, not started)

> Triggered by: 100+ paid users OR explicit user demand for options/forex/crypto.
> Vendor: **Polygon.io** (research summary captured Apr 2026).

### P4.1 — Options product (Pro/Elite add-on)
- **Why first**: closest adjacency to current equity research; no UX pivot.
- **Data**: Polygon options chains (Greeks, IV, OI, trades + quotes — US only).
- **Plan size**: Polygon **Starter $29/mo** for prototype, **Developer $79/mo** for live launch.
- **Free-tier prototype path**: sign up for Polygon **Free** ($0, no card, 5 calls/min) — sufficient to prototype one-ticker options-chain UI before paying.
- **Scope sketch**:
  - New verdict module: "Options playbook" — Claude reads the chain + Greeks and suggests a single covered-call / cash-secured-put / vertical with a confidence score.
  - New `/options/{ticker}` page — chain explorer with Greeks heatmap + IV smile.
  - Pricing-page rollout: gate behind Pro/Elite, advertised on `/why`.
- **Risk**: licensing — confirm Polygon's options data redistribution rules before exposing on shared verdicts.

### P4.2 — Real-time tick upgrade (stocks)
- **Why**: faster live prices for power users, S3 bulk for cheaper RF retrain.
- **Data**: Polygon Advanced $199/mo (replaces Finnhub for quotes; Finnhub stays for news + sentiment OR drop entirely with a swap to Polygon News).
- **Win**: ~20ms tick latency vs ~250-500ms REST today. Currently irrelevant (verdict takes 20-60s) but enables future live-ladder UX.
- **Hidden win**: Polygon S3 flat files would massively speed up the weekly RF retrain pipeline (currently pulling 344 tickers × 5 yr from yfinance which sometimes 404s).

### P4.3 — Forex (deferred, decision-pending)
- **Why later**: dilutes "institutional equity research" positioning. Revisit only after Options is profitable.
- **Data**: Polygon forex (1100+ pairs, tick-level, included in stocks+options bundle ~$449/mo OR forex-only).

### P4.4 — Crypto (deferred, decision-pending)
- **Why later**: requires retraining the Random-Forest on crypto regime features (different vol structure, no fundamentals, 24/7 sessions).
- **Data**: Polygon crypto (100+ exchanges aggregated, L2 order book).

### What stays untouched in Phase 4
- **IDX (.JK) moat** — RapidAPI + Bandarmology stay primary. Polygon is US-only and will NEVER cover IDX. The IDX layer is independent of Phase 4.
- **Finnhub free tier** — stays for news/sentiment/earnings/consensus until P4.2 explicitly retires it. Cheaper to keep than to replace.
- **yfinance** — stays as the unlimited free historical-OHLC fallback.

### Pre-launch checklist for P4.1 (when triggered)
- [ ] Sign up for Polygon Free key ($0) — prototype options chain on AAPL.
- [ ] Build `/admin/data-sources` diagnostic page tracking per-source call volume so we can size the right Polygon paid tier with real numbers (not guesses).
- [ ] Confirm Polygon options redistribution licensing for shared verdicts (`/v/<share_id>` public pages).
- [ ] Decide pricing gate: Pro vs Elite vs new "Options" add-on tier.
- [ ] Get `integration_playbook_expert_v2` to draft the actual integration playbook before any code.

---

## Phase 5 — Beyond (whiteboard only)

- Brokerage execution integration (Alpaca? IBKR?)
- Public developer API (read-only verdicts + scorecard)
- White-label / team plans
- Referral / "free month" growth mechanic
- Multi-language UI (Bahasa Indonesia is highest-value second language given IDX traction)
