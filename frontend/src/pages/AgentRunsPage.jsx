import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { ChevronLeft, ChevronDown, ChevronUp, Loader2, History, AlertTriangle } from "lucide-react";

function fmtDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function fmtMcap(mcap) {
    if (!mcap) return "—";
    return `$${(mcap / 1e9).toFixed(1)}B`;
}

function HitsTable({ hits }) {
    if (!hits || hits.length === 0) {
        return (
            <p className="text-sm font-mono mt-3" style={{ color: "hsl(var(--text-muted))" }}>
                No tickers matched this run.
            </p>
        );
    }
    return (
        <div className="overflow-x-auto mt-3">
            <table className="w-full font-mono text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ color: "hsl(var(--text-muted))", letterSpacing: "0.08em" }}>
                        <th className="text-left text-xs uppercase py-2">Ticker</th>
                        <th className="text-right text-xs uppercase py-2">% from ATH</th>
                        <th className="text-right text-xs uppercase py-2">Qtrs beat</th>
                        <th className="text-right text-xs uppercase py-2">Mcap</th>
                        <th className="text-right text-xs uppercase py-2">Divergence day</th>
                    </tr>
                </thead>
                <tbody>
                    {hits.map((h) => (
                        <tr key={h.ticker} style={{ borderTop: "1px solid hsl(var(--border-default))" }}>
                            <td className="py-2.5">
                                <Link to={`/analysis/${h.ticker}?autorun=1`} className="hover:underline" style={{ color: "hsl(var(--text-primary))" }}>
                                    {h.ticker}
                                </Link>
                            </td>
                            <td className="text-right py-2.5" style={{ color: "hsl(var(--buy))" }}>
                                {h.pct_from_ath}%
                            </td>
                            <td className="text-right py-2.5" style={{ color: "hsl(var(--text-secondary))" }}>
                                {h.quarters_beat}/4{!h.guidance_checked && "*"}
                            </td>
                            <td className="text-right py-2.5" style={{ color: "hsl(var(--text-secondary))" }}>
                                {fmtMcap(h.mcap)}
                            </td>
                            <td className="text-right py-2.5" style={{ color: "hsl(var(--text-muted))" }}>
                                {h.divergence_date}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {hits.some((h) => !h.guidance_checked) && (
                <p className="text-xs font-mono mt-2" style={{ color: "hsl(var(--text-muted))" }}>
                    * Guidance-beat data unavailable for this ticker — quarters-beat count uses EPS-beat-only as a fallback.
                </p>
            )}
        </div>
    );
}

function RunRow({ run }) {
    const [open, setOpen] = useState(false);
    const isError = run.status === "error";
    return (
        <article className="module p-5" data-testid={`agent-run-${run.id}`}>
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center justify-between w-full gap-4"
                data-testid={`agent-run-toggle-${run.id}`}
            >
                <div className="flex items-center gap-3 flex-wrap text-left">
                    <span className="font-mono text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                        {fmtDate(run.run_at)}
                    </span>
                    <span
                        className="font-mono text-xs px-2 py-1"
                        style={{
                            background: "hsl(var(--surface-elevated))",
                            color: "hsl(var(--text-muted))",
                            letterSpacing: "0.1em",
                        }}
                    >
                        {run.triggered_by === "manual" ? "MANUAL" : "SCHEDULED"}
                    </span>
                    {isError ? (
                        <span className="font-mono text-xs inline-flex items-center gap-1" style={{ color: "hsl(var(--sell))" }}>
                            <AlertTriangle size={11} strokeWidth={1.5} /> Error
                        </span>
                    ) : (
                        <span className="font-mono text-xs" style={{ color: "hsl(var(--buy))" }}>
                            {(run.hits || []).length} hit{(run.hits || []).length !== 1 ? "s" : ""}
                        </span>
                    )}
                    {!isError && !run.guidance_proxy_available && (
                        <span className="font-mono text-xs" style={{ color: "hsl(var(--hold))" }}>
                            guidance data unavailable
                        </span>
                    )}
                </div>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {open && (
                <div className="mt-3" style={{ borderTop: "1px solid hsl(var(--border-default))", paddingTop: "0.75rem" }}>
                    {isError ? (
                        <p className="text-sm font-mono" style={{ color: "hsl(var(--sell))" }}>
                            {run.error || "This run failed."}
                        </p>
                    ) : (
                        <>
                            <p className="text-xs font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                {run.universe_size} tickers screened
                            </p>
                            <HitsTable hits={run.hits} />
                        </>
                    )}
                </div>
            )}
        </article>
    );
}

export default function AgentRunsPage() {
    const { id } = useParams();
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setLoadErr("");
        try {
            const res = await api.get(`/agents/${id}/runs`);
            setRuns(res.data?.runs || []);
        } catch (e) {
            setLoadErr(e?.response?.data?.detail || "Couldn't load run history. Reload the page to retry.");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="max-w-[1100px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="agent-runs-page">
            <Link to="/agents" className="font-mono text-xs inline-flex items-center gap-1" style={{ color: "hsl(var(--text-muted))" }}>
                <ChevronLeft size={12} strokeWidth={1.5} /> Back to agents
            </Link>
            <p className="text-overline flex items-center gap-2 mt-4">
                <History size={12} strokeWidth={1.5} /> Run history
            </p>
            <h1 className="font-serif mt-3" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.02em" }}>
                Every run, <em style={{ color: "hsl(var(--hold))" }}>scheduled or manual</em>.
            </h1>

            <div className="mt-8 space-y-3" data-testid="agent-runs-list">
                {loadErr ? (
                    <div
                        className="module p-5 font-mono text-sm"
                        style={{ background: "hsl(var(--sell-bg))", color: "hsl(var(--sell))", border: "1px solid hsl(var(--sell))" }}
                        data-testid="agent-runs-load-error"
                    >
                        {loadErr}
                    </div>
                ) : loading ? (
                    <p className="text-sm font-mono py-8 text-center" style={{ color: "hsl(var(--text-muted))" }}>
                        <Loader2 size={14} className="animate-spin inline mr-2" /> Loading runs…
                    </p>
                ) : runs.length === 0 ? (
                    <div
                        className="module p-8 text-center"
                        data-testid="agent-runs-empty-state"
                        style={{ background: "hsl(var(--surface-elevated))" }}
                    >
                        <p className="font-mono text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                            No runs yet — this agent hasn't fired on its schedule, and no manual run has been triggered.
                        </p>
                    </div>
                ) : (
                    runs.map((r) => <RunRow key={r.id} run={r} />)
                )}
            </div>
        </div>
    );
}
