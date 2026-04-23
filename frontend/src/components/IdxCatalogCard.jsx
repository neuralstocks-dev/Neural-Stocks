/**
 * IdxCatalogCard — admin console module showing how many IDX tickers are in
 * our local `idx_catalog` MongoDB collection (used by stock search). Offers
 * a one-click bootstrap action that (a) always re-seeds from the trending
 * feed (works on BASIC plan) and (b) probes PRO-plan bulk endpoints for a
 * full ~900-emiten seed when the user upgrades.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
    Database,
    RefreshCw,
    PlayCircle,
    CheckCircle2,
    AlertTriangle,
    Info,
} from "lucide-react";
import api from "@/lib/api";

export default function IdxCatalogCard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [lastReport, setLastReport] = useState(null);
    const [err, setErr] = useState(null);

    const loadStats = useCallback(async () => {
        try {
            const res = await api.get("/admin/idx/catalog-stats");
            setStats(res.data);
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadStats(); }, [loadStats]);

    const runBootstrap = async (tryBulk) => {
        setRunning(true);
        setLastReport(null);
        setErr(null);
        try {
            const res = await api.post("/admin/idx/bootstrap-catalog", null, {
                params: { include_trending: true, try_bulk_endpoints: tryBulk },
            });
            setLastReport(res.data);
            await loadStats();
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Bootstrap failed");
        } finally {
            setRunning(false);
        }
    };

    const total = stats?.total ?? 0;
    const sources = stats?.by_source || {};

    return (
        <section
            className="module mt-6 md:mt-10"
            data-testid="idx-catalog-card"
        >
            <div
                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            >
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Database size={12} strokeWidth={1.5} /> IDX · Local catalog
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        {total} ticker{total === 1 ? "" : "s"} indexed
                    </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={loadStats}
                        disabled={loading}
                        className="btn-ghost !py-1 !px-3 !text-xs flex items-center gap-2"
                        data-testid="catalog-refresh-button"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            <div className="p-5 md:p-6 space-y-5">
                {err && (
                    <p className="text-sm" style={{ color: "hsl(var(--sell))" }}>{err}</p>
                )}

                {stats && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                            <SrcKV label="Total" value={total} tone="primary" />
                            <SrcKV label="From trending" value={sources.trending ?? 0} />
                            <SrcKV label="From verdicts" value={sources.quote ?? 0} />
                            <SrcKV label="From bulk seed" value={sources.bulk_seed ?? 0} tone={(sources.bulk_seed ?? 0) > 0 ? "good" : "muted"} />
                        </div>

                        {total < 30 && (
                            <div
                                className="p-3 text-xs leading-relaxed"
                                style={{
                                    background: "hsla(40,80%,55%,0.06)",
                                    border: "1px solid hsl(var(--hold))",
                                    borderRadius: 2,
                                    color: "hsl(var(--text-primary))",
                                }}
                            >
                                <Info size={12} className="inline mr-1" strokeWidth={1.5} />
                                Catalog is sparse. It'll grow organically as users analyse IDX tickers. To bootstrap it now, click below.
                            </div>
                        )}

                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                type="button"
                                onClick={() => runBootstrap(false)}
                                disabled={running}
                                className="btn-ghost !py-1.5 !px-3 !text-xs inline-flex items-center gap-2"
                                data-testid="seed-trending-button"
                            >
                                <PlayCircle size={12} strokeWidth={1.5} />
                                {running ? "Running…" : "Seed from trending (free)"}
                            </button>
                            <button
                                type="button"
                                onClick={() => runBootstrap(true)}
                                disabled={running}
                                className="btn-ghost !py-1.5 !px-3 !text-xs inline-flex items-center gap-2"
                                title="Tries PRO-plan bulk endpoints. Each attempt counts toward your RapidAPI monthly budget."
                                data-testid="seed-bulk-button"
                            >
                                <PlayCircle size={12} strokeWidth={1.5} />
                                {running ? "Probing…" : "Probe PRO bulk endpoints"}
                            </button>
                        </div>

                        {lastReport && <BootstrapReport report={lastReport} />}

                        <p className="text-[11px] leading-relaxed" style={{ color: "hsl(var(--text-muted))" }}>
                            The local catalog seeds <code>/api/stocks/search</code> — users see live IDX names
                            (with proper Bahasa company titles) the moment they open "Add to watchlist". Entries
                            grow automatically every time anyone successfully analyses or verifies a <code>.JK</code>
                            ticker. The bulk-seed button is for impatient admins who want a head-start.
                        </p>
                    </>
                )}
            </div>
        </section>
    );
}

function SrcKV({ label, value, tone }) {
    const colorMap = {
        primary: "hsl(var(--text-primary))",
        good: "hsl(var(--buy))",
        muted: "hsl(var(--text-muted))",
    };
    return (
        <div>
            <p className="text-overline mb-1" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p
                className="font-mono text-lg"
                style={{ color: colorMap[tone] || "hsl(var(--text-primary))" }}
            >
                {value}
            </p>
        </div>
    );
}

function BootstrapReport({ report }) {
    const worked = (report.attempts || []).filter((a) => a.status === "ok");
    const failed = (report.attempts || []).filter((a) => a.status !== "ok" && a.status !== "ok_but_empty");
    return (
        <div
            className="p-4"
            style={{
                background: "hsl(var(--surface-elevated))",
                border: "1px solid hsl(var(--border-default))",
                borderRadius: 2,
            }}
            data-testid="bootstrap-report"
        >
            <p className="text-overline mb-3 flex items-center gap-2">
                {worked.length > 0 ? (
                    <CheckCircle2 size={12} strokeWidth={1.5} style={{ color: "hsl(var(--buy))" }} />
                ) : (
                    <AlertTriangle size={12} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                )}
                Bootstrap report
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 font-mono text-xs">
                <Stat label="Count before" value={report.count_before} />
                <Stat label="Count after" value={report.count_after} />
                <Stat
                    label="Δ added"
                    value={`+${report.delta}`}
                    highlight={report.delta > 0}
                />
                <Stat label="Trending seeded" value={report.seeded_from_trending} />
            </div>
            {worked.length > 0 && (
                <div className="mb-3">
                    <p className="text-overline mb-1" style={{ color: "hsl(var(--buy))", fontSize: "0.56rem" }}>
                        Working endpoints ({worked.length})
                    </p>
                    <ul className="font-mono text-xs leading-relaxed space-y-0.5">
                        {worked.map((a, i) => (
                            <li key={`ok-${i}-${a.path}`} style={{ color: "hsl(var(--text-primary))" }}>
                                · {a.path} → {a.rows} rows
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {report.requires_pro_plan && worked.length === 0 && report.attempts?.length > 0 && (
                <p className="text-xs leading-relaxed mt-2" style={{ color: "hsl(var(--text-muted))" }}>
                    None of the PRO-plan bulk endpoints responded. You're on BASIC — the catalog will still
                    grow organically from every analysed ticker. Upgrade to PRO ($25/mo) if you want an
                    immediate full-IDX seed.
                </p>
            )}
            {failed.length > 0 && (
                <details className="mt-2">
                    <summary
                        className="text-overline cursor-pointer"
                        style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                    >
                        Failed attempts ({failed.length})
                    </summary>
                    <ul
                        className="mt-2 font-mono text-xs max-h-40 overflow-y-auto"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        {failed.map((a, i) => (
                            <li key={`fail-${i}-${a.path}`}>· {a.path} — {a.status}</li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}

function Stat({ label, value, highlight }) {
    return (
        <div>
            <p className="text-overline mb-1" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p
                className="font-mono text-lg"
                style={{ color: highlight ? "hsl(var(--buy))" : "hsl(var(--text-primary))" }}
            >
                {value}
            </p>
        </div>
    );
}
