import React, { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

// Colored label palette for each failure-reason bucket. Keep in sync
// with `services/llm_circuit_breaker.py` REASON_* constants.
const REASON_STYLE = {
    llm_socket_hang: { label: "Socket hang", color: "hsl(var(--sell))" },
    litellm_retry_exhausted: { label: "Retry exhausted", color: "hsl(var(--hold))" },
    llm_timeout: { label: "Timeout (cancel)", color: "hsl(var(--gold))" },
    other_exception: { label: "Other exception", color: "hsl(256, 50%, 70%)" },
    unknown: { label: "Unknown", color: "hsl(var(--text-muted))" },
};

const SURFACE_LABEL = { anon: "guest", auth: "auth", quick: "quick-batch" };

/**
 * <AdminLLMHealthPanel /> — compact dashboard card showing current
 * circuit-breaker state + last 24h failure breakdown. Pulls data from
 * two admin-gated endpoints:
 *   GET /api/admin/llm-breaker       → live tripped/cleared state
 *   GET /api/admin/llm-events         → last N failures + reason bucket counts
 *
 * Auto-refreshes every 30 s while mounted so ops can leave this open
 * during an incident and watch the breaker trip/clear in real time.
 * Manual "reset" button calls the admin escape-hatch endpoint.
 */
export default function AdminLLMHealthPanel() {
    const [status, setStatus] = useState(null);
    const [events, setEvents] = useState(null);
    const [recoup, setRecoup] = useState(null);
    const [providers, setProviders] = useState(null);
    const [sources, setSources] = useState(null);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    // Track which row in the "Last 10 failures" table has its detail
    // panel expanded (only one at a time to avoid the table jumping
    // around when you open multiple). null = none expanded.
    const [expandedRow, setExpandedRow] = useState(null);
    // Visual feedback for the "Copy escalation summary" button — flips to
    // "Copied ✓" for 2s after a successful clipboard write.
    const [copyState, setCopyState] = useState("idle");
    // Track whether a manual refresh is in flight so the button can show
    // a spinning icon and disable itself for the duration. Without this,
    // tapping Refresh feels unresponsive — the inline icon doesn't change
    // and the button text doesn't update, so users (correctly) think the
    // click did nothing.
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const [s, e, r, p, srcRes] = await Promise.all([
                api.get("/admin/llm-breaker"),
                api.get("/admin/llm-events?limit=10&hours=24"),
                api.get("/admin/llm-events/recoup-summary?days=30"),
                api.get("/admin/llm-events/by-provider?hours=24"),
                api.get("/admin/source-health?hours=24"),
            ]);
            setStatus(s.data);
            setEvents(e.data);
            setRecoup(r.data);
            setProviders(p.data);
            setSources(srcRes.data);
            setErr("");
        } catch (ex) {
            setErr(ex?.response?.data?.detail || "Failed to load LLM health");
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 30_000);
        return () => clearInterval(id);
    }, [refresh]);

    const resetBreaker = async () => {
        setBusy(true);
        try {
            await api.post("/admin/llm-breaker/reset");
            await refresh();
        } catch (ex) {
            setErr(ex?.response?.data?.detail || "Reset failed");
        } finally {
            setBusy(false);
        }
    };

    if (!status) {
        return (
            <div
                className="mt-5 p-4 text-sm"
                style={{ border: "1px solid hsl(var(--border-divider))", background: "hsl(var(--surface-elevated))" }}
                data-testid="admin-llm-health-loading"
            >
                Loading LLM health…
            </div>
        );
    }

    const tripped = !!status.tripped;
    const StateIcon = tripped ? AlertTriangle : CheckCircle2;
    const stateColor = tripped ? "hsl(var(--sell))" : "hsl(var(--buy))";
    const totalFailures = events?.total || 0;

    return (
        <div
            className="mt-5 p-4"
            style={{
                border: `1px solid ${tripped ? "hsl(var(--sell))" : "hsl(var(--border-divider))"}`,
                background: "hsl(var(--surface-elevated))",
                borderLeft: `3px solid ${stateColor}`,
            }}
            data-testid="admin-llm-health-panel"
        >
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Activity size={13} strokeWidth={1.5} style={{ color: stateColor }} />
                    <span
                        className="text-overline"
                        style={{ color: stateColor, fontSize: "10px" }}
                    >
                        LLM Health — Last 24h
                    </span>
                </div>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="text-xs inline-flex items-center gap-1.5 transition-colors px-2 py-1 -mr-2 rounded hover:bg-[hsl(var(--surface-hover))]"
                    style={{
                        color: refreshing ? "hsl(var(--text-secondary))" : "hsl(var(--text-secondary))",
                        minHeight: 28,
                        cursor: refreshing ? "wait" : "pointer",
                        // High z-index defends against any sibling overlay (e.g.
                        // sticky banners) accidentally swallowing the click.
                        position: "relative",
                        zIndex: 1,
                    }}
                    onMouseEnter={(e) => {
                        if (!refreshing) e.currentTarget.style.color = "hsl(var(--text-primary))";
                    }}
                    onMouseLeave={(e) => {
                        if (!refreshing) e.currentTarget.style.color = "hsl(var(--text-secondary))";
                    }}
                    data-testid="admin-llm-health-refresh"
                    aria-label="Refresh LLM health"
                    aria-busy={refreshing}
                >
                    <RefreshCcw
                        size={11}
                        strokeWidth={1.5}
                        className={refreshing ? "animate-spin" : ""}
                    />{" "}
                    {refreshing ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {/* State row */}
            <div className="mt-3 flex items-baseline gap-3 flex-wrap">
                <StateIcon size={18} strokeWidth={1.5} style={{ color: stateColor }} />
                <span className="font-serif text-lg" style={{ color: stateColor }} data-testid="admin-llm-health-state">
                    {tripped ? "Breaker TRIPPED" : "Healthy"}
                </span>
                <span className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                    consec_fail={status.consec_fail} · consec_ok={status.consec_ok}
                    {tripped && status.seconds_tripped
                        ? ` · tripped for ${Math.round(status.seconds_tripped)}s`
                        : ""}
                </span>
                {tripped && (
                    <button
                        type="button"
                        onClick={resetBreaker}
                        disabled={busy}
                        className="btn-ghost text-xs"
                        style={{ borderColor: "hsl(var(--hold))", minHeight: 28 }}
                        data-testid="admin-llm-health-reset"
                    >
                        {busy ? "…" : "Force reset"}
                    </button>
                )}
            </div>

            {/* Breakdown bar */}
            {totalFailures > 0 ? (
                <div className="mt-4" data-testid="admin-llm-health-breakdown">
                    <p className="font-mono uppercase tracking-wider" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>
                        Failure reason breakdown · {totalFailures} total
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(events.breakdown).map(([reason, count]) => {
                            const s = REASON_STYLE[reason] || REASON_STYLE.unknown;
                            const pct = Math.round((count / totalFailures) * 100);
                            return (
                                <span
                                    key={reason}
                                    className="font-mono text-xs px-2 py-0.5 rounded-sm"
                                    style={{ color: s.color, border: `1px solid ${s.color}`, fontSize: "11px" }}
                                    title={`${count} / ${totalFailures}`}
                                >
                                    {s.label} · {count} ({pct}%)
                                </span>
                            );
                        })}
                    </div>

            {events.events.length > 0 && (
                        <details className="mt-3" data-testid="admin-llm-health-details">
                            <summary
                                className="cursor-pointer text-xs"
                                style={{ color: "hsl(var(--text-secondary))" }}
                            >
                                Last 10 failures ({events.events.length} shown)
                            </summary>
                            <table className="mt-2 w-full font-mono text-xs" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ color: "hsl(var(--text-muted))" }}>
                                        <th className="text-left py-1" style={{ fontSize: "10px" }}>Ticker</th>
                                        <th className="text-left py-1" style={{ fontSize: "10px" }}>Reason</th>
                                        <th className="text-left py-1" style={{ fontSize: "10px" }}>Surface</th>
                                        <th className="text-right py-1" style={{ fontSize: "10px" }}>Elapsed</th>
                                        <th className="text-right py-1" style={{ fontSize: "10px" }}>When</th>
                                        <th className="text-right py-1" style={{ fontSize: "10px" }}>Detail</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.events.map((ev, i) => {
                                        const s = REASON_STYLE[ev.reason] || REASON_STYLE.unknown;
                                        const whenSec = Math.round((Date.now() / 1000) - ev.ts);
                                        const whenLabel = whenSec < 60 ? `${whenSec}s ago` : whenSec < 3600 ? `${Math.round(whenSec / 60)}m ago` : `${Math.round(whenSec / 3600)}h ago`;
                                        const hasDetail = !!ev.error_detail;
                                        return (
                                            <React.Fragment key={i}>
                                            <tr style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                                                <td className="py-1" style={{ color: "hsl(var(--text-primary))" }}>{ev.ticker || "—"}</td>
                                                <td className="py-1" style={{ color: s.color }}>{s.label}</td>
                                                <td className="py-1" style={{ color: "hsl(var(--text-secondary))" }}>{SURFACE_LABEL[ev.surface] || ev.surface || "—"}</td>
                                                <td className="py-1 text-right" style={{ color: "hsl(var(--text-secondary))" }}>{typeof ev.elapsed_s === "number" ? `${ev.elapsed_s.toFixed(1)}s` : "—"}</td>
                                                <td className="py-1 text-right" style={{ color: "hsl(var(--text-muted))" }}>{whenLabel}</td>
                                                <td className="py-1 text-right">
                                                    {hasDetail ? (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpandedRow((cur) => (cur === i ? null : i))
                                                            }
                                                            className="text-[10px] underline"
                                                            style={{
                                                                color: "hsl(var(--text-secondary))",
                                                                cursor: "pointer",
                                                            }}
                                                            data-testid={`admin-llm-event-detail-toggle-${i}`}
                                                            aria-expanded={expandedRow === i}
                                                        >
                                                            {expandedRow === i ? "hide" : "show"}
                                                        </button>
                                                    ) : (
                                                        <span style={{ color: "hsl(var(--text-muted))", fontSize: "10px" }}>—</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {hasDetail && expandedRow === i && (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: 0 }}>
                                                        <pre
                                                            data-testid={`admin-llm-event-detail-${i}`}
                                                            style={{
                                                                background: "hsl(var(--surface-elevated))",
                                                                border: "1px solid hsl(var(--border-divider))",
                                                                color: "hsl(var(--text-secondary))",
                                                                fontSize: "10.5px",
                                                                lineHeight: 1.45,
                                                                padding: "10px 12px",
                                                                margin: "4px 0 6px 0",
                                                                whiteSpace: "pre-wrap",
                                                                wordBreak: "break-word",
                                                                maxHeight: 220,
                                                                overflow: "auto",
                                                                borderRadius: 2,
                                                            }}
                                                        >
                                                            {ev.error_detail}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </details>
                    )}
                </div>
            ) : (
                <p className="mt-3 text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                    No LLM failures in the last 24 hours — Claude is steady.
                </p>
            )}

            {/* Per-provider success-rate strip · last 24h. Drives operational
                triage: at-a-glance see which provider in the fallback chain
                is currently degraded. Renders as one row per provider with
                a chip-style success-rate readout colour-coded by health. */}
            {providers && providers.providers && providers.providers.length > 0 && (
                <ProviderHealthStrip data={providers} />
            )}

            {/* Upstream-data-source health strip · last 24h. Same chip
                pattern as the LLM provider strip — different signal,
                same UX. Captures yfinance, Finnhub, RapidAPI IDX, IDX
                news RSS health. Hidden until at least one source has
                been called in the window so the panel doesn't show an
                empty placeholder before any analysis has run. */}
            {sources && sources.sources && sources.sources.length > 0 && (
                <SourceHealthStrip data={sources} />
            )}

            {/* Credit-recoup tracker · last 30 days. Quantifies the cost of
                upstream Universal-Key socket hangs and offers a one-tap
                "Copy escalation summary" that drops a ready-to-paste support
                email body into the clipboard. The whole point: turn every
                future complaint to support@emergent.sh from a screenshot
                hunt into a 30-second task with verifiable per-failure detail. */}
            {recoup && recoup.total_failures > 0 && (
                <RecoupTracker
                    recoup={recoup}
                    onCopy={async () => {
                        try {
                            const body = buildEscalationEmail(recoup);
                            await navigator.clipboard.writeText(body);
                            setCopyState("copied");
                            setTimeout(() => setCopyState("idle"), 2000);
                        } catch {
                            setCopyState("error");
                            setTimeout(() => setCopyState("idle"), 2500);
                        }
                    }}
                    copyState={copyState}
                />
            )}

            {err && (
                <p className="mt-2 text-xs" style={{ color: "hsl(var(--sell))" }}>
                    {err}
                </p>
            )}
        </div>
    );
}

// ---------- Recoup tracker sub-component & email builder ----------

/**
 * Renders the 30-day credit-recoup summary inside the LLM Health panel.
 * Pure-presentational — receives the API payload + a copy callback from
 * the parent so clipboard logic stays in one place.
 */
function RecoupTracker({ recoup, onCopy, copyState }) {
    const reasons = Object.entries(recoup.by_reason || {}).sort((a, b) => b[1] - a[1]);
    const tickers = recoup.by_ticker || [];
    return (
        <div
            className="mt-5 p-4"
            data-testid="admin-llm-health-recoup"
            style={{
                border: "1px solid hsl(var(--sell))",
                borderLeftWidth: 4,
                background: "hsla(0,55%,55%,0.04)",
                borderRadius: 2,
            }}
        >
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-overline" style={{ color: "hsl(var(--sell))", fontSize: "10px" }}>
                    Credit-recoup tracker · last {recoup.window_days}d
                </p>
                <button
                    type="button"
                    onClick={onCopy}
                    disabled={copyState === "copied"}
                    className="text-xs inline-flex items-center gap-1.5 px-3 py-1 rounded transition-colors"
                    style={{
                        cursor: copyState === "copied" ? "default" : "pointer",
                        border: "1px solid hsl(var(--sell))",
                        color:
                            copyState === "copied"
                                ? "hsl(var(--buy))"
                                : copyState === "error"
                                ? "hsl(var(--gold))"
                                : "hsl(var(--sell))",
                        position: "relative",
                        zIndex: 1,
                    }}
                    data-testid="admin-llm-health-copy-escalation"
                    aria-label="Copy escalation summary"
                >
                    {copyState === "copied" ? "✓ Copied — paste into email" :
                     copyState === "error"  ? "Copy failed (clipboard blocked)" :
                                              "Copy escalation summary"}
                </button>
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric
                    label="Failures"
                    value={recoup.total_failures}
                    valueColor="hsl(var(--sell))"
                />
                <Metric
                    label="Est. credits wasted"
                    value={`${recoup.estimated_credits_wasted.toFixed(3)} cr`}
                    valueColor="hsl(var(--sell))"
                />
                <Metric
                    label="≈ USD"
                    value={`$${recoup.estimated_usd_wasted.toFixed(4)}`}
                    valueColor="hsl(var(--text-muted))"
                />
                <Metric
                    label="Per-verdict cost"
                    value={`${recoup.credit_per_verdict_assumption.toFixed(3)} cr`}
                    valueColor="hsl(var(--text-muted))"
                />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <p className="font-mono uppercase tracking-wider mb-1.5" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>
                        By reason
                    </p>
                    <ul className="space-y-1">
                        {reasons.map(([reason, count]) => {
                            const s = REASON_STYLE[reason] || REASON_STYLE.unknown;
                            return (
                                <li key={reason} className="flex items-center justify-between gap-3">
                                    <span className="text-xs" style={{ color: s.color }}>{s.label}</span>
                                    <span className="font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>{count}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <div>
                    <p className="font-mono uppercase tracking-wider mb-1.5" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>
                        By ticker (top {Math.min(tickers.length, 8)})
                    </p>
                    <ul className="space-y-1">
                        {tickers.slice(0, 8).map((row) => (
                            <li key={row.ticker} className="flex items-center justify-between gap-3">
                                <span className="font-mono text-xs" style={{ color: "hsl(var(--text-primary))" }}>{row.ticker}</span>
                                <span className="font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>{row.count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <p className="mt-4 text-[10.5px] leading-relaxed" style={{ color: "hsl(var(--text-muted))" }}>
                Click <strong>Copy escalation summary</strong> → paste straight into an email to{" "}
                <code style={{ color: "hsl(var(--text-secondary))" }}>support@emergent.sh</code>. Body contains:
                aggregate counts · per-reason breakdown · per-ticker breakdown · last 8 raw failure rows
                with full error_detail (proof the failures are upstream of your application code).
            </p>
        </div>
    );
}

function Metric({ label, value, valueColor }) {
    return (
        <div>
            <p className="font-mono uppercase tracking-wider" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>
                {label}
            </p>
            <p className="font-mono mt-0.5" style={{ fontSize: "16px", color: valueColor }}>
                {value}
            </p>
        </div>
    );
}

/**
 * Per-provider success-rate strip · last 24h. Renders one row per provider
 * with success/failure totals + a chip-style success-rate readout. Colour
 * is health-driven (green ≥85% / amber 50-84% / red <50%) so degraded
 * providers jump out at a glance — no need to read the raw event log.
 *
 * Reads `data.providers` (already pre-aggregated by the backend).
 */
function ProviderHealthStrip({ data }) {
    if (!data || !data.providers) return null;
    const providerLabel = {
        anthropic: "Anthropic",
        gemini: "Gemini",
        openai: "OpenAI",
    };
    function rateColor(rate, total) {
        if (total === 0) return "hsl(var(--text-muted))";
        if (rate >= 85) return "hsl(var(--buy))";
        if (rate >= 50) return "hsl(var(--hold))";
        return "hsl(var(--sell))";
    }
    return (
        <div
            className="mt-4 p-3"
            data-testid="admin-llm-health-provider-strip"
            style={{
                border: "1px solid hsl(var(--border-default))",
                background: "hsl(var(--surface-elevated))",
                borderRadius: 2,
            }}
        >
            <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "10px" }}>
                    Provider success-rate · last {data.window_hours}h · fallback chain
                </p>
                <p className="font-mono" style={{ fontSize: "10.5px", color: "hsl(var(--text-secondary))" }}>
                    {data.total_attempts} attempts · overall <span style={{ color: rateColor(data.overall_success_rate, data.total_attempts) }}>{data.overall_success_rate}%</span>
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {data.providers.map((p) => {
                    const color = rateColor(p.success_rate, p.total);
                    return (
                        <div
                            key={p.provider}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                            data-testid={`admin-llm-provider-${p.provider}`}
                            style={{
                                border: `1px solid ${color}`,
                                borderLeftWidth: 3,
                                background: "hsl(var(--surface-base))",
                                borderRadius: 2,
                            }}
                        >
                            <div className="min-w-0">
                                <p className="font-mono" style={{ fontSize: "12px", color: "hsl(var(--text-primary))" }}>
                                    {providerLabel[p.provider] || p.provider}
                                </p>
                                <p className="font-mono mt-0.5" style={{ fontSize: "9.5px", color: "hsl(var(--text-muted))" }}>
                                    {p.success}✓ / {p.failure}✗ · {p.total} attempts
                                </p>
                            </div>
                            <p
                                className="font-mono"
                                style={{ fontSize: "20px", color, fontWeight: 500 }}
                                aria-label={`${providerLabel[p.provider] || p.provider} success rate ${p.success_rate}%`}
                            >
                                {p.success_rate}%
                            </p>
                        </div>
                    );
                })}
            </div>
            <p className="mt-2 text-[10.5px]" style={{ color: "hsl(var(--text-muted))" }}>
                Order = fallback-chain priority. Green ≥85% · amber 50-84% · red &lt;50%.
                When the top provider drops below 50%, expect rotations to the next provider.
            </p>
        </div>
    );
}

/**
 * Per-data-source success-rate strip · last 24h. Mirrors the LLM provider
 * strip but for upstream data vendors (yfinance, Finnhub, RapidAPI IDX,
 * IDX news RSS). Each chip surfaces successes / empties / failures so the
 * admin can spot a degraded vendor at a glance. "Empty" responses (vendor
 * replied healthy but had no data for that ticker) are rendered separately
 * from outright failures and do NOT count against the success rate.
 */
function SourceHealthStrip({ data }) {
    if (!data || !data.sources) return null;
    function rateColor(rate, denom) {
        if (denom === 0) return "hsl(var(--text-muted))";
        if (rate >= 85) return "hsl(var(--buy))";
        if (rate >= 50) return "hsl(var(--hold))";
        return "hsl(var(--sell))";
    }
    return (
        <div
            className="mt-4 p-3"
            data-testid="admin-source-health-strip"
            style={{
                border: "1px solid hsl(var(--border-default))",
                background: "hsl(var(--surface-elevated))",
                borderRadius: 2,
            }}
        >
            <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "10px" }}>
                    Upstream data sources · last {data.window_hours}h
                </p>
                <p className="font-mono" style={{ fontSize: "10.5px", color: "hsl(var(--text-secondary))" }}>
                    {data.total_calls} calls · overall <span style={{ color: rateColor(data.overall_success_rate, data.total_calls) }}>{data.overall_success_rate}%</span>
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.sources.map((s) => {
                    const denom = s.success + s.failure;
                    const color = rateColor(s.success_rate, denom);
                    return (
                        <div
                            key={s.source}
                            className="flex items-center justify-between gap-3 px-3 py-2"
                            data-testid={`admin-source-${s.source.replace(/\./g, "-")}`}
                            style={{
                                border: `1px solid ${color}`,
                                borderLeftWidth: 3,
                                background: "hsl(var(--surface-base))",
                                borderRadius: 2,
                            }}
                        >
                            <div className="min-w-0">
                                <p className="font-mono" style={{ fontSize: "11.5px", color: "hsl(var(--text-primary))" }}>
                                    {s.source}
                                </p>
                                <p className="font-mono mt-0.5" style={{ fontSize: "9.5px", color: "hsl(var(--text-muted))" }}>
                                    {s.success}✓ / {s.failure}✗{s.empty ? ` / ${s.empty}∅` : ""} · {s.total} calls
                                </p>
                            </div>
                            <p
                                className="font-mono"
                                style={{ fontSize: "18px", color, fontWeight: 500 }}
                                aria-label={`${s.source} success rate ${s.success_rate}%`}
                            >
                                {s.success_rate}%
                            </p>
                        </div>
                    );
                })}
            </div>
            <p className="mt-2 text-[10.5px]" style={{ color: "hsl(var(--text-muted))" }}>
                Success-rate ignores ∅ "empty" responses (vendor healthy, no data for that ticker).
                Green ≥85% · amber 50-84% · red &lt;50%.
            </p>
        </div>
    );
}

/**
 * Compose a ready-to-paste support email body summarising the recoup
 * data. Keep formatting plain-text + markdown-light so it reads well
 * inside Gmail/Outlook even without rendering.
 *
 * NOTE: this is a *template* — the user will still need to add their
 * Job ID (one-tap from the Emergent chat ℹ️ button) and edit any
 * personalised context before sending. We put a clear "FILL IN" marker
 * at the top so they can't miss it.
 */
export function buildEscalationEmail(r) {
    const lines = [];
    lines.push("Subject: Credit recoup — Universal Key socket hangs (Neural Stock Intelligence™)");
    lines.push("");
    lines.push("Hi Emergent Support,");
    lines.push("");
    lines.push("My Universal LLM Key (Claude Sonnet 4.5) has been intermittently socket-hanging");
    lines.push("at the upstream proxy layer. My application correctly applies a 240s timeout +");
    lines.push("tenacity retries; the failures classify as `llm_socket_hang` with elapsed_s ≈ budget,");
    lines.push("indicating the issue is upstream of my code (Universal-Key proxy / Anthropic).");
    lines.push("");
    lines.push("[FILL IN]");
    lines.push("- My Emergent Job ID: <click ℹ️ in chat top-right and paste it here>");
    lines.push("- App URL: <your *.preview.emergentagent.com or production URL>");
    lines.push("");
    lines.push(`=== Failure summary · last ${r.window_days} days ===`);
    lines.push(`Total failures:                ${r.total_failures}`);
    lines.push(`Estimated credits wasted:      ${r.estimated_credits_wasted.toFixed(3)} cr (≈ $${r.estimated_usd_wasted.toFixed(4)})`);
    lines.push(`Per-verdict cost assumption:   ${r.credit_per_verdict_assumption} cr`);
    if (r.first_failure_ts) lines.push(`First failure (UTC):           ${r.first_failure_ts}`);
    if (r.last_failure_ts)  lines.push(`Last failure (UTC):            ${r.last_failure_ts}`);
    lines.push("");
    lines.push("=== By reason ===");
    Object.entries(r.by_reason || {}).forEach(([reason, count]) => {
        lines.push(`  ${reason.padEnd(28)} ${count}`);
    });
    lines.push("");
    lines.push("=== By ticker (top 15) ===");
    (r.by_ticker || []).forEach((row) => {
        lines.push(`  ${(row.ticker || "—").padEnd(12)} ${row.count}`);
    });
    lines.push("");
    lines.push("=== By surface ===");
    Object.entries(r.by_surface || {}).forEach(([surface, count]) => {
        lines.push(`  ${surface.padEnd(12)} ${count}`);
    });
    lines.push("");
    lines.push("=== Sample raw failure events (last 8) — proof these are upstream ===");
    (r.sample_events || []).forEach((ev, i) => {
        const tsIso = ev.ts ? new Date(ev.ts * 1000).toISOString() : "—";
        lines.push(`--- Event ${i + 1} ---`);
        lines.push(`  ts (UTC):     ${tsIso}`);
        lines.push(`  ticker:       ${ev.ticker || "—"}`);
        lines.push(`  reason:       ${ev.reason || "—"}`);
        lines.push(`  surface:      ${ev.surface || "—"}`);
        lines.push(`  elapsed_s:    ${typeof ev.elapsed_s === "number" ? ev.elapsed_s.toFixed(2) : "—"}`);
        if (ev.error_detail) {
            lines.push(`  error_detail:`);
            ev.error_detail.split("\n").forEach((dl) => lines.push(`    ${dl}`));
        }
        lines.push("");
    });
    lines.push("Could you please:");
    lines.push("  1) Investigate the Universal-Key proxy / Anthropic upstream reliability for these timestamps");
    lines.push("  2) Confirm whether these failed completions were billable, and");
    lines.push("  3) Recoup the wasted credits if they were.");
    lines.push("");
    lines.push("Happy to provide the full LLM-events log dump if helpful.");
    lines.push("");
    lines.push("Thanks,");
    lines.push("");
    return lines.join("\n");
}

