/**
 * pollAnalysisJob — mobile-resilient wrapper around the
 * POST /analysis/{ticker}/start → GET /analysis/jobs/{id} pipeline.
 *
 * Why this exists:
 *   Mobile Chrome / Safari throttle JS timers when a tab is backgrounded
 *   (screen lock, app switch). The naive `Date.now() - started < N_MS`
 *   polling loop wakes up AFTER the client wall-clock budget has already
 *   elapsed, concludes the job timed out, and throws — EVEN WHEN the
 *   backend actually finished successfully. Result: "Analysis exceeded
 *   timeout" on every re-analyse from mobile.
 *
 * Fix strategy (belt-and-braces):
 *   1. Track VISIBLE elapsed time only (`accumulatedVisible`) — time while
 *      the tab was hidden doesn't count against our budget.
 *   2. On `visibilitychange` → visible, immediately poll once to sync.
 *   3. Budget is kept slightly above the backend cap so we always reach
 *      the `failed`/`done` terminal state before giving up.
 *   4. If we do exhaust the budget, try `/analysis/{ticker}/latest` and
 *      ONLY accept it when `created_at` is strictly newer than the job
 *      start timestamp (i.e. the re-analyse completed while we were
 *      backgrounded).
 *
 * The caller passes:
 *   - `api`         : axios-style instance with .get / .post
 *   - `ticker`      : string
 *   - `mode`        : "standard" | "candlestick" | "hybrid"
 *   - `onProgress`  : optional callback(progress) to drive the stepper UI
 *   - `budgetMs`    : default 260_000 (= 260s, ~8% over backend 240s cap)
 *
 * Returns the final analysis result dict. Throws on hard failure.
 */

const DEFAULT_BUDGET_MS = 260_000;        // 260s — 20s over backend 240s
const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_ERRORS = 5;

export async function pollAnalysisJob({
    api,
    ticker,
    mode = "standard",
    onProgress,
    budgetMs = DEFAULT_BUDGET_MS,
}) {
    // Start the job first so we have a reference timestamp for freshness check
    const startedIsoWall = new Date().toISOString();
    const start = await api.post(`/analysis/${ticker}/start?mode=${mode}`);
    const jobId = start.data.job_id;

    // Visibility-aware accumulator: only counts seconds while tab is visible.
    let accumulatedVisibleMs = 0;
    let lastVisibleAt = document.visibilityState === "visible" ? Date.now() : null;

    const onVisibility = () => {
        const now = Date.now();
        if (document.visibilityState === "visible") {
            lastVisibleAt = now;
        } else if (lastVisibleAt != null) {
            accumulatedVisibleMs += now - lastVisibleAt;
            lastVisibleAt = null;
        }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const getElapsedMs = () => {
        if (lastVisibleAt == null) return accumulatedVisibleMs;
        return accumulatedVisibleMs + (Date.now() - lastVisibleAt);
    };

    let finalResult = null;
    let consecutiveErrors = 0;

    try {
        while (getElapsedMs() < budgetMs) {
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            let j;
            try {
                const poll = await api.get(`/analysis/jobs/${jobId}`);
                j = poll.data;
                consecutiveErrors = 0;
            } catch (pollErr) {
                const status = pollErr?.response?.status;
                if (status === 401 || status === 403 || status === 404) throw pollErr;
                consecutiveErrors += 1;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw pollErr;
                continue;
            }
            if (j.progress && onProgress) onProgress(j.progress);
            if (j.status === "done") {
                finalResult = j.result;
                break;
            }
            if (j.status === "failed") {
                throw new Error(j.error || "Analysis failed. Please try again.");
            }
        }

        // Mobile-resilience fallback: if we exhausted the visible budget,
        // the backend may have finished while we were backgrounded. Accept
        // `/latest` ONLY if it's strictly newer than our start timestamp —
        // otherwise we'd silently return stale pre-re-analyse data.
        if (!finalResult) {
            try {
                const latest = await api.get(`/analysis/${ticker}/latest`);
                const latestCreated = latest?.data?.created_at;
                const isFresh = latestCreated && new Date(latestCreated) >= new Date(startedIsoWall);
                if (latest?.data?.recommendation && isFresh) {
                    finalResult = latest.data;
                }
            } catch {
                /* fall through */
            }
        }

        if (!finalResult) {
            throw new Error(
                "Analysis is taking longer than expected. Please try again — " +
                    "if this persists, the AI upstream may be busy (check the " +
                    "Admin LLM health panel)."
            );
        }
        return finalResult;
    } finally {
        document.removeEventListener("visibilitychange", onVisibility);
    }
}

/**
 * formatAnalysisTimestamp — surface absolute date+time alongside relative
 * time so users can tell at a glance when the current view was generated
 * (and whether the most recent re-analyse actually landed).
 *
 * Example output: "Feb 28, 2026 · 7:03 AM · 12m ago"
 */
export function formatAnalysisTimestamp(iso, opts = {}) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const datePart = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
    const timePart = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
    const diffSec = (Date.now() - d.getTime()) / 1000;
    let rel;
    if (diffSec < 60) rel = "just now";
    else if (diffSec < 3600) rel = `${Math.floor(diffSec / 60)}m ago`;
    else if (diffSec < 86400) rel = `${Math.floor(diffSec / 3600)}h ago`;
    else rel = `${Math.floor(diffSec / 86400)}d ago`;

    return opts.noRelative ? `${datePart} · ${timePart}` : `${datePart} · ${timePart} · ${rel}`;
}
