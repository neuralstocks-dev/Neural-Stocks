/**
 * RFRetrainCard — admin console module for the Random Forest secondary
 * opinion model. Shows current model age, last retrain result, and a
 * manual "Retrain now" button. The weekly scheduler inside the backend
 * handles the cadence automatically — this is just the override.
 */
import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Trees, Loader2, RotateCcw, CheckCircle2, AlertCircle, Clock, RefreshCw } from "lucide-react";

function fmtDateTime(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short", day: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function fmtDays(n) {
    if (n == null) return "—";
    if (n < 1) return `${Math.round(n * 24)}h`;
    return `${n.toFixed(1)}d`;
}

export default function RFRetrainCard() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await api.get("/admin/rf/status");
            setStatus(res.data);
            setError(null);
        } catch (e) {
            setError(e?.response?.data?.detail || "Failed to load RF retrain status");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        // Poll every 6s while a retrain is running so the log-tail + state update
        const id = setInterval(fetchStatus, 6000);
        return () => clearInterval(id);
    }, [fetchStatus]);

    const trigger = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post("/admin/rf/retrain");
            await fetchStatus();
        } catch (e) {
            setError(e?.response?.data?.detail || "Retrain trigger failed");
        } finally {
            setBusy(false);
        }
    };

    const reload = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post("/admin/rf/reload");
            await fetchStatus();
        } catch (e) {
            setError(e?.response?.data?.detail || "Reload failed");
        } finally {
            setBusy(false);
        }
    };

    const latest = status?.latest_job;
    const meta = latest?.meta;
    const isRunning = status?.is_running;
    const isStale = status?.is_stale;
    const statusColor = isRunning
        ? "hsl(var(--hold))"
        : latest?.status === "failed"
            ? "hsl(var(--sell))"
            : isStale
                ? "hsl(var(--hold))"
                : "hsl(var(--buy))";
    const StatusIcon = isRunning ? Loader2 : latest?.status === "failed" ? AlertCircle : isStale ? Clock : CheckCircle2;

    return (
        <section
            className="module mt-6 md:mt-10 p-5 md:p-6"
            data-testid="admin-rf-retrain-module"
        >
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Trees size={12} strokeWidth={1.5} /> Random Forest · Secondary opinion
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        Model retrain
                    </h2>
                    <p className="text-sm mt-2" style={{ color: "hsl(var(--text-muted))" }}>
                        The weekly scheduler retrains automatically when the model is older than{" "}
                        <strong style={{ color: "hsl(var(--text-primary))" }}>
                            {status?.stale_threshold_days ?? 7} days
                        </strong>. Use this panel to force an immediate retrain or to reload a
                        freshly-deployed model without a backend restart.
                    </p>
                </div>
                <div
                    className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px]"
                    style={{
                        border: `1px solid ${statusColor}`,
                        color: statusColor,
                        borderRadius: 2,
                    }}
                    data-testid="rf-retrain-status-chip"
                >
                    <StatusIcon size={12} strokeWidth={1.5} className={isRunning ? "animate-spin" : ""} />
                    {isRunning
                        ? "Running"
                        : latest?.status === "failed"
                            ? "Last run failed"
                            : isStale
                                ? `Stale (${fmtDays(status?.model_age_days)})`
                                : `Healthy (${fmtDays(status?.model_age_days)})`}
                </div>
            </div>

            <div
                className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-0"
                style={{ border: "1px solid hsl(var(--border-default))" }}
            >
                {loading ? (
                    <div className="col-span-4 p-4 text-center text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                        <Loader2 size={14} className="inline mr-2 animate-spin" strokeWidth={1.5} /> Loading…
                    </div>
                ) : (
                    <>
                        <Cell label="Trained at" value={fmtDateTime(meta?.trained_at || status?.latest_job?.started_at)} />
                        <Cell label="Universe" value={meta?.universe_size ? `${meta.universe_size} tickers` : "—"} />
                        <Cell label="Holdout acc" value={meta?.holdout_accuracy != null ? `${(meta.holdout_accuracy * 100).toFixed(2)}%` : "—"} />
                        <Cell label="Calibrated Brier" value={meta?.calibrated_brier != null ? meta.calibrated_brier.toFixed(4) : "—"} last />
                    </>
                )}
            </div>

            {latest?.log_tail ? (
                <details className="mt-4" data-testid="rf-retrain-log-details">
                    <summary
                        className="cursor-pointer font-mono text-[11px]"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        Show last {Math.min(80, (latest.log_tail.match(/\n/g) || []).length + 1)} log lines
                        {" "}· job <code>{latest.id?.slice(0, 8)}</code> · triggered by{" "}
                        <code>{latest.triggered_by}</code>
                    </summary>
                    <pre
                        className="mt-2 p-3 text-[10.5px] overflow-auto font-mono"
                        style={{
                            background: "hsl(var(--bg))",
                            border: "1px solid hsl(var(--border-divider))",
                            maxHeight: "260px",
                        }}
                    >
                        {latest.log_tail}
                    </pre>
                </details>
            ) : null}

            {error ? (
                <div
                    className="mt-4 p-3 text-sm"
                    style={{
                        background: "hsla(0,55%,55%,0.08)",
                        border: "1px solid hsl(var(--sell))",
                        color: "hsl(var(--sell))",
                    }}
                    data-testid="rf-retrain-error"
                >
                    {error}
                </div>
            ) : null}

            <div className="mt-5 flex items-center gap-3 flex-wrap">
                <button
                    onClick={trigger}
                    disabled={busy || isRunning}
                    className="btn-primary !py-2 !px-4 !text-xs flex items-center gap-2"
                    data-testid="rf-retrain-trigger-button"
                >
                    {busy || isRunning ? (
                        <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                    ) : (
                        <RotateCcw size={12} strokeWidth={1.5} />
                    )}
                    {isRunning ? "Retrain in progress…" : "Retrain now (5y / 20d)"}
                </button>
                <button
                    onClick={reload}
                    disabled={busy || isRunning}
                    className="btn-ghost !py-2 !px-4 !text-xs flex items-center gap-2"
                    data-testid="rf-retrain-reload-button"
                >
                    <RefreshCw size={12} strokeWidth={1.5} />
                    Reload model from disk
                </button>
                <span
                    className="font-mono text-[10.5px]"
                    style={{ color: "hsl(var(--text-muted))" }}
                >
                    Subprocess runs out-of-process · ~3 min · atomic swap on success
                </span>
            </div>
        </section>
    );
}

function Cell({ label, value, last }) {
    return (
        <div
            className="p-3 md:p-4"
            style={{
                borderRight: last ? undefined : "1px solid hsl(var(--border-default))",
                borderBottom: "1px solid hsl(var(--border-default))",
            }}
        >
            <p className="text-overline" style={{ fontSize: "0.58rem" }}>{label}</p>
            <p className="mt-1 font-mono text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                {value}
            </p>
        </div>
    );
}
