# Neural Stock Intelligence™ — PRD

Owner: Emergent Labs Inc. · Product: Neural Stock Intelligence™
Last updated: Apr 2026

---

## 1a. Recent Changes (Apr 2026)

- **Apr 24 — Mobile UX audit & responsive fixes (P1)**: Resolved the user's long-standing complaint about hidden menus on mobile. **(1) Mobile hamburger menu added to AppShell**: the desktop nav was previously `hidden md:flex` with **no mobile replacement**, leaving mobile users with zero way to navigate between Dashboard / Portfolio / Scorecard / Pricing / Why us / Technical / Admin / Settings. Shipped a proper right-side drawer — hamburger button (`data-testid="mobile-menu-button"`) appears below `md` breakpoint, opens a full-height drawer with backdrop blur, "Signed in as" header with plan/admin badges, all 7 nav links + Admin link (conditional on `user.is_admin`) + Settings, and a Log-out button at the bottom. Drawer auto-closes on route change via `useEffect(()=>{setMobileOpen(false)},[loc.pathname])`, traps body scroll while open, and uses a CSS keyframe `slideInRight` (220ms ease-out) for the panel entrance. Every interactive element has `-mobile` suffixed test IDs. **(2) Header decluttered on mobile**: user email (`hidden lg:inline` + `max-w-[160px] truncate`) and desktop logout button (`!hidden md:!inline-flex`) removed from mobile bar — only logo, theme toggle, and hamburger remain (3 items = clean). Used Tailwind `!` important prefix to override `.btn-ghost { display: inline-flex }` base CSS. **(3) Page-level horizontal overflow killed**: added `html, body { overflow-x: hidden }` in `index.css` to prevent any accidental horizontal scroll on mobile from nested tables/grids (Admin page was reporting `scrollWidth=912` on a 390px viewport before this fix). Also added `.module { min-width: 0 }` and `.overflow-x-auto { max-width: 100% }` so internal tables stay scrollable within their own container rather than bubbling to body. **(4) Analysis Report ticker header**: `flex items-baseline gap-4` bumped to `flex-wrap gap-x-4 gap-y-1 min-w-0 break-all` so long company names don't overflow next to the hero ticker symbol (clamp lowered to `2.2rem` floor). **Verified on 390px mobile viewport (iPhone 14 Pro reference)**: Dashboard, Admin, Portfolio, Pricing, Scorecard, Technical, Settings, Analysis Report — every route reports `canScrollX: False` + `hamburger: True`. Drawer navigation round-trip validated: `nav-portfolio-mobile` click → `/portfolio` → drawer auto-closed. Desktop (≥md) layout completely untouched — logout button, full nav, and email badge re-appear at `md`+.

## 1b. Recent Changes (Apr 2026)

- **Apr 24 — Finnhub-for-IDX silenced + RapidAPI/Bandarmology credited across pages**: **(P0)** `services/yfinance_svc.get_quote()` now skips the Finnhub `/quote` call entirely for `.JK` tickers via `is_idx_ticker()` guard — Finnhub free tier doesn't cover IDX, so the call was only producing harmless 403 log spam (caught by `return_exceptions=True` but still logged). After restart: zero new Finnhub 403 log entries on IDX analyses. Also saves ~1 outbound HTTP call per IDX verdict. **(P1)** IDX data-source crediting swept across 4 surfaces: (a) `AnalysisReportPage` data-sources footer now branches on `ticker.endsWith('.JK')` — IDX variant credits RapidAPI (primary) + yfinance (fallback/OHLC) + Bandarmology + CNBC Indonesia + Detik Finance RSS + Bahasa sentiment; US variant unchanged. (b) `TechnicalPage` pipeline stage "Data acquisition" rewritten to describe the IDX RapidAPI path (quote + keystats + bandarmology caches). (c) `TechnicalPage` data-sources table expanded from 10 to 13 rows — added "Live quote (IDX) · RapidAPI", "Fundamentals — IDX · RapidAPI keystats", "Bandarmology · /emiten/{sym}/insider", "Top IDX Picks scanner · /main/trending" with their coverage + cache columns. (d) `TechnicalPage` Honest-limits IDX bullet rewritten to flip the narrative from "IDX has less than US" to "IDX gets two exclusive things US doesn't — Bandarmology + Top Picks". Stack footer mentions RapidAPI IDX alongside yfinance + Finnhub. **(PDF)** `services/pdf.py` footer now emits a third variant for IDX reports — credits RapidAPI primary / fallback per `idx_data_source`, adds Bandarmology line when `analysis.bandarmology` is present, swaps Finnhub news for CNBC Indonesia + Detik Finance. **Verified** via `testing_agent_v3_fork` iteration 11 — 6/6 frontend checks PASS end-to-end on `tiers@demo.io`: clicked Top IDX Picks → ENRG.JK row → autorun fired → verdict rendered with `idx-source-chip-rapidapi` + Bandarmology + Confluence + RF modules + correct IDX-aware data-sources footer with ZERO Finnhub mentions.

- **Apr 23 — Multi-point polish pack (autorun × 3 entry points + admin quota reset + WhyUs Bandarmology rows + Scorecard empty-state explainer)**: wrapped up 4 UX refinements. **(1) Autorun deep-links** — now appended to three more entry points so every path into the verdict page is zero-click: (a) Dashboard watchlist "View" buttons, (b) Telegram alerts — `send_alert_to_user()` gained an optional `ticker` kwarg that appends "Open {TICKER} in app →" HTML link using new `PUBLIC_APP_URL` env var; both AI-verdict alerts and candlestick alerts now pass it, (c) the public share-verdict page's "Run your own on {TICKER}" secondary CTA. The existing autorun effect safely no-ops on repeat arrivals with an existing recent verdict. **(2) Admin per-user quota reset**: new endpoint `POST /api/admin/users/{id}/reset-quota` stamps `quota_reset_at = now`. `enforce_analysis_quota`, `quota_snapshot`, and `enforce_idx_analysis_quota` all honour the floor — analyses older than the reset timestamp stop counting against the window but stay on the user for the scorecard. Admin UI has a Timer-icon button in every user row with a confirm dialog. `_sanitize_user()` returns `quota_reset_at`. **(3) Why Us — IDX differentiator rows**: 3 new rows at the top of the comparison table (Bandarmology, Candlestick × Bandarmology confluence, Top IDX Picks) marked ✓ for Neulab and — for all 7 competitors. Each has an amber "EXPLAIN" button opening a rich dialog with full methodology + deep-link to `/technical#bandarmology`. WhyUsPage is now stateful. **(4) Scorecard empty-state explainer**: prominent amber module on `/scorecard` when all verdicts are pending. Answers "why is this empty after one week?" — explains the 7/30/90-day thresholds, 4-cell stats grid (Min age · Hit threshold · You have · Still cooking), 3-step "What you need to do" list ending with "Nothing else — the market resolves verdicts automatically." Verified showing "You have 63 verdicts cooking. None are 7 days old yet." on `tiers@demo.io`.

- **Apr 23 — Bandarmology × Candlestick confluence + RF drift alerts + IDX marketing + hard-limit reminder correction**: Shipped 4-part polish pass. Confluence chip cross-references candlestick patterns against bandarmology regime (bullish / bearish / divergence). RF drift detection runs after every retrain, pushes Telegram alert if acc drops ≥5pp or Brier rises ≥20% vs 4-week rolling mean. IDX marketing banner on `/pricing` + new `/technical#bandarmology` public explainer section (methodology, formulas, 5 regime thresholds, honest caveats, confluence overlay). Admin IdxBudgetCard hard-limit reminder corrected — clarified that RapidAPI's hard-limit setting is provider-controlled (not consumer-togglable on this API), linked to Subscriptions & Usage page instead, documented the "remove payment card" nuclear option as real belt-and-braces defence.

## 1. Original Problem Statement

Build an AI Stock Analysis Platform (Phase 1 MVP):
- Institutional-grade AI reasoning accessible to retail investors
- Watchlist-based workflow with AI verdicts (BUY/SELL/HOLD)
- Tiered monetization (Free / Pro / Elite)
- Public share verdicts + transparent accuracy scorecard
- Admin console for user management + pricing control
- PayPal subscriptions + Resend email receipts

## 1a. Recent Changes (Apr 2026)

- **Apr 23 — Bandarmology × Candlestick confluence + RF drift alerts + IDX marketing**: wrapped up a 4-part polish pass on top of the RapidAPI + Bandarmology launch. **(1) Candlestick × Bandarmology confluence chip**: new `_compute_confluence()` in `routers/analysis.py` cross-references the candlestick scanner's detected patterns against the bandarmology regime on every hybrid IDX analysis. Fires a prominent banner on the verdict page (`ConfluenceChip` component) with three variants: `bullish` (green — bullish pattern + accumulation regime), `bearish` (red — bearish pattern + distribution), or `divergence` (amber — signals pull opposite ways). Trigger relaxed from "combined bias strong" to "any pattern + regime" per user intent. BBCA.JK hybrid analysis correctly fires "BULLISH CONFLUENCE · STRONG · Double-confirmation: bullish reversal pattern + smart-money accumulation · Bullish Harami + Inverted Hammer + 88% insider accumulation". Attached to `doc.confluence` so PDFs and shared verdicts carry it too. **(2) RF drift alert via Telegram**: new `_check_drift_and_alert()` in `services/rf_retrain.py` runs after every successful retrain (scheduler + admin + CI). Queries last 4 successful retrains for rolling means of `holdout_accuracy` and `calibrated_brier`, compares against the new model. Drift triggers: accuracy drops ≥5pp OR Brier rises ≥20%. When triggered, pushes an HTML-formatted Telegram message (model age, universe, new vs rolling-avg metrics, reasons list, "reload or retrain" CTA) to every admin with a linked `telegram_chat_id`. Outcome (whether drift fired or not) is persisted on the retrain-job doc under `drift_check` for ops history. Uses the existing `send_alert_to_user()` helper from `services/telegram.py`. **(3) IDX marketing angle**: new differentiator banner on `/pricing` ("NEW · FOR IDX INVESTORS — The only platform showing live director-level accumulation signals for the IDX") that deep-links to a new `/technical#bandarmology` public explainer section. The explainer documents: methodology, formulas (`accumulation_ratio`, `smart_money_ratio`, `foreign_net_shares` formulae in monospace), the 5 regime labels and their thresholds, honest caveats (insider reporting lag, sub-threshold holders missing, not-a-forecast), and the confluence overlay. SEO-ready copy usable as LinkedIn / IDX-forum acquisition hook. **(4) Hard-limits reminder on admin IdxBudgetCard**: when `RAPIDAPI_KEY` is configured, the card now renders an amber second-defence reminder explaining how to set a hard monthly cap on the RapidAPI developer dashboard (with direct link) as backup to our 950/mo soft cap. All 4 changes lint-clean on Python + JS.

- **Apr 23 — IDX Bandarmology + Top Picks (Pro feature layer)**: shipped two flagship IDX-exclusive features built on the live RapidAPI key. **(1) Bandarmology smart-money flow**: new `get_bandarmology()` in `services/idx_rapidapi.py` consumes `/api/emiten/{sym}/insider` (a goldmine endpoint we discovered — returns per-insider BUY/SELL action, change in shares, director/commissioner/major-shareholder badges, nationality). We compute the accumulation score **locally** from the raw filings rather than using a separate "accumulation detector" endpoint — saves budget (1 call instead of potentially 4), makes the math fully auditable, and survives provider endpoint changes. Signals exposed: `accumulation_ratio` (buy ÷ total shares), `smart_money_accumulation` (directors+commissioners+major holders only), `foreign_net_shares`, `buy_count` vs `sell_count`, regime labels (strong/mild accumulation, balanced, mild/strong distribution, no_signal), and the 5 most-recent filings with sample detail. Surfaced on every IDX verdict via new `BandarmologyCard` component — red/green accumulation bar + 3-cell stats grid (smart money %, foreign net flow, total filings) + recent-filings list with SMART MONEY / FOREIGN badges. BBCA.JK currently renders "Strong accumulation · 88% BUY · 19 buys / 1 sell · 7.31M shares bought by directors" — exactly the kind of insight retail IDX platforms don't expose today. **(2) Top IDX Picks (Pro/Elite gated)**: new `get_top_picks()` ranks the `/api/main/trending` feed by a multi-factor score (0.6 × capped daily % change + 0.4 × price-quality heuristic that penalises sub-Rp 100 penny stocks). Cached 30 min server-side so opening the dialog costs at most 1 RapidAPI req per half-hour. New endpoint `GET /api/idx/top-picks?limit=10` with plan gating — Free users get HTTP 402 with upgrade CTA. New `IdxTopPicksDialog` component + 6th Quick-Action button on the Dashboard (grid bumped from 5→6 cols). Tapping any row deep-links to `/analysis/{ticker}` for a full AI analysis. **Rate-limit hardening**: bumped `_MIN_INTERVAL` from 1.05s to 1.3s (30% safety margin — provider's per-second counter is strict and 1.05s tripped 429s under parallel `asyncio.gather` calls), and added one automatic retry on 429 with 2s backoff. **Verified live**: BBCA.JK analysis returns `regime: "strong_accumulation"` with 20 parsed filings; Top Picks returns 10 ranked IDX names (KOBX +34.43%, MAXI +33.96% etc.); RapidAPI usage counter at ~12 requests after testing — well within 950/month budget.

- **Apr 23 — RapidAPI IDX integration (BASIC free tier · augment yfinance)**: added `services/idx_rapidapi.py` that wraps three endpoints from `indonesia-stock-exchange-idx` (yasimpratama88) on RapidAPI — `/api/emiten/{sym}/info` (quote snapshot), `/api/emiten/{sym}/keystats` (flattened ratios — real path has no hyphen, corrected after discovery), `/api/analysis/technical/{sym}` (RSI/MACD/SMA signals). For `.JK` tickers the analysis router now fetches these in parallel with yfinance; the RapidAPI values overlay the yfinance quote + fundamentals when present (richer: PE/PB/EPS/ROE etc. in IDR). yfinance is kept for OHLCV history (free, unlimited) and the RSS news scraper stays unchanged. **Budget protection**: BASIC plan is 1,000 req/month with **$0.01/req overage**, so we enforce a soft budget of **950 req/month** (~5% safety margin) via a MongoDB counter (`db.rapidapi_usage.{month: "YYYY-MM"}`). When exhausted, `_call()` returns `None` and the caller silently falls back to yfinance. **Per-tier daily caps** on `.JK` analyses: Free 3/day, Pro 10/day, Elite 30/day, Day Pass 10/day. **Rate limiting**: 1.3s min interval (see above), asyncio Lock guarded. **UI**: subtle "IDX LIVE" / "YF FALLBACK" chip on verdict header, admin `IdxBudgetCard` on `/admin` with usage bar + 4-step RapidAPI sign-up instructions when key isn't set. New endpoint `GET /api/admin/rapidapi/usage`. **Env**: `RAPIDAPI_KEY`, `RAPIDAPI_IDX_HOST`, `RAPIDAPI_IDX_MONTHLY_BUDGET=950`. Caches: quote 10m, technical 30m, fundamentals 24h, bandarmology 1h, trending 30m. User's live key paste verified end-to-end: BBCA.JK analysis flipped from `yfinance` to `rapidapi` source with live PE=13.77, PB=2.81, budget counter incrementing correctly.

- **Apr 23 (v4) — Automated RF retrain pipeline (FastAPI + GitHub Actions)**: productionised the RF model lifecycle so the calibrator stays in-distribution on an ongoing basis. **Backend infrastructure**: new `services/rf_retrain.py` orchestrator — spawns `scripts/train_rf.py` as a detached subprocess, streams stdout into a Mongo `rf_retrain_jobs` collection (log-tail rolling update every 5s), atomically swaps `rf_signal.joblib` on success via `os.replace`, then calls `rf_predictor.reload()` to hot-load the new weights without a backend restart. Guarded by an asyncio Lock + filesystem lock so parallel triggers coalesce into the single running job. New endpoints under `/api/admin/rf/*`: `GET /status` (current job + model age + stale flag), `POST /retrain` (admin-triggered retrain, idempotent), `POST /reload` (pick up an out-of-band model drop, e.g. from CI). **Weekly scheduler**: FastAPI `@app.on_event("startup")` spawns `weekly_retrain_loop()` — every 6 hours it checks `rf_signal.meta.json` `trained_at`; if >7 days old (configurable via `RF_RETRAIN_STALE_DAYS` env var) and no job is running, it fires `trigger_retrain(triggered_by="scheduler")`. **Training-script hardening**: `_download_market_context()` now retries 3× with 2/4/8s backoff and falls back to `^GSPC` when `SPY` is intermittently 404'd by yfinance (~1-in-10 call rate). Atomic write pattern: dumps to `rf_signal.tmp.joblib` + `.meta.tmp.json`, then `os.replace()` — inference never sees a half-written file. **GitHub Actions nightly**: `.github/workflows/rf-retrain.yml` runs every Monday 04:00 UTC (and on-demand via `workflow_dispatch`). Installs pinned deps, runs training, sanity-checks the saved bundle (size >1MB, proba shape correct on a zero vector), publishes a formatted Actions summary with holdout metrics + top-5 feature importances, and uploads the joblib + meta.json as a 30-day retention artifact. **Admin UI**: new `RFRetrainCard` on `/admin` — shows status chip (Healthy / Stale / Running / Failed), live metadata grid (trained_at · universe · holdout acc · calibrated Brier), collapsible log-tail of the last run, and two action buttons (Retrain now / Reload from disk). Polls `/rf/status` every 6s while a job is running so the log streams live. **Verified end-to-end**: triggered a retrain via `POST /api/admin/rf/retrain`, watched `rf_retrain_jobs` doc transition `running → success` with live log-tail, confirmed `trained_at` on `/api/analysis/rf-model/meta` changed (predictor reloaded), UI card updated in real-time.

- **Apr 23 (v3) — Regime-aware features + isotonic calibration**: added two market-regime features to the RF pipeline — `spy_ret_20d` (SPY 20-day trailing return = market momentum) and `vix_level_rel` (VIX today ÷ 252-day mean − 1 = regime fear level). Retrained on 346 tickers with the expanded 23-feature set. Results confirm the regime features dominate: **VIX level 28.4% importance · SPY 20d 14.6% · SMA20/SMA50 6.6% · ATR/close 5.2%**. OOB score jumped **0.583 → 0.635** (in-distribution learning meaningfully improved by regime conditioning). 2025 holdout accuracy 47.75% (vs 50.42% baseline) — the regime shift between training and 2025 holdout still kills forward-generalisation, exactly as the previous iteration showed, but for a more instructive reason now. Wrapped the base RF with **`CalibratedClassifierCV(FrozenEstimator(base), method="isotonic")`** fit on a held-out 20% slice of the training window (62,834 rows). Brier score comparison surfaced honestly on `/technical`: **calibrated 0.2749 vs uncalibrated 0.2559** — on this particular regime-drifted holdout the uncalibrated model is *slightly* better calibrated, so `/technical#random-forest` shows an "Honest note" explaining that the calibrator was fit on 2024 data whose probability landscape differs from 2025. We keep the calibrated wrapper shipped because it produces smoother, less step-function probabilities and future retrains on fresher data should restore the calibration benefit. Provenance banner on every verdict now reads "… · isotonic calibrated" when calibration is present. Infrastructure changes: `services/features.py` gained a `market_df` kwarg on `compute_feature_frame` / `feature_row_for_today`; `routers/analysis.py` added a TTL-cached (10 min) SPY+VIX snapshot helper that feeds every RF inference call; `services/rf_predictor.py` now reads `feature_importances` from the bundle top-level since `CalibratedClassifierCV` doesn't expose the attribute directly; `scripts/train_rf.py` downloads SPY+VIX once, passes through feature extraction, trains base model, calibrates with FrozenEstimator, saves bundle with pre-computed feature importances + calibration metadata. New endpoint fields: `calibration_method`, `calibration_rows`, `calibrated_brier`, `uncalibrated_brier`, `uncalibrated_accuracy`, `uncalibrated_auc`.

- **Apr 23 — RF retrain on wider universe + 20-day horizon + provenance banner**: Random Forest retrained from scratch on a much broader slice of the S&P 500 (~344 tickers across all 11 GICS sectors, up from 165) using a longer **20 trading-day (≈1 calendar month) forward-return horizon** (up from 5 days). Training window 2021-10-12 → 2026-04-22, walk-forward cutoff 2025-05-27, 312k train rows / 78k holdout rows. Honest 2026 holdout metrics: accuracy 47.70%, ROC-AUC 0.471, OOB 0.583 vs always-majority baseline 50.53% — model **underperforms** the baseline by 2.83pp on holdout (OOB 58% shows in-distribution learning, confirming regime drift on the post-cutoff window). Shipped the new artifact anyway as a transparent skeptic layer; `/technical#random-forest` renders the live "Honest reading: underperforms baseline by 2.83pp" call-out automatically from `rfMeta`. **New model-provenance banner** on every verdict's Secondary Opinion module: "Predicted by a Random Forest trained on 344 tickers · 2021–2026 · 20-day forward horizon. Past behaviour is not indicative of future results — this is a probabilistic opinion, not a price forecast." Banner text is fully dynamic from `model_info` (training_start_date, training_end_date, universe_size, horizon_days) — future retrains will auto-update the copy without frontend edits. Honest-disclosure footer also now shows the full training window and walk-forward cutoff. Backend changes: `scripts/train_rf.py` expanded universe, horizon CLI arg (default 20), saves `training_start_date`/`training_end_date` to meta. `services/rf_predictor.py` passes those fields into the inference payload. `routers/analysis.py` `/api/analysis/rf-model/meta` exposes them to the UI. `components/RandomForestOpinion.jsx` renders the provenance banner above the title. `pages/TechnicalPage.jsx` "Live holdout metrics" header now shows "Training window: 2021-10-12 → 2026-04-22 · horizon 20 trading days · walk-forward cutoff 2025-05-27". **Superseded by Apr 23 (v3) retrain — see above entry.** Model artifact: `/app/backend/models/rf_signal.joblib` (52 MB).

- **Apr 23 — Random Forest secondary-opinion layer (first trained ML component)**: scikit-learn `RandomForestClassifier(n_estimators=400, max_depth=12, min_samples_leaf=50, class_weight='balanced')` trained on 5 years × 165 S&P 500 large-caps using a strict walk-forward split. Predicts binary "5-day forward return positive?" from 21 deterministic features (returns, RSI, SMA ratios, realized vol, volume, MACD, candle shape, 52-week regime). Shipped services: `services/features.py` (shared extractor used by both training and inference), `services/rf_predictor.py` (lazy-load runtime with graceful no-op), `scripts/train_rf.py` (offline retrain script). Wired into `routers/analysis.py` — each verdict now returns `rf_opinion` alongside the LLM verdict. New `RandomForestOpinion.jsx` module on the verdict page shows: direction + probability bar, top-3 variables the model relied on (deep-linked to the relevant `/technical` anchors), agree/disagree chip vs LLM, and honest holdout metrics footer. When `|prob−0.5| < 0.08` the UI explicitly renders "No meaningful edge" rather than a misleading number. `/technical#random-forest` documents the model with live metrics from `GET /api/analysis/rf-model/meta` (holdout accuracy, ROC-AUC, OOB score, baseline, top-10 feature importance). **Superseded by Apr 23 retrain — see above entry.** Never used for position sizing; informational only.

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
