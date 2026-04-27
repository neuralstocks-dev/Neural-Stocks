import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
} from "recharts";
import {
    FlaskConical,
    TrendingUp,
    TrendingDown,
    ShieldAlert,
    RefreshCw,
    Loader2,
    Lock,
    ArrowUpRight,
} from "lucide-react";

const USD = (n) =>
    n == null
        ? "—"
        : n.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 2,
          });

const pctColor = (n) =>
    n == null
        ? "hsl(var(--text-muted))"
        : n > 0
        ? "hsl(var(--buy))"
        : n < 0
        ? "hsl(var(--sell))"
        : "hsl(var(--text-secondary))";

const fmtPct = (n, digits = 2) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

function Kpi({ label, value, sub, color, testid }) {
    return (
        <div
            className="p-4 md:p-5"
            style={{
                border: "1px solid hsl(var(--border-divider))",
                borderRadius: 2,
            }}
            data-testid={testid}
        >
            <p className="text-overline" style={{ fontSize: "0.58rem" }}>
                {label}
            </p>
            <div
                className="font-mono hero-number mt-2"
                style={{
                    fontSize: "clamp(1.4rem, 2.5vw, 1.9rem)",
                    color: color || "hsl(var(--text-primary))",
                    lineHeight: 1,
                }}
            >
                {value}
            </div>
            {sub && (
                <p
                    className="text-xs mt-2"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    {sub}
                </p>
            )}
        </div>
    );
}

function EquityTooltip({ active, payload }) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload || {};
    return (
        <div
            className="p-3 font-mono text-xs"
            style={{
                background: "hsl(var(--surface-elevated))",
                border: "1px solid hsl(var(--border-default))",
                borderRadius: 2,
            }}
        >
            <div
                className="text-overline mb-1"
                style={{ color: "hsl(var(--text-muted))" }}
            >
                {row.date}
            </div>
            <div style={{ color: "hsl(var(--hold))" }}>
                Portfolio: {USD(row.portfolio_value)}
            </div>
            {row.benchmark_value != null && (
                <div style={{ color: "hsl(var(--text-secondary))" }}>
                    Benchmark: {USD(row.benchmark_value)}
                </div>
            )}
        </div>
    );
}

function TradeRow({ trade }) {
    const winColor =
        trade.pnl_pct > 0
            ? "hsl(var(--buy))"
            : trade.pnl_pct < 0
            ? "hsl(var(--sell))"
            : "hsl(var(--text-secondary))";
    return (
        <tr
            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
            data-testid={`trade-row-${trade.ticker}-${trade.entry_at}`}
        >
            <td className="py-3 px-3 font-mono">
                <Link
                    to={`/analysis/${trade.ticker}`}
                    className="link-underline"
                    style={{ color: "hsl(var(--text-primary))" }}
                >
                    {trade.ticker}
                </Link>
            </td>
            <td
                className="py-3 px-3 font-mono text-xs"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {trade.entry_at}
            </td>
            <td
                className="py-3 px-3 font-mono text-xs text-right"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {trade.entry_price?.toFixed?.(2) ?? trade.entry_price}
            </td>
            <td
                className="py-3 px-3 font-mono text-xs"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {trade.exit_at}
            </td>
            <td
                className="py-3 px-3 font-mono text-xs text-right"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {trade.exit_price?.toFixed?.(2) ?? trade.exit_price}
            </td>
            <td
                className="py-3 px-3 text-right font-mono"
                style={{ color: winColor, fontWeight: 600 }}
            >
                {fmtPct(trade.pnl_pct)}
            </td>
            <td
                className="py-3 px-3 text-overline"
                style={{ fontSize: "0.58rem", color: "hsl(var(--text-muted))" }}
            >
                {trade.exit_reason === "sell_verdict"
                    ? "SELL SIGNAL"
                    : trade.exit_reason === "timeout_30d"
                    ? "30-DAY TIMEOUT"
                    : "WINDOW END"}
            </td>
        </tr>
    );
}

export default function BacktestPage() {
    const [data, setData] = useState(null);
    const [ml, setMl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [gated, setGated] = useState(false);

    const load = useCallback(async (force = false) => {
        setError("");
        try {
            const [r, rm] = await Promise.all([
                api.get(`/backtest/me${force ? "?force_refresh=true" : ""}`),
                api.get(`/backtest/ml`).catch(() => ({ data: null })),
            ]);
            setData(r.data);
            setMl(rm?.data || null);
            setGated(false);
        } catch (err) {
            if (err?.response?.status === 402) {
                setGated(true);
                setData(null);
                // Still load ML (public)
                try {
                    const rm = await api.get(`/backtest/ml`);
                    setMl(rm.data);
                } catch {
                    setMl(null);
                }
            } else {
                setError(
                    err?.response?.data?.detail || "Failed to load backtest."
                );
            }
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load(false);
            setLoading(false);
        })();
    }, [load]);

    const refresh = async () => {
        setRefreshing(true);
        await load(true);
        setRefreshing(false);
    };

    // Merge equity + benchmark curves for the chart on a shared date axis
    const chartData = useMemo(() => {
        if (!data?.equity_curve?.length) return [];
        const bench = Object.fromEntries(
            (data.benchmark_curve || []).map((p) => [p.date, p.benchmark_value])
        );
        return data.equity_curve.map((p) => ({
            date: p.date,
            portfolio_value: p.portfolio_value,
            benchmark_value: bench[p.date] ?? null,
        }));
    }, [data]);

    const m = data?.metrics || {};

    return (
        <>
            <div
                className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16"
                data-testid="backtest-page"
            >
                <p
                    className="text-overline flex items-center gap-2"
                    style={{ color: "hsl(var(--hold))" }}
                >
                    <FlaskConical size={12} strokeWidth={1.5} /> Track record ·
                    Live backtest
                </p>
                <h1
                    className="font-serif hero-number mt-3"
                    style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)" }}
                >
                    If you had followed{" "}
                    <em style={{ color: "hsl(var(--hold))" }}>every Neural Stock Intelligence™ verdict</em>…
                </h1>
                <p
                    className="mt-3 max-w-2xl text-base"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    A walk-through of the hypothetical portfolio that would have
                    resulted from following every BUY and SELL verdict Neural Stock Intelligence™
                    gave you — measured against a passive{" "}
                    {m.benchmark_ticker === "^JKSE" ? "IDX Composite" : "SPY"}{" "}
                    buy-and-hold over the same window.
                </p>

                {/* Beginner-friendly "How this works" block. Demystifies the
                    backtest for users who keep asking "but how do you prove
                    the win-rate?" — explains the simulation rules in plain
                    English with no jargon. */}
                <section
                    className="module mt-6 p-5 md:p-6"
                    data-testid="backtest-how-it-works"
                >
                    <p
                        className="text-overline"
                        style={{ color: "hsl(var(--hold))", fontSize: "0.6rem" }}
                    >
                        How this proves it (in plain English)
                    </p>
                    <p
                        className="font-serif mt-3"
                        style={{ fontSize: "1.25rem", letterSpacing: "-0.005em", lineHeight: 1.3 }}
                    >
                        Imagine you had $10,000 and acted on every Neural Stock Intelligence™ verdict the moment it
                        landed.
                    </p>
                    <p
                        className="text-sm mt-4 leading-relaxed"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        That's exactly what this page replays. We take your real verdict history,
                        simulate the trades a disciplined follower would have made, and compare the
                        result against simply buying the index{" "}
                        ({m.benchmark_ticker === "^JKSE" ? "IDX Composite" : "SPY"}) and holding.
                        No cherry-picking, no hindsight tweaks — every verdict counts, including
                        the losers.
                    </p>

                    <div
                        className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3"
                        data-testid="backtest-rules-grid"
                    >
                        {[
                            {
                                step: "1",
                                title: "Entry",
                                body: "When the AI says BUY, the simulation buys at the next daily close. Equal-weight: each position uses the same dollar amount, so one big winner can't dominate the math.",
                            },
                            {
                                step: "2",
                                title: "Exit",
                                body: "Position closes on the next SELL verdict for the same ticker, OR after 30 calendar days — whichever comes first. The 30-day cap prevents stale verdicts from running forever.",
                            },
                            {
                                step: "3",
                                title: "Cash buffer",
                                body: "Between trades the simulator holds cash (no interest, no benchmark drag). Your cash sits idle the same way real cash would in a brokerage account.",
                            },
                            {
                                step: "4",
                                title: "Benchmark",
                                body: "On the same first day, $10,000 is split into a single passive position in the benchmark and held for the whole window. That's the line you have to beat.",
                            },
                        ].map(({ step, title, body }) => (
                            <div
                                key={step}
                                className="p-4 flex items-start gap-3"
                                style={{
                                    border: "1px solid hsl(var(--border-default))",
                                    borderRadius: 2,
                                    background: "hsl(var(--surface-elevated))",
                                }}
                            >
                                <span
                                    className="font-mono text-xs flex items-center justify-center flex-shrink-0"
                                    style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 999,
                                        background: "hsl(var(--hold))",
                                        color: "hsl(var(--background))",
                                    }}
                                >
                                    {step}
                                </span>
                                <div>
                                    <p
                                        className="font-serif text-sm"
                                        style={{ letterSpacing: "-0.005em" }}
                                    >
                                        {title}
                                    </p>
                                    <p
                                        className="text-xs mt-1.5 leading-relaxed"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        {body}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p
                        className="text-xs mt-5 leading-relaxed"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        Win-rate = closed trades that ended profitable ÷ all closed trades.
                        Average winner / average loser tells you whether the strategy is
                        "right often" or "right big". A win-rate of just 50% can still be
                        very profitable if winners are 2× the size of losers — and vice versa.
                    </p>
                </section>

                {/* Disclaimer */}
                <section
                    className="module mt-6 p-5 md:p-6 flex items-start gap-4"
                    data-testid="backtest-disclaimer"
                >
                    <ShieldAlert
                        size={20}
                        strokeWidth={1.5}
                        style={{ color: "hsl(var(--hold))", flexShrink: 0, marginTop: 2 }}
                    />
                    <div className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        <strong style={{ color: "hsl(var(--text-primary))" }}>
                            Illustrative — not a forecast.
                        </strong>{" "}
                        This backtest simulates your actual verdict history assuming
                        equal-weight long-only entries at the next available daily
                        close after each BUY, with exits on SELL verdicts or a
                        {" "}30-day calendar timeout. It ignores commissions, slippage,
                        taxes, and dividends. Starting capital is a notional
                        $10,000. Past performance (simulated or real) does not
                        guarantee future results. Use this as a sanity check on
                        Neural Stock Intelligence™'s reasoning, not as a promise of returns.{" "}
                        <Link
                            to="/technical#random-forest"
                            className="link-underline"
                            style={{ color: "hsl(var(--hold))" }}
                        >
                            Read methodology →
                        </Link>
                    </div>
                </section>

                {/* Loading / Error / Gated / Empty */}
                {loading && (
                    <div
                        className="module mt-8 p-10 text-center"
                        data-testid="backtest-loading"
                    >
                        <Loader2
                            size={22}
                            className="animate-spin inline mr-2"
                            style={{ color: "hsl(var(--text-muted))" }}
                        />
                        <span style={{ color: "hsl(var(--text-secondary))" }}>
                            Computing your backtest…
                        </span>
                    </div>
                )}

                {!loading && gated && (
                    <section
                        className="module mt-8 p-8 md:p-10"
                        data-testid="backtest-gated"
                    >
                        <p
                            className="text-overline flex items-center gap-2"
                            style={{ color: "hsl(var(--hold))" }}
                        >
                            <Lock size={12} strokeWidth={1.5} /> Pro / Elite feature
                        </p>
                        <h2
                            className="font-serif mt-3"
                            style={{
                                fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            Unlock your personal track record.
                        </h2>
                        <p
                            className="mt-3 max-w-xl text-base"
                            style={{ color: "hsl(var(--text-secondary))" }}
                        >
                            Backtesting turns Neural Stock Intelligence™'s verdicts into a hypothetical
                            portfolio so you can see, honestly, whether following the
                            AI would have beaten the market or not. Upgrade to Pro
                            or Elite to unlock this page for your account.
                        </p>
                        <Link
                            to="/pricing"
                            className="btn-primary mt-6 inline-flex items-center gap-2"
                            data-testid="backtest-upgrade-cta"
                        >
                            View Pricing <ArrowUpRight size={14} strokeWidth={1.75} />
                        </Link>
                    </section>
                )}

                {!loading && !gated && error && (
                    <div
                        className="module mt-8 p-6"
                        data-testid="backtest-error"
                        style={{ color: "hsl(var(--sell))" }}
                    >
                        {error}
                    </div>
                )}

                {!loading && !gated && !error && data?.empty && (
                    <section
                        className="module mt-8 p-8 md:p-10"
                        data-testid="backtest-empty"
                    >
                        <p
                            className="text-overline"
                            style={{ color: "hsl(var(--hold))" }}
                        >
                            Not enough verdicts yet
                        </p>
                        <h2
                            className="font-serif mt-3"
                            style={{
                                fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
                                letterSpacing: "-0.01em",
                            }}
                        >
                            Run at least {data.min_required} analyses to unlock
                            your backtest.
                        </h2>
                        <p
                            className="mt-3 max-w-xl text-base"
                            style={{ color: "hsl(var(--text-secondary))" }}
                        >
                            You have <strong>{data.verdict_count}</strong>{" "}
                            {data.verdict_count === 1 ? "verdict" : "verdicts"} so
                            far. The longer you use Neural Stock Intelligence™, the more statistically
                            meaningful this backtest becomes — every new verdict
                            extends the simulation window.
                        </p>
                        <p
                            className="mt-4 max-w-xl text-xs leading-relaxed"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            Want to see what the result looks like before you build your own
                            history? Scroll down to the <strong>ML Backtest</strong> below — it
                            replays the Random-Forest secondary-opinion model on the last
                            12 months of price action and shows real win-rate numbers right now.
                        </p>
                        <Link
                            to="/dashboard"
                            className="btn-primary mt-6 inline-flex items-center gap-2"
                            data-testid="backtest-empty-cta"
                        >
                            Run an analysis <ArrowUpRight size={14} strokeWidth={1.75} />
                        </Link>
                    </section>
                )}

                {/* Main content */}
                {!loading && !gated && !error && !data?.empty && data && (
                    <>
                        {/* KPI row */}
                        <section
                            className="module mt-8 p-4 md:p-6"
                            data-testid="backtest-kpis"
                        >
                            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                                <div>
                                    <p
                                        className="text-overline"
                                        style={{ fontSize: "0.58rem" }}
                                    >
                                        Simulation window
                                    </p>
                                    <p
                                        className="font-mono text-sm mt-1"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        {m.window_start} → {m.window_end} · {m.window_days} days
                                    </p>
                                </div>
                                <button
                                    onClick={refresh}
                                    disabled={refreshing}
                                    className="btn-ghost !py-1.5 !px-3 text-xs inline-flex items-center gap-2"
                                    data-testid="backtest-refresh"
                                >
                                    {refreshing ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={12} strokeWidth={1.75} />
                                    )}
                                    {refreshing ? "Refreshing…" : "Refresh"}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                                <Kpi
                                    label="Total return"
                                    value={fmtPct(m.total_return_pct)}
                                    color={pctColor(m.total_return_pct)}
                                    sub={`Final: ${USD(m.final_value)}`}
                                    testid="kpi-total-return"
                                />
                                <Kpi
                                    label={`vs ${m.benchmark_ticker || "Benchmark"}`}
                                    value={
                                        m.alpha_pct == null
                                            ? "—"
                                            : fmtPct(m.alpha_pct)
                                    }
                                    color={pctColor(m.alpha_pct)}
                                    sub={`Benchmark: ${fmtPct(m.benchmark_return_pct)}`}
                                    testid="kpi-alpha"
                                />
                                <Kpi
                                    label="Win rate"
                                    value={
                                        m.win_rate_pct == null
                                            ? "—"
                                            : `${m.win_rate_pct.toFixed(0)}%`
                                    }
                                    sub={`${m.win_count}/${m.trade_count} trades`}
                                    color="hsl(var(--hold))"
                                    testid="kpi-win-rate"
                                />
                                <Kpi
                                    label="Max drawdown"
                                    value={fmtPct(m.max_drawdown_pct)}
                                    color={pctColor(m.max_drawdown_pct)}
                                    sub={`Avg hold: ${m.avg_hold_days ?? "—"} days`}
                                    testid="kpi-drawdown"
                                />
                            </div>
                        </section>

                        {/* Equity chart */}
                        <section
                            className="module mt-6 p-4 md:p-6"
                            data-testid="backtest-chart"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <h3
                                    className="font-serif"
                                    style={{
                                        fontSize: "1.3rem",
                                        letterSpacing: "-0.005em",
                                    }}
                                >
                                    Equity curve
                                </h3>
                                <p
                                    className="text-overline hidden md:block"
                                    style={{ fontSize: "0.58rem" }}
                                >
                                    NSI vs {m.benchmark_ticker || "Benchmark"}
                                </p>
                            </div>
                            {chartData.length >= 2 ? (
                                <div style={{ width: "100%", height: 320, minWidth: 1, minHeight: 1 }}>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                        <LineChart data={chartData} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
                                            <CartesianGrid
                                                stroke="hsl(var(--border-divider))"
                                                strokeDasharray="3 3"
                                            />
                                            <XAxis
                                                dataKey="date"
                                                tick={{ fontSize: 10, fill: "hsl(var(--text-muted))" }}
                                                minTickGap={40}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 10, fill: "hsl(var(--text-muted))" }}
                                                domain={["auto", "auto"]}
                                                tickFormatter={(v) =>
                                                    `$${Math.round(v).toLocaleString()}`
                                                }
                                                width={64}
                                            />
                                            <Tooltip content={<EquityTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                            <Line
                                                type="monotone"
                                                dataKey="portfolio_value"
                                                name="NSI portfolio"
                                                stroke="hsl(var(--hold))"
                                                strokeWidth={2}
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="benchmark_value"
                                                name={`${m.benchmark_ticker} buy & hold`}
                                                stroke="hsl(var(--text-muted))"
                                                strokeWidth={1.5}
                                                strokeDasharray="4 3"
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <p
                                    className="text-sm"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    Not enough data points yet to render the curve —
                                    run another analysis tomorrow and refresh.
                                </p>
                            )}
                            {data.strategy_note && (
                                <p
                                    className="text-xs mt-4"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    {data.strategy_note}
                                </p>
                            )}
                        </section>

                        {/* Trade log */}
                        <section
                            className="module mt-6 p-0 overflow-hidden"
                            data-testid="backtest-trades"
                        >
                            <div className="p-5 md:p-6">
                                <h3
                                    className="font-serif"
                                    style={{
                                        fontSize: "1.3rem",
                                        letterSpacing: "-0.005em",
                                    }}
                                >
                                    Trade log{" "}
                                    <span
                                        className="text-overline ml-2"
                                        style={{
                                            color: "hsl(var(--text-muted))",
                                            fontSize: "0.6rem",
                                        }}
                                    >
                                        {data.trades.length} total
                                    </span>
                                </h3>
                            </div>
                            {data.trades.length === 0 ? (
                                <div className="px-5 md:px-6 pb-6">
                                    <p
                                        className="text-sm"
                                        style={{ color: "hsl(var(--text-muted))" }}
                                    >
                                        No completed trades yet. Trades are opened on
                                        BUY verdicts and closed on SELL verdicts or a
                                        30-day timeout.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table
                                        className="w-full text-sm"
                                        style={{ borderCollapse: "collapse", minWidth: 720 }}
                                    >
                                        <thead>
                                            <tr>
                                                {[
                                                    "Ticker",
                                                    "Entry",
                                                    "Entry px",
                                                    "Exit",
                                                    "Exit px",
                                                    "P&L",
                                                    "Reason",
                                                ].map((h) => (
                                                    <th
                                                        key={h}
                                                        className="text-left text-overline py-3 px-3"
                                                        style={{
                                                            fontSize: "0.58rem",
                                                            background: "hsl(var(--surface-elevated))",
                                                            textAlign:
                                                                h === "Entry px" || h === "Exit px" || h === "P&L"
                                                                    ? "right"
                                                                    : "left",
                                                        }}
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...data.trades]
                                                .sort((a, b) =>
                                                    (b.entry_at || "").localeCompare(
                                                        a.entry_at || ""
                                                    )
                                                )
                                                .map((t, i) => (
                                                    <TradeRow
                                                        key={`${t.ticker}-${t.entry_at}-${i}`}
                                                        trade={t}
                                                    />
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        {/* Footer note */}
                        <div
                            className="mt-6 text-xs"
                            style={{ color: "hsl(var(--text-muted))" }}
                            data-testid="backtest-generated-at"
                        >
                            Snapshot generated at{" "}
                            {data.generated_at
                                ? new Date(data.generated_at).toLocaleString()
                                : "—"}
                            . Cached for 6 hours or until a new verdict arrives.
                        </div>
                    </>
                )}

                {/* ─────────── Neulab-ML walk-forward section ─────────── */}
                {ml && !ml.empty && (
                    <MlBacktestSection ml={ml} />
                )}
            </div>
        </>
    );
}

function MlBacktestSection({ ml }) {
    const m = ml?.metrics || {};
    const chartData = useMemo(() => {
        if (!ml?.equity_curve?.length) return [];
        const bench = Object.fromEntries(
            (ml.benchmark_curve || []).map((p) => [p.date, p.benchmark_value])
        );
        return ml.equity_curve.map((p) => ({
            date: p.date,
            portfolio_value: p.portfolio_value,
            benchmark_value: bench[p.date] ?? null,
        }));
    }, [ml]);

    return (
        <section
            className="mt-14"
            data-testid="ml-backtest-section"
        >
            <div
                style={{
                    borderTop: "1px solid hsl(var(--border-divider))",
                    paddingTop: 40,
                }}
            >
                <p
                    className="text-overline flex items-center gap-2"
                    style={{ color: "hsl(var(--hold))" }}
                >
                    <FlaskConical size={12} strokeWidth={1.5} /> NSI-ML ·
                    Walk-forward
                </p>
                <h2
                    className="font-serif mt-3"
                    style={{
                        fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                        letterSpacing: "-0.01em",
                    }}
                >
                    The model's honest track record.
                </h2>
                <p
                    className="mt-3 max-w-2xl text-base"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    A separate backtest of Neural Stock Intelligence™'s Random-Forest layer against
                    SPY. Monthly rebalance, top-{m.top_k} of {m.universe_size}{" "}
                    mega-cap names ranked by model probability, equal-weight,
                    pure-RF (no LLM). This is the same walk-forward window used
                    for the model's holdout accuracy on the{" "}
                    <Link
                        to="/technical#random-forest"
                        className="link-underline"
                        style={{ color: "hsl(var(--hold))" }}
                    >
                        Technical page
                    </Link>
                    .
                </p>

                {/* KPI */}
                <section
                    className="module mt-6 p-4 md:p-6"
                    data-testid="ml-backtest-kpis"
                >
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                        <div>
                            <p
                                className="text-overline"
                                style={{ fontSize: "0.58rem" }}
                            >
                                Walk-forward window
                            </p>
                            <p
                                className="font-mono text-sm mt-1"
                                style={{ color: "hsl(var(--text-secondary))" }}
                            >
                                {m.window_start} → {m.window_end} ·{" "}
                                {m.rebalance_count} rebalances
                            </p>
                        </div>
                        <p
                            className="text-xs"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            Auto-refreshed on each RF retrain
                        </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                        <Kpi
                            label="Strategy return"
                            value={fmtPct(m.total_return_pct)}
                            color={pctColor(m.total_return_pct)}
                            sub={`Final: ${USD(m.final_value)}`}
                            testid="ml-kpi-return"
                        />
                        <Kpi
                            label="vs SPY"
                            value={fmtPct(m.alpha_pct)}
                            color={pctColor(m.alpha_pct)}
                            sub={`SPY: ${fmtPct(m.benchmark_return_pct)}`}
                            testid="ml-kpi-alpha"
                        />
                        <Kpi
                            label="Win rate"
                            value={
                                m.win_rate_pct == null
                                    ? "—"
                                    : `${m.win_rate_pct.toFixed(0)}%`
                            }
                            sub={`${m.win_count}/${m.trade_count} trades`}
                            color="hsl(var(--hold))"
                            testid="ml-kpi-win"
                        />
                        <Kpi
                            label="Max drawdown"
                            value={fmtPct(m.max_drawdown_pct)}
                            color={pctColor(m.max_drawdown_pct)}
                            sub={`Top-${m.top_k} of ${m.universe_size}`}
                            testid="ml-kpi-drawdown"
                        />
                    </div>
                </section>

                {/* Chart */}
                <section
                    className="module mt-6 p-4 md:p-6"
                    data-testid="ml-backtest-chart"
                >
                    <h3
                        className="font-serif mb-3"
                        style={{
                            fontSize: "1.3rem",
                            letterSpacing: "-0.005em",
                        }}
                    >
                        Equity curve · ML vs SPY
                    </h3>
                    {chartData.length >= 2 ? (
                        <div style={{ width: "100%", height: 320, minWidth: 1, minHeight: 1 }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                <LineChart
                                    data={chartData}
                                    margin={{ top: 8, right: 18, bottom: 4, left: 0 }}
                                >
                                    <CartesianGrid
                                        stroke="hsl(var(--border-divider))"
                                        strokeDasharray="3 3"
                                    />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 10, fill: "hsl(var(--text-muted))" }}
                                        minTickGap={60}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10, fill: "hsl(var(--text-muted))" }}
                                        domain={["auto", "auto"]}
                                        tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`}
                                        width={64}
                                    />
                                    <Tooltip content={<EquityTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Line
                                        type="monotone"
                                        dataKey="portfolio_value"
                                        name={`NSI-ML top-${m.top_k}`}
                                        stroke="hsl(var(--buy))"
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="benchmark_value"
                                        name="SPY buy & hold"
                                        stroke="hsl(var(--text-muted))"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 3"
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p
                            className="text-sm"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            Not enough data points yet.
                        </p>
                    )}
                    {ml.strategy_note && (
                        <p
                            className="text-xs mt-4"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            {ml.strategy_note}
                        </p>
                    )}
                </section>

                <div
                    className="mt-4 text-xs"
                    style={{ color: "hsl(var(--text-muted))" }}
                    data-testid="ml-backtest-generated-at"
                >
                    RF trained{" "}
                    {ml.rf_trained_at
                        ? new Date(ml.rf_trained_at).toLocaleDateString()
                        : "—"}
                    · Backtest snapshot{" "}
                    {ml.generated_at
                        ? new Date(ml.generated_at).toLocaleDateString()
                        : "—"}
                    .
                </div>
            </div>
        </section>
    );
}
