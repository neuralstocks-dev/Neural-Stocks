import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Sparkles, ArrowUpRight } from "lucide-react";
import api from "../lib/api";

// Mirror of backend `_confluence_quality()` tier thresholds — kept small
// because we already have one source of truth in `ConfluenceChip.jsx`. If a
// third place wants the same mapping it should be hoisted into a shared util.
const TIER_STYLE = {
    excellent: { label: "Excellent", color: "hsl(var(--buy))" },
    strong:    { label: "Strong",    color: "hsl(var(--buy))" },
    moderate:  { label: "Moderate",  color: "hsl(var(--hold))" },
    weak:      { label: "Weak",      color: "hsl(var(--text-muted))" },
};

const DIRECTION_STYLE = {
    bullish:    { color: "hsl(var(--buy))",  label: "BULLISH" },
    bearish:    { color: "hsl(var(--sell))", label: "BEARISH" },
    divergence: { color: "hsl(var(--hold))", label: "DIVERGENCE" },
};

function ageLabel(days) {
    if (days == null) return "—";
    if (days === 0) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    return `${Math.round(days / 30)}mo ago`;
}

function fmtPrice(value, currency) {
    if (value == null) return "—";
    if (currency === "IDR") return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
    return `${currency || "$"} ${Number(value).toLocaleString()}`;
}

/**
 * Active leaderboard surfacing the user's highest-conviction IDX confluences
 * across the past `days` window (default 7). Renders only when the user has
 * at least one IDX analysis with a quality_score in the period — silent
 * otherwise so US-only traders don't see an empty IDX module.
 */
export default function TopConfluencesModule({ days = 7, limit = 3 }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { data } = await api.get(
                    `/idx/top-confluences?limit=${limit}&days=${days}`
                );
                if (alive) setData(data);
            } catch (e) {
                if (alive) setError(e?.response?.data?.detail || "Failed to load");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [days, limit]);

    // Silent on no-data — avoids cluttering dashboards for US-only traders.
    if (!loading && (!data || !data.items?.length)) return null;
    if (error) return null;

    return (
        <section
            className="module p-5 md:p-6 mt-4"
            data-testid="top-confluences-module"
        >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Sparkles size={11} strokeWidth={1.5} />
                        Top IDX confluences · last {days} days
                    </p>
                    <h2
                        className="font-serif text-2xl md:text-3xl mt-1"
                        style={{ letterSpacing: "-0.015em" }}
                    >
                        Highest-conviction setups
                    </h2>
                </div>
                {data && (
                    <span
                        className="font-mono text-[10px]"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        {data.unique_tickers} ticker{data.unique_tickers === 1 ? "" : "s"} scanned
                    </span>
                )}
            </div>

            {loading ? (
                <div className="py-8 text-center" data-testid="top-confluences-loading">
                    <Loader2 className="animate-spin mx-auto" size={16} />
                </div>
            ) : (
                <div
                    className="mt-4"
                    style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                    data-testid="top-confluences-list"
                >
                    {data.items.map((row, i) => {
                        const tier = TIER_STYLE[row.quality_tier] || TIER_STYLE.moderate;
                        const dir = DIRECTION_STYLE[row.direction] || DIRECTION_STYLE.bullish;
                        return (
                            <Link
                                to={`/analysis/${row.ticker}`}
                                key={row.analysis_id}
                                className="grid grid-cols-12 items-center gap-3 px-1 py-4 hover:bg-[hsl(var(--surface-elevated))] transition-colors"
                                style={{
                                    borderBottom:
                                        i === data.items.length - 1
                                            ? "none"
                                            : "1px solid hsl(var(--border-divider))",
                                }}
                                data-testid={`top-confluence-row-${row.ticker}`}
                            >
                                {/* Rank chevron */}
                                <div
                                    className="col-span-1 font-mono text-xs"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    {String(i + 1).padStart(2, "0")}
                                </div>

                                {/* Ticker + company */}
                                <div className="col-span-4">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-medium">{row.ticker}</span>
                                        <span
                                            className="font-mono px-1.5 py-0.5"
                                            style={{
                                                fontSize: "0.55rem",
                                                letterSpacing: "0.08em",
                                                color: "hsl(var(--bg))",
                                                background: dir.color,
                                            }}
                                        >
                                            {dir.label}
                                        </span>
                                    </div>
                                    {row.company_name && (
                                        <p
                                            className="text-[11px] mt-0.5 line-clamp-1"
                                            style={{ color: "hsl(var(--text-muted))" }}
                                        >
                                            {row.company_name}
                                        </p>
                                    )}
                                </div>

                                {/* Quality score (the headline number) */}
                                <div className="col-span-3 flex flex-col items-start">
                                    <span
                                        className="font-mono text-overline"
                                        style={{ fontSize: "0.55rem", color: "hsl(var(--text-muted))" }}
                                    >
                                        QUALITY
                                    </span>
                                    <div className="flex items-baseline gap-1.5">
                                        <span
                                            className="font-serif"
                                            style={{
                                                fontSize: "1.5rem",
                                                lineHeight: 1,
                                                color: tier.color,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {row.quality_score}
                                        </span>
                                        <span
                                            className="font-mono"
                                            style={{
                                                fontSize: "0.6rem",
                                                color: "hsl(var(--text-muted))",
                                            }}
                                        >
                                            /100
                                        </span>
                                        <span
                                            className="font-mono uppercase ml-1"
                                            style={{
                                                fontSize: "0.55rem",
                                                letterSpacing: "0.08em",
                                                color: tier.color,
                                            }}
                                        >
                                            {tier.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Insider freshness + price */}
                                <div className="col-span-3">
                                    <p
                                        className="font-mono text-[10px]"
                                        style={{ color: "hsl(var(--text-muted))" }}
                                    >
                                        INSIDER FILED
                                    </p>
                                    <p className="font-mono text-xs mt-0.5">
                                        {ageLabel(row.freshness_age_days)}
                                    </p>
                                    <p
                                        className="font-mono text-[10px] mt-1"
                                        style={{ color: "hsl(var(--text-muted))" }}
                                        title={`Price at analysis · analyzed ${ageLabel(
                                            Math.floor(
                                                (Date.now() - new Date(row.created_at).getTime()) /
                                                    86400000,
                                            ),
                                        )}`}
                                    >
                                        {fmtPrice(row.price_at_analysis, row.currency)}
                                    </p>
                                </div>

                                {/* Open arrow */}
                                <div className="col-span-1 flex justify-end">
                                    <ArrowUpRight
                                        size={14}
                                        strokeWidth={1.5}
                                        style={{ color: "hsl(var(--text-muted))" }}
                                    />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
