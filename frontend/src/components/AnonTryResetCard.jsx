/**
 * AnonTryResetCard — admin utility for testing. Shows how many IPs are
 * currently rate-limited on the /try free-analysis flow and offers a
 * one-click "Reset all" that wipes the anon_try_usage collection so
 * every visitor (including you on your own browser) gets a fresh slot.
 *
 * Only meant for staging / QA. Keep the confirm dialog in place — a
 * stray click in production would let any IP spam the pipeline again.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Unlock, RefreshCw, AlertTriangle } from "lucide-react";
import api from "@/lib/api";

export default function AnonTryResetCard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [resetting, setResetting] = useState(false);
    const [lastResetCount, setLastResetCount] = useState(null);
    const [err, setErr] = useState(null);
    const [confirming, setConfirming] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await api.get("/admin/anon-try/stats");
            setStats(res.data);
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const doReset = async () => {
        setResetting(true);
        setErr(null);
        try {
            const res = await api.post("/admin/anon-try/reset");
            setLastResetCount(res.data.deleted_count);
            setConfirming(false);
            await load();
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Reset failed");
        } finally {
            setResetting(false);
        }
    };

    return (
        <section className="module mt-6 md:mt-10" data-testid="anon-try-reset-card">
            <div
                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            >
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Unlock size={12} strokeWidth={1.5} /> Anon Try · Rate-limit reset
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        Free-analysis testing override
                    </h2>
                    <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                        Wipes <code>anon_try_usage</code> so every IP (including yours) gets a fresh free analysis slot.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="btn-ghost !py-1.5 !px-3 !text-xs flex items-center gap-2 min-h-[32px]"
                    data-testid="anon-try-refresh"
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
            </div>

            <div className="p-5 md:p-6 space-y-5">
                {err && <p className="text-sm" style={{ color: "hsl(var(--sell))" }}>{err}</p>}

                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 font-mono text-xs">
                        <KV label="Active records" value={stats.active_records} testId="anon-try-total" />
                        <KV label="Unique IPs throttled" value={stats.unique_ips_rate_limited} testId="anon-try-ips" />
                        <KV
                            label="Last reset"
                            value={lastResetCount != null ? `${lastResetCount} wiped` : "—"}
                            tone={lastResetCount != null && lastResetCount > 0 ? "good" : "muted"}
                        />
                    </div>
                )}

                {stats && stats.recent?.length > 0 && (
                    <div>
                        <p className="text-overline mb-2">Most recent events</p>
                        <div
                            className="overflow-x-auto"
                            style={{
                                background: "hsl(var(--surface-base))",
                                border: "1px solid hsl(var(--border-divider))",
                                borderRadius: 2,
                            }}
                        >
                            <table className="w-full font-mono text-xs">
                                <thead>
                                    <tr style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                        <Th>IP hash</Th>
                                        <Th>Ticker</Th>
                                        <Th>User agent</Th>
                                        <Th>When</Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.recent.map((r, i) => (
                                        <tr key={`${r.ip_hash}-${i}`} style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                            <Td><code style={{ fontSize: "0.62rem", color: "hsl(var(--text-muted))" }}>{(r.ip_hash || "").slice(0, 12)}…</code></Td>
                                            <Td>{r.ticker}</Td>
                                            <Td><span style={{ color: "hsl(var(--text-muted))" }}>{(r.ua_fragment || "—").slice(0, 45)}</span></Td>
                                            <Td>{(r.created_at_ts || "").toString().replace("T", " ").slice(0, 19)}</Td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div
                    className="p-4 flex items-start gap-3 flex-wrap"
                    style={{
                        background: "hsla(0,55%,55%,0.06)",
                        border: "1px solid hsl(var(--sell))",
                        borderRadius: 2,
                    }}
                >
                    <AlertTriangle size={14} strokeWidth={1.8} style={{ color: "hsl(var(--sell))", flexShrink: 0, marginTop: 2 }} />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                            <strong>Testing use only.</strong> After reset, any IP can trigger a fresh free analysis (cost: 1 AI + RapidAPI call per distinct ticker). Your own browser's "already used today" state clears too.
                        </p>
                    </div>
                    {!confirming ? (
                        <button
                            type="button"
                            onClick={() => setConfirming(true)}
                            className="btn-ghost !py-1.5 !px-3 !text-xs flex items-center gap-2 flex-shrink-0"
                            style={{
                                color: "hsl(var(--sell))",
                                borderColor: "hsl(var(--sell))",
                            }}
                            data-testid="anon-try-reset-trigger"
                        >
                            <Unlock size={11} strokeWidth={2} /> Reset all
                        </button>
                    ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={doReset}
                                disabled={resetting}
                                className="btn-ghost !py-1.5 !px-3 !text-xs"
                                style={{
                                    color: "hsl(var(--sell))",
                                    borderColor: "hsl(var(--sell))",
                                    background: "hsla(0,55%,55%,0.08)",
                                }}
                                data-testid="anon-try-reset-confirm"
                            >
                                {resetting ? "Resetting…" : "Confirm reset"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                className="btn-ghost !py-1.5 !px-3 !text-xs"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function KV({ label, value, tone, testId }) {
    const color = {
        good: "hsl(var(--buy))",
        muted: "hsl(var(--text-muted))",
    }[tone] || "hsl(var(--text-primary))";
    return (
        <div data-testid={testId}>
            <p className="text-overline mb-1" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p className="font-mono text-lg" style={{ color }}>{value}</p>
        </div>
    );
}

function Th({ children }) {
    return (
        <th
            className="px-3 py-2 text-left text-overline"
            style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem", fontWeight: 500 }}
        >
            {children}
        </th>
    );
}

function Td({ children }) {
    return (
        <td className="px-3 py-2 align-top" style={{ color: "hsl(var(--text-primary))" }}>
            {children}
        </td>
    );
}
