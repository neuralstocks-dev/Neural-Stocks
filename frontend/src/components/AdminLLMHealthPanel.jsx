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
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    // Track whether a manual refresh is in flight so the button can show
    // a spinning icon and disable itself for the duration. Without this,
    // tapping Refresh feels unresponsive — the inline icon doesn't change
    // and the button text doesn't update, so users (correctly) think the
    // click did nothing.
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const [s, e] = await Promise.all([
                api.get("/admin/llm-breaker"),
                api.get("/admin/llm-events?limit=10&hours=24"),
            ]);
            setStatus(s.data);
            setEvents(e.data);
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.events.map((ev, i) => {
                                        const s = REASON_STYLE[ev.reason] || REASON_STYLE.unknown;
                                        const whenSec = Math.round((Date.now() / 1000) - ev.ts);
                                        const whenLabel = whenSec < 60 ? `${whenSec}s ago` : whenSec < 3600 ? `${Math.round(whenSec / 60)}m ago` : `${Math.round(whenSec / 3600)}h ago`;
                                        return (
                                            <tr key={i} style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                                                <td className="py-1" style={{ color: "hsl(var(--text-primary))" }}>{ev.ticker || "—"}</td>
                                                <td className="py-1" style={{ color: s.color }}>{s.label}</td>
                                                <td className="py-1" style={{ color: "hsl(var(--text-secondary))" }}>{SURFACE_LABEL[ev.surface] || ev.surface || "—"}</td>
                                                <td className="py-1 text-right" style={{ color: "hsl(var(--text-secondary))" }}>{typeof ev.elapsed_s === "number" ? `${ev.elapsed_s.toFixed(1)}s` : "—"}</td>
                                                <td className="py-1 text-right" style={{ color: "hsl(var(--text-muted))" }}>{whenLabel}</td>
                                            </tr>
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

            {err && (
                <p className="mt-2 text-xs" style={{ color: "hsl(var(--sell))" }}>
                    {err}
                </p>
            )}
        </div>
    );
}
