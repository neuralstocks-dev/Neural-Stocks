/**
 * ExperimentsCard — admin module showing A/B stats for every registered
 * experiment. One section per experiment, each showing variant rows with
 * impressions, conversions, and rate. Auto-flags the winner (≥30 impressions).
 *
 * Backend auto-discovers every experiment from `EXPERIMENTS` in
 * routers/experiments.py — this card re-renders without code changes.
 */
import React, { useCallback, useEffect, useState } from "react";
import { FlaskConical, RefreshCw, TrendingUp } from "lucide-react";
import api from "@/lib/api";

const WINDOWS = [
    { key: 7, label: "7d" },
    { key: 30, label: "30d" },
    { key: 90, label: "90d" },
];

export default function ExperimentsCard() {
    const [windowDays, setWindowDays] = useState(7);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await api.get("/experiments/stats", { params: { window_days: windowDays } });
            setData(res.data);
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [windowDays]);

    useEffect(() => { load(); }, [load]);

    return (
        <section className="module mt-6 md:mt-10" data-testid="experiments-card">
            <div
                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            >
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <FlaskConical size={12} strokeWidth={1.5} /> A/B experiments
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        Conversion optimisation
                    </h2>
                    <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                        {data
                            ? `${data.experiments.length} active test${data.experiments.length === 1 ? "" : "s"} · last ${windowDays} days`
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
                        data-testid="experiments-refresh-button"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            <div className="p-5 md:p-6 space-y-8">
                {err && <p className="text-sm" style={{ color: "hsl(var(--sell))" }}>{err}</p>}
                {data && data.experiments.map((exp) => (
                    <ExperimentSection key={exp.key} exp={exp} />
                ))}
            </div>
        </section>
    );
}

function ExperimentSection({ exp }) {
    // Winner eligibility: ≥30 impressions and non-zero rate
    const eligible = exp.rows.filter((r) => r.impressions >= 30);
    const winner = eligible.length
        ? eligible.reduce((best, cur) => (cur.conversion_rate > best.conversion_rate ? cur : best), eligible[0])
        : null;

    return (
        <div data-testid={`experiment-section-${exp.key}`}>
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
                <div>
                    <p className="text-overline font-mono" style={{ fontSize: "0.62rem", letterSpacing: "0.12em" }}>
                        {exp.key}
                    </p>
                    <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                        {exp.description}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "hsl(var(--text-muted))" }}>
                        {exp.surface} · conversion = <code>{exp.conversion_event}</code>
                    </p>
                </div>
                <p className="text-xs font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                    {exp.totals.impressions} impressions · {exp.totals.conversions} conv
                </p>
            </div>
            <div className="space-y-2">
                {exp.rows.map((row) => (
                    <VariantRow
                        key={row.variant_key}
                        row={row}
                        isWinner={winner && winner.variant_key === row.variant_key && row.conversion_rate > 0}
                    />
                ))}
            </div>
        </div>
    );
}

function VariantRow({ row, isWinner }) {
    const render = row.render || {};
    const displayText = render.line1
        ? (
            <p className="font-serif text-base" style={{ letterSpacing: "-0.01em" }}>
                {render.line1}{" "}
                <em className="italic" style={{ color: "hsl(var(--accent-primary))" }}>
                    {render.line2}
                </em>
            </p>
        )
        : render.label
        ? (
            <p className="font-mono" style={{ letterSpacing: "0.08em" }}>
                {render.label}
            </p>
        )
        : render.prefix
        ? (
            <p className="font-mono" style={{ letterSpacing: "0.08em" }}>
                {render.prefix}
            </p>
        )
        : <p className="font-mono">{row.variant_key}</p>;

    return (
        <div
            className="p-3 flex items-center gap-4 flex-wrap"
            style={{
                background: isWinner ? "hsla(142,55%,45%,0.06)" : "hsl(var(--surface-elevated))",
                border: `1px solid ${isWinner ? "hsl(var(--buy))" : "hsl(var(--border-divider))"}`,
                borderRadius: 2,
            }}
            data-testid={`variant-row-${row.variant_key}`}
        >
            <div className="flex-1 min-w-0">
                {displayText}
                <p
                    className="text-overline mt-1 font-mono"
                    style={{ fontSize: "0.52rem", color: "hsl(var(--text-muted))" }}
                >
                    {row.variant_key}
                </p>
            </div>
            <div className="flex items-center gap-5 font-mono flex-shrink-0 flex-wrap">
                <Metric label="Impressions" value={row.impressions} />
                <Metric label="Conv" value={row.conversions} highlight={row.conversions > 0} />
                <Metric label="Rate" value={`${(row.conversion_rate * 100).toFixed(2)}%`} highlight={isWinner} />
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
}

function Metric({ label, value, highlight }) {
    return (
        <div className="text-right">
            <p className="text-overline" style={{ fontSize: "0.52rem" }}>{label}</p>
            <p
                className="font-mono text-base mt-0.5"
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
                        data-testid={`experiments-window-${opt.key}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
