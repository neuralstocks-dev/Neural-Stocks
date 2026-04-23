/**
 * TrendingOnNeulabWidget — dashboard social-proof module showing which
 * tickers the Neulab community is analysing right now. Each row is a
 * one-click autorun deep-link. Pure MongoDB aggregation — zero external
 * API calls.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, TrendingUp, Users2, Globe } from "lucide-react";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format";

const TABS = [
    { key: "all", label: "All markets" },
    { key: "idx", label: "IDX only" },
];

const WINDOWS = [
    { key: 7, label: "7d" },
    { key: 30, label: "30d" },
];

export default function TrendingOnNeulabWidget() {
    const [tab, setTab] = useState("all");
    const [windowDays, setWindowDays] = useState(7);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await api.get("/trending/neulab", {
                    params: {
                        window_days: windowDays,
                        limit: 8,
                        idx_only: tab === "idx",
                    },
                });
                if (!cancelled) setData(res.data);
            } catch {
                if (!cancelled) setData({ items: [], count: 0 });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tab, windowDays]);

    const items = data?.items || [];
    const totalUsers = useMemo(
        () => items.reduce((sum, it) => sum + (it.unique_users || 0), 0),
        [items]
    );

    if (!loading && items.length === 0) {
        // Don't render an empty widget on a brand-new install — nothing
        // worse than a social-proof module showing "0 investors".
        return null;
    }

    return (
        <section
            className="module p-5 md:p-8 mb-1 md:mb-4"
            data-testid="trending-on-neulab-widget"
        >
            <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Flame size={12} strokeWidth={1.5} style={{ color: "hsl(var(--accent-primary))" }} />
                        Trending on Neulab
                    </p>
                    <h2
                        className="font-serif mt-1"
                        style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.8rem)", letterSpacing: "-0.01em" }}
                    >
                        What the community is analysing
                    </h2>
                    <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                        {loading
                            ? "Loading the pulse…"
                            : `${totalUsers} investor${totalUsers === 1 ? "" : "s"} ran ${items.length} top verdict${items.length === 1 ? "" : "s"} in the last ${windowDays} days.`}
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <PillGroup
                        options={TABS}
                        value={tab}
                        onChange={setTab}
                        testPrefix="trending-tab"
                    />
                    <PillGroup
                        options={WINDOWS}
                        value={windowDays}
                        onChange={setWindowDays}
                        testPrefix="trending-window"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-3" data-testid="trending-rows">
                {items.map((it, i) => (
                    <TrendingRow key={it.ticker} row={it} rank={i + 1} />
                ))}
            </div>

            <p className="text-[11px] mt-5" style={{ color: "hsl(var(--text-muted))" }}>
                Ranked by unique analysts in the window. Deep-links run an autorun analysis with your plan's mode.
            </p>
        </section>
    );
}

function TrendingRow({ row, rank }) {
    const isIdx = (row.ticker || "").endsWith(".JK");
    const rec = row.latest_recommendation || "—";
    const conf = row.latest_confidence ?? null;
    const recColor = {
        BUY: "hsl(var(--buy))",
        SELL: "hsl(var(--sell))",
        HOLD: "hsl(var(--hold))",
    }[rec] || "hsl(var(--text-muted))";

    return (
        <Link
            to={`/analysis/${encodeURIComponent(row.ticker)}?autorun=1`}
            className="flex items-center gap-3 p-3 transition-all group"
            style={{
                background: "hsl(var(--surface-elevated))",
                border: "1px solid hsl(var(--border-divider))",
                borderRadius: 2,
            }}
            data-testid={`trending-row-${row.ticker}`}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "hsl(var(--accent-primary))"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "hsl(var(--border-divider))"; }}
        >
            <span
                className="font-mono text-xs flex-shrink-0 w-6 text-center"
                style={{ color: "hsl(var(--text-muted))" }}
            >
                {String(rank).padStart(2, "0")}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{row.ticker}</span>
                    {isIdx && (
                        <span
                            className="font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
                            style={{
                                color: "hsl(var(--hold))",
                                border: "1px solid hsl(var(--hold))",
                                fontSize: "0.5rem",
                                letterSpacing: "0.12em",
                                borderRadius: 2,
                            }}
                        >
                            <Globe size={8} strokeWidth={2.5} /> IDX
                        </span>
                    )}
                </div>
                <div className="text-[11px] truncate" style={{ color: "hsl(var(--text-secondary))" }}>
                    {row.latest_company_name || row.ticker}
                </div>
                <div
                    className="text-[11px] font-mono mt-1 flex items-center gap-2"
                    style={{ color: "hsl(var(--text-muted))" }}
                >
                    <span className="inline-flex items-center gap-1">
                        <Users2 size={9} strokeWidth={1.8} /> {row.unique_users} investor{row.unique_users === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                        <TrendingUp size={9} strokeWidth={1.8} /> {row.total_analyses} {row.total_analyses === 1 ? "analysis" : "analyses"}
                    </span>
                </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span
                    className="font-mono px-2 py-0.5"
                    style={{
                        color: recColor,
                        border: `1px solid ${recColor}`,
                        fontSize: "0.56rem",
                        letterSpacing: "0.12em",
                        borderRadius: 2,
                    }}
                >
                    {rec}{conf != null ? ` · ${conf}%` : ""}
                </span>
                {row.latest_price != null && (
                    <span className="text-[11px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                        {formatPrice(row.latest_price, row.latest_currency || "USD")}
                    </span>
                )}
            </div>
        </Link>
    );
}

function PillGroup({ options, value, onChange, testPrefix }) {
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
                        className="text-xs px-2.5 py-1 font-mono transition-colors"
                        style={{
                            color: active ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                            background: active ? "hsl(var(--surface-base))" : "transparent",
                            border: active ? "1px solid hsl(var(--border-default))" : "1px solid transparent",
                            borderRadius: 2,
                            letterSpacing: "0.05em",
                        }}
                        data-testid={`${testPrefix}-${opt.key}`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
