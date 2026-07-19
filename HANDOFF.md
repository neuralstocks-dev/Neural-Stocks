# Handoff: Scheduled Screener Agents Feature

Context transferred from a claude.ai planning session (2026-07-19). This document
is the full brief — read it before writing any code, and confirm you understand
the plan before starting.

## What's being built

A menu in Neural Stocks where a user can configure an "agent" that:
1. Runs automatically on a schedule (e.g. weekdays 9am) — no manual trigger needed
2. Screens stocks against a specific, confirmed set of criteria (below)
3. Sends the result to Telegram (existing bot infra)
4. ALSO shows the result in-app on a dedicated page — Telegram is not the only
   delivery surface. This was an explicit correction from the person: don't ship
   Telegram-only.

## The screening criteria (user's original spec)

Stocks that:
- Hit within 1% of their all-time high within the trailing 2 weeks
- ...on a day when "the market" was down at least 0.5%
- AND have beaten both earnings AND forward guidance expectations in at least
  2 of the prior quarters
- AND have market cap > $10 billion

## The 5 decisions already confirmed by the person — do not re-litigate these

1. **Same-day divergence, not window-based.** The near-ATH condition and the
   market-down condition must occur on the SAME trading day. This is what makes
   it a genuine relative-strength signal (stock holding up while the market falls
   that specific day), not two unrelated events in a loose 2-week window.

2. **SPY is the market benchmark.** Not `^GSPC`, not QQQ. Use SPY's daily
   close-to-close return to determine "market down ≥0.5%" days.

3. **Guidance-beat proxy: post-earnings analyst estimate revision direction,
   NOT EPS-beat-only.** The person was explicit: dropping the guidance
   requirement is not an acceptable simplification — it silently deletes half
   of what was asked for. The approach:
   - "Beat earnings" = actual EPS > consensus EPS estimate (Finnhub earnings
     surprise data)
   - "Beat guidance" (proxy) = did sell-side analysts raise their NEXT-QUARTER
     EPS estimate in the days following the print? If yes, treat as a guidance
     beat for that quarter. This uses Finnhub's estimates history.
   - Need ≥2 of the last 4 reported quarters satisfying BOTH conditions.

4. **Universe: S&P 500 + Russell 1000, refreshed monthly.** Not a full-market
   scan — the $10B mcap floor already excludes almost everything outside this
   set, and scanning the full market daily risks rate-limit/timeout problems on
   a feature that needs to reliably finish before 9am. Source this as a static
   ticker list you refresh on a monthly cron, not a live index API call every run.

5. **Feature gating: Pro/Elite tier only, capped at 1 active scheduled agent
   per user (initially).** Reasoning explicitly given: a scheduled agent runs
   every day forever regardless of whether the user ever looks at the result —
   unbounded recurring cost, invisible to the user because they didn't "do"
   anything that day. This is a cost-control necessity, not just a
   monetization choice. The cap can be raised later once there's real
   cost-per-agent-per-day data; start conservative.

## File-by-file plan

### New: `backend/services/relative_strength_screener.py`
- `run_screen() -> list[dict]`
- Pulls the static S&P 500 + Russell 1000 ticker list
- Per ticker:
  - Full price history (yfinance `period="max"`) → compute true ATH
  - Check: any daily CLOSE in trailing 10 trading days within 1% of ATH, on a
    day SPY closed down ≥0.5% that same day
  - Fetch Finnhub earnings-surprise history (last 4 quarters) — apply the
    ≥2-quarter beat+guidance-proxy test from decision #3
  - Apply mcap > $10B filter
- Returns: `{ticker, ath_price, pct_from_ath, divergence_date, quarters_beat, mcap}`
  for every ticker that passes ALL criteria

### New: `backend/services/scheduled_agents.py`
- `scheduled_agent_loop()` — background loop, same pattern as every other
  scheduler already in `server.py` (see "Codebase conventions" below).
  Wakes periodically (every minute is reasonable), checks the
  `scheduled_agents` collection for any agent whose `{days, time, timezone}`
  matches "now" and hasn't already run today, executes it, stores the result,
  pushes to Telegram.

### New Mongo collections
- `scheduled_agents`: `{_id, user_id, agent_type: "relative_strength_screener",
  schedule: {days: ["mon".."fri"], time: "09:00", timezone: "America/New_York"},
  enabled, created_at}`
- `agent_runs`: `{_id, agent_id, user_id, run_at, hits: [...], status}`

### New: `backend/routers/agents.py`
- `POST /api/agents` — create
- `GET /api/agents` — list user's agents
- `PATCH /api/agents/{id}` — edit schedule / enable-disable
- `DELETE /api/agents/{id}`
- `GET /api/agents/{id}/runs` — history, feeds the in-app results page
- `POST /api/agents/{id}/run-now` — manual trigger for testing without
  waiting for the schedule to fire

### New: `frontend/src/pages/AgentsPage.jsx`
The menu the person explicitly asked for:
- "Create agent" flow: screener type dropdown (only this one screener exists
  for now, but design the schema/UI to extend to more screener types later),
  day-of-week picker (Mon–Fri preset + custom), time + timezone picker,
  Telegram delivery toggle (on by default)
- List of existing agents: enable/disable, edit, delete, "run now" button

### New: `frontend/src/pages/AgentRunsPage.jsx`
- Per-agent run history, each run expandable to show the hit list (ticker,
  % from ATH, quarters beat, mcap)
- Same page renders regardless of whether the run was scheduled or manual

### `backend/server.py`
- One addition: `asyncio.create_task(scheduled_agent_loop())`, following the
  exact `_BG_TASKS.add()` + `add_done_callback(_BG_TASKS.discard)` +
  `logger.info(...)` pattern already used for every other background loop in
  this file (`admin_digest_loop`, `verdict_resolution_loop`,
  `digest_pusher_loop`, etc. — read the current state of this file first,
  since several loops were recently disabled/commented out this same session;
  don't reactivate anything that was intentionally gated off).

## Codebase conventions to follow (confirmed this session)

- **Background loop pattern**: every scheduler in `server.py` follows
  `t = asyncio.create_task(loop_fn())` → `_BG_TASKS.add(t)` →
  `t.add_done_callback(_BG_TASKS.discard)` → `logger.info("Started X scheduler")`.
  Match this exactly for consistency and so the existing shutdown/cleanup
  logic covers the new loop too.

- **Telegram delivery**: there is already a working Telegram bot integration
  used for alerts and digests. Reuse it — do not build a second Telegram
  client. Find the existing send function (likely in a `telegram.py` service
  or similar) before writing new send logic.

- **LLM provider is OpenRouter exclusively.** The old "Emergent" platform is
  fully retired — do not reference it, do not build anything assuming its
  billing model. If this feature ever needs an LLM call (e.g. to summarize
  screen results in natural language for the Telegram message), use the
  existing `services/llm_providers.py` `call_llm()` function.

- **RF (Random Forest) is permanently retired.** `rf_predictor.is_available()`
  returns `False` unconditionally. Do not build any code path that depends on
  RF being available. Several RF-dependent scheduler loops were disabled this
  session specifically because they kept waking up to no-op — don't repeat
  that pattern for the new agent loop (i.e., make sure `scheduled_agent_loop`
  actually has agents to check, don't leave it running with nothing gating it
  if the feature is ever disabled later).

- **Mode field precedent**: the dashboard was recently updated to show a
  `CANDLE`/`HYBRID` chip on watchlist rows by adding a `mode` field to an
  API response that was silently dropping it. Worth knowing as a general
  lesson for this codebase: check that new fields added to internal dicts/
  aggregations actually make it into the final API response object, not just
  into an intermediate query result.

## Before writing any code

Read these files first to confirm current state and integration points:
- `backend/server.py` — full scheduler wiring, confirm what's currently
  active vs. disabled
- `backend/services/auto_scan.py` — an existing (now-disabled) scheduled
  scan implementation; useful as a structural reference even though it's
  RF-specific and currently gated off
- Whatever file sends Telegram messages today (search for the bot token env
  var or an existing `send_telegram_message`-style function)
- `backend/services/yfinance_svc.py` and `backend/services/finnhub_svc.py`
  (or equivalent) — confirm exact function signatures for price history and
  earnings-surprise data before writing the screener against assumed APIs

## Branch

This work should happen on `feature/relative-strength-screener`, not
directly on `main` — every push to `main` auto-deploys to Railway/Cloudflare
Pages, and this is a multi-file, multi-service feature that shouldn't ship
incrementally to production mid-build.
