/**
 * TaglineExperimentCard — admin module showing impression + conversion
 * stats per tagline variant over a selectable window. Zero-cost A/B
 * framework: cumulative impressions, signups attributed, and rate per
 * variant. Helps you spot winners/losers and kill underperforming copy.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlaskConical, RefreshCw, TrendingUp } from "lucide-react";
import api from "@/lib/api";

const WINDOWS = [
    { key: 7, label: "7d" },
    { key: 30, label: "30d" },
    { key: 90, label: "90d" },
];

export default function TaglineExperimentCard() {
    const [windowDays, setWindowDays] = useState(7);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await api.get("/experiments/tagline/stats", {
                params: { window_days: windowDays },
            });
            setData(res.data);
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [windowDays]);

    useEffect(() => { load(); }, [load]);

    // Identify the winner (highest rate with ≥30 impressions — below that
    // the sample is too small to be meaningful)
    const items = data?.items || [];
    const rankable = items.filter((i) => i.impressions >= 30);
    const winner = rankable.length
        ? rankable.reduce((best, cur) => (cur.conversion_rate > best.conversion_rate ? cur : best), rankable[0])
        : null;

    return (
        <section className="module mt-6 md:mt-10" data-testid="tagline-experiment-card">
            <div
                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            >
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <FlaskConical size={12} strokeWidth={1.5} /> A/B · Login tagline
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        Tagline conversion rates
                    </h2>
                    <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                        {data
                            ? `${data.totals.impressions} impressions · ${data.totals.conversions} signups · last ${windowDays} days`
                            : "Loading…"}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <PillGroup options={WINDOWS} value={windowDays} onChange={setWindowDays} />
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="btn-ghost !py-1 !px-3 !text-xs flex items-center gap-2"
                        data-testid="tagline-refresh-button"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            <div className="p-5 md:p-6 space-y-4">
                {err && <p className="text-sm" style={{ color: "hsl(var(--sell))" }}>{err}</p>}

                {data && items.length === 0 && (
                    <p className="text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                        No variants configured.
                    </p>
                )}

                {data && items.map((it) => {
                    const isWinner = winner && it.variant_key === winner.variant_key && it.conversion_rate > 0;
                    return (
                        <div
                            key={it.variant_key}
                            className="p-4 flex items-center gap-4 flex-wrap"
                            style={{
                                background: isWinner ? "hsla(142,55%,45%,0.06)" : "hsl(var(--surface-elevated))",
                                border: `1px solid ${isWinner ? "hsl(var(--buy))" : "hsl(var(--border-divider))"}`,
                                borderRadius: 2,
                            }}
                            data-testid={`tagline-variant-${it.variant_key}`}
                        >
                            <div className="flex-1 min-w-0">
                                <p className="font-serif text-lg" style={{ letterSpacing: "-0.01em" }}>
                                    {it.line1}{" "}
                                    <em className="italic" style={{ color: "hsl(var(--accent-primary))" }}>
                                        {it.line2}
                                    </em>
                                </p>
                                <p
                                    className="text-overline mt-1 font-mono"
                                    style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                                >
                                    {it.variant_key}
                                </p>
                            </div>
                            <div className="flex items-center gap-5 font-mono flex-shrink-0 flex-wrap">
                                <Metric label="Impressions" value={it.impressions} />
                                <Metric label="Signups" value={it.conversions} highlight={it.conversions > 0} />
                                <Metric
                                    label="Rate"
                                    value={`${(it.conversion_rate * 100).toFixed(2)}%`}
                                    highlight={isWinner}
                                />
                                {isWinner && (
                                    <span
                                        className="inline-flex items-center gap-1 px-2 py-1 font-mono"
                                        style={{
                                            color: "hsl(var(--buy))",
                                            border: "1px solid hsl(var(--buy))",
                                            fontSize: "0.56rem",
                                            letterSpacing: "0.12em",
                                            borderRadius: 2,
                                        }}
                                    >
                                        <TrendingUp size={10} strokeWidth={2} /> WINNER
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {data && rankable.length === 0 && data.totals.impressions > 0 && (
                    <p className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                        Each variant needs ≥30 impressions before the "winner" badge is shown — keeps the
                        signal meaningful and prevents premature copy decisions.
                    </p>
                )}

                <p className="text-[11px] leading-relaxed" style={{ color: "hsl(var(--text-muted))" }}>
                    Visitors are cookie-pinned to one variant for render consistency. Attribution is
                    first-conversion-wins — no double-counting. To retire a variant, delete its entry from{" "}
                    <code>TAGLINE_VARIANTS</code> in <code>backend/routers/experiments.py</code> and restart
                    the backend — historical data persists.
                </p>
            </div>
        </section>
    );
}

function Metric({ label, value, highlight }) {
    return (
        <div className="text-right">
            <p className="text-overline" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p
                className="font-mono text-lg mt-0.5"
                style={{ color: highlight ? "hsl(var(--buy))" : "hsl(var(--text-primary))" }}
            >
                {value}
            </p>
        </div>
    );
}

function PillGroup({ options, value, onChange }) {
    return (
        <div
            className="inline-flex p-0.5"
            style={{
                background: "hsl(var(--surface-elevated))",
                border: "1px solid hsl(var(--border-divider))",
                borderRadius: 2,
            }}
        >
            {options.map((opt) => {
                const active = opt.key === value;
                return (
                    <button
                        key={opt.key}
                        type="button"
                        onClick={() => onChange(opt.key)}
                        className="text-xs px-2.5 py-1 font-mono"
                        style={{
                            color: active ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                            background: active ? "hsl(var(--surface-base))" : "transparent",
                            border: active ? "1px solid hsl(var(--border-default))" : "1px solid transparent",
                            borderRadius: 2,
                            letterSpacing: "0.05em",
                        }}
                        data-testid={`tagline-window-${opt.key}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
