import React, { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCcw, AlertTriangle, CheckCircle2, Shuffle } from "lucide-react";
import api from "@/lib/api";

// Colored label palette for each failure-reason bucket. Keep in sync
// with `services/llm_circuit_breaker.py` REASON_* constants.
const REASON_STYLE = {
    llm_socket_hang: { label: "Socket hang", color: "hsl(var(--sell))" },
    litellm_retry_exhausted: { label: "Retry exhausted", color: "hsl(var(--hold))" },
    llm_timeout: { label: "Timeout (cancel)", color: "hsl(var(--gold))" },
    "transient:ChatError": { label: "ChatError", color: "hsl(256, 50%, 70%)" },
    other_exception: { label: "Other exception", color: "hsl(256, 50%, 70%)" },
    unknown: { label: "Unknown", color: "hsl(var(--text-muted))" },
};

// When a failure-reason code is not in REASON_STYLE we still want a
// distinguishable badge instead of collapsing every unmapped code to
// "Unknown" (which loses signal — ops can't tell `transient:ChatError`
// apart from a real `unknown`). Render the raw code, lightly humanized
// and capped at 22 chars so the strip doesn't wrap awkwardly.
function styleForReason(reason) {
    if (REASON_STYLE[reason]) return REASON_STYLE[reason];
    if (!reason || reason === "unknown") return REASON_STYLE.unknown;
    const label = String(reason).replace(/^transient:/, "").replace(/_/g, " ");
    const trimmed = label.length > 22 ? label.slice(0, 21) + "…" : label;
    return { label: trimmed, color: REASON_STYLE.unknown.color };
}

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
    const [providers, setProviders] = useState(null);
    const [sources, setSources] = useState(null);
    const [fallbackRate, setFallbackRate] = useState(null);
    const [err, setErr] = useState("");
    const [busy, setBusy] = useState(false);
    // Track which row in the "Last 10 failures" table has its detail
    // panel expanded (only one at a time to avoid the table jumping
    // around when you open multiple). null = none expanded.
    const [expandedRow, setExpandedRow] = useState(null);
    // Visual feedback for the "Copy escalation summary" button — flips to
    // "Copied ✓" for 2s after a successful clipboard write.
    // Track whether a manual refresh is in flight so the button can show
    // a spinning icon and disable itself for the duration. Without this,
    // tapping Refresh feels unresponsive — the inline icon doesn't change
    // and the button text doesn't update, so users (correctly) think the
    // click did nothing.
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const [s, e, r, p, srcRes, fbRes] = await Promise.all([
                api.get("/admin/llm-breaker"),
                api.get("/admin/llm-events?limit=10&hours=24"),
                api.get("/admin/llm-events/by-provider?hours=24"),
                api.get("/admin/source-health?hours=24"),
                api.get("/admin/llm-events/fallback-rate?hours=24"),
            ]);
            setStatus(s.data);
            setEvents(e.data);
            setProviders(p.data);
            setSources(srcRes.data);
            setFallbackRate(fbRes.data);
            setErr("");
        } catch (ex) {
            // TEMP DIAGNOSTIC — remove once root cause of "Failed to load LLM
            // health" with no visible network/console error is found.
            console.error("[AdminLLMHealthPanel] refresh() failed:", {
                message: ex?.message,
                name: ex?.name,
                stack: ex?.stack,
                isAxiosError: ex?.isAxiosError,
                responseStatus: ex?.response?.status,
                responseData: ex?.response?.data,
                config: ex?.config?.url,
            });
            setErr(ex?.response?.data?.detail || ex?.message || "Failed to load LLM health");
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
                            const s = styleForReason(reason);
                            const pct = Math.round((count / totalFailures) * 100);
                            return (
                                <span
                                    key={reason}
                                    className="font-mono text-xs px-2 py-0.5 rounded-sm"
                                    style={{ color: s.color, border: `1px solid ${s.color}`, fontSize: "11px" }}
                                    title={`${reason} · ${count} / ${totalFailures}`}
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
                                        const s = styleForReason(ev.reason);
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
                    No LLM failures in the last 24 hours — AI provider is steady.
                </p>
            )}

            {/* Per-provider success-rate strip · last 24h. Drives operational
                triage: at-a-glance see which provider in the fallback chain
                is currently degraded. Renders as one row per provider with
                a chip-style success-rate readout colour-coded by health. */}
            {providers && providers.providers && providers.providers.length > 0 && (
                <ProviderHealthStrip data={providers} />
            )}

            {/* Fallback-verdict-rate tile · last 24h. Counts FINAL verdicts
                persisted to the analyses collection that came from a
                non-primary provider (i.e. primary provider was demoted/skipped
                and Gemini ended up answering). Pairs with the user-facing
                <LLMProvenanceBadge> — same signal, different audience.
                Distinct from the provider strip above (which counts raw
                attempts including retries). Colour: green if 0%, amber
                ≤30%, red >30%. */}
            {fallbackRate && fallbackRate.total_verdicts > 0 && (
                <FallbackRateTile data={fallbackRate} />
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
function DownloadEscalationCsvButton({ days = 30 }) {
    // Downloads the full escalation CSV as a file attachment AND copies
    // a ready-to-paste email body to the clipboard. One click = both
    // artefacts ready — admin just opens their email client, attaches
    // the downloaded CSV, pastes the body, hits send.
    //
    // Two UI states worth noting:
    //   * "done" — both CSV downloaded AND email copied (happy path)
    //   * "done-no-clipboard" — CSV downloaded but clipboard was
    //     blocked (e.g. Safari without user-activation, strict iframe).
    //     Don't mis-advertise success; tell the admin to copy the body
    //     manually from a second endpoint hit.
    const [state, setState] = useState("idle"); // idle · busy · done · done-no-clipboard · error
    const download = async () => {
        setState("busy");
        try {
            // Parallel: fetch the CSV blob + fetch the email-draft JSON.
            // A single catastrophic failure (e.g. token expired) takes
            // both down together, which is what we want — the admin
            // can't ship a half-baked email.
            const [csvRes, draftRes] = await Promise.all([
                api.get(
                    `/admin/llm-events/escalation-report.csv?days=${days}`,
                    { responseType: "blob" },
                ),
                api.get(`/admin/llm-events/escalation-email-draft?days=${days}`),
            ]);

            // 1. Trigger the CSV download.
            const cd = csvRes.headers?.["content-disposition"] || "";
            const match = cd.match(/filename="([^"]+)"/);
            const filename = match ? match[1] : `neulab-escalation-${days}d.csv`;
            const blob = new Blob([csvRes.data], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);

            // 2. Copy the email draft body to clipboard. Prefix with
            // the subject line so the admin can see both at a glance
            // when they paste into a scratchpad; most email clients
            // accept the first line as subject when pasted into their
            // compose field anyway.
            const { subject, body } = draftRes.data || {};
            const clipboardText = `Subject: ${subject}\n\n${body}`;
            let clipboardOk = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(clipboardText);
                    clipboardOk = true;
                }
            } catch {
                clipboardOk = false;
            }
            setState(clipboardOk ? "done" : "done-no-clipboard");
            setTimeout(() => setState("idle"), 4000);
        } catch (ex) {
            console.error("escalation csv download failed:", ex);
            setState("error");
            setTimeout(() => setState("idle"), 3000);
        }
    };
    const label =
        state === "busy"              ? "Preparing…" :
        state === "done"              ? "✓ Downloaded + email body copied" :
        state === "done-no-clipboard" ? "✓ Downloaded (clipboard blocked — copy body manually)" :
        state === "error"             ? "Download failed — retry?" :
                                        "⬇ Download CSV + email draft";
    return (
        <button
            type="button"
            onClick={download}
            disabled={state === "busy"}
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1 rounded transition-colors"
            style={{
                cursor: state === "busy" ? "wait" : "pointer",
                border: "1px solid hsl(var(--sell))",
                color:
                    state === "done"
                        ? "hsl(var(--buy))"
                        : state === "done-no-clipboard"
                        ? "hsl(var(--gold))"
                        : state === "error"
                        ? "hsl(var(--gold))"
                        : "hsl(var(--sell))",
            }}
            data-testid="admin-llm-health-download-csv"
            title="One click: downloads the full escalation CSV for attaching to an email AND copies a ready-to-paste 3-paragraph email body (subject + body, with the direct/rework credit totals pre-filled) to your clipboard. Just open your email client, attach the CSV, paste the body, send."
        >
            {label}
        </button>
    );
}

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
                <div className="flex items-center gap-2 flex-wrap">
                    <DownloadEscalationCsvButton days={recoup.window_days || 30} />
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
                            const s = styleForReason(reason);
                            return (
                                <li key={reason} className="flex items-center justify-between gap-3">
                                    <span className="text-xs" style={{ color: s.color }} title={reason}>{s.label}</span>
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
function FallbackRateTile({ data }) {
    // Colour the fallback-rate readout by health: 0% green (chain
    // healthy, primary serving everything), ≤30% amber (intermittent
    // degradation, fallback firing as designed), >30% red (sustained
    // primary degradation, escalation likely needed).
    const rate = data?.fallback_rate_pct ?? 0;
    const total = data?.total_verdicts ?? 0;
    const fb = data?.fallback_count ?? 0;
    const color =
        rate === 0
            ? "hsl(var(--buy))"
            : rate <= 30
            ? "hsl(var(--gold))"
            : "hsl(var(--sell))";
    // Compose a per-provider breakdown line so admins see which
    // fallback provider absorbed the load (gemini=N) and the primary's
    // share. Sorted desc by count.
    const breakdown = Object.entries(data?.by_provider || {}).sort(
        (a, b) => b[1] - a[1],
    );
    return (
        <div
            className="module mt-3 p-4"
            style={{
                borderColor: "hsl(var(--border-divider))",
                borderLeft: `3px solid ${color}`,
            }}
            data-testid="admin-fallback-rate-tile"
            title="Counts FINAL verdicts in the analyses collection that came from a non-primary provider (Gemini after primary provider was demoted/skipped). Distinct from the provider-attempt strip above which counts raw attempts including retries."
        >
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <Shuffle size={12} strokeWidth={1.7} style={{ color }} />
                    <p
                        className="text-overline"
                        style={{ fontSize: "10px", color: "hsl(var(--text-secondary))" }}
                    >
                        Fallback-verdict rate · last {data?.window_hours ?? 24}h
                    </p>
                </div>
                <div className="flex items-baseline gap-2">
                    <span
                        className="font-mono"
                        style={{ fontSize: "20px", color }}
                        data-testid="admin-fallback-rate-pct"
                    >
                        {rate.toFixed(1)}%
                    </span>
                    <span
                        className="font-mono"
                        style={{ fontSize: "10px", color: "hsl(var(--text-muted))" }}
                    >
                        {fb} / {total} verdicts
                    </span>
                </div>
            </div>
            {breakdown.length > 0 && (
                <p
                    className="mt-2 font-mono text-xs flex flex-wrap gap-x-3 gap-y-1"
                    style={{ color: "hsl(var(--text-muted))", fontSize: "11px" }}
                    data-testid="admin-fallback-rate-breakdown"
                >
                    {breakdown.map(([prov, n]) => {
                        const isPrimary = prov === (data?.primary_provider || "anthropic");
                        return (
                            <span key={prov}>
                                {prov}
                                {isPrimary ? " (primary)" : ""}
                                <span style={{ color: "hsl(var(--text-secondary))" }}> · {n}</span>
                            </span>
                        );
                    })}
                </p>
            )}
        </div>
    );
}

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
    lines.push("The AI provider has been intermittently socket-hanging");
    lines.push("at the upstream proxy layer. My application correctly applies a 240s timeout +");
    lines.push("tenacity retries; the failures classify as `llm_socket_hang` with elapsed_s ≈ budget,");
    lines.push("indicating the issue is upstream of my code (AI provider).");
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
    lines.push("  1) Investigate the AI provider upstream reliability for these timestamps");
    lines.push("  2) Confirm whether these failed completions were billable, and");
    lines.push("  3) Recoup the wasted credits if they were.");
    lines.push("");
    lines.push("Happy to provide the full LLM-events log dump if helpful.");
    lines.push("");
    lines.push("Thanks,");
    lines.push("");
    return lines.join("\n");
}

