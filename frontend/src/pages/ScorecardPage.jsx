import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import VerdictRing from "@/components/VerdictRing";
import SignalBadge from "@/components/SignalBadge";
import { Loader2, Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatPrice, formatPct, timeAgo } from "@/lib/format";

function StatusPill({ status }) {
    const map = {
        pending: { c: "hsl(var(--text-muted))", bg: "hsl(var(--surface-elevated))", label: "PENDING" },
        hit: { c: "hsl(var(--buy))", bg: "hsl(var(--buy-bg))", label: "HIT" },
        miss: { c: "hsl(var(--sell))", bg: "hsl(var(--sell-bg))", label: "MISS" },
        stale: { c: "hsl(var(--text-muted))", bg: "hsl(var(--surface-elevated))", label: "STALE" },
    };
    const m = map[status] || map.stale;
    return (
        <span
            className="font-mono text-[0.62rem] px-2 py-0.5"
            style={{
                color: m.c,
                background: m.bg,
                border: `1px solid ${m.c}`,
                letterSpacing: "0.14em",
                borderRadius: 2,
            }}
        >
            {m.label}
        </span>
    );
}

const TIMEFRAME_OPTIONS = [
    { value: 7, label: "7 days", short: "7D" },
    { value: 30, label: "1 month", short: "1M" },
    { value: 90, label: "3 months", short: "3M" },
];

export default function ScorecardPage() {
    const [me, setMe] = useState(null);
    const [global, setGlobal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState(7);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [m, g] = await Promise.all([
                    api.get(`/scorecard/me?timeframe=${timeframe}`),
                    api.get(`/scorecard/global?timeframe=${timeframe}`),
                ]);
                if (cancelled) return;
                setMe(m.data);
                setGlobal(g.data);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [timeframe]);

    const s = me?.summary;
    const gs = global?.summary;

    const overall = s?.hit_rate;

    return (
        <AppShell>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="scorecard-page">
                <p className="text-overline">Accuracy Scorecard · beta</p>
                <h1 className="font-serif hero-number mt-3" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>
                    How often is the AI <em className="italic" style={{ color: "hsl(var(--buy))" }}>right?</em>
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Every verdict is scored against the market after {me?.summary?.min_age_days || 7} days.
                    A BUY is a hit if the stock gained ≥ {me?.summary?.threshold_pct || 5}%. A SELL is a hit if
                    it dropped by the same. HOLD hits when price stays inside that band.
                </p>

                {/* Timeframe filter */}
                <div
                    className="mt-6 flex items-center gap-3 flex-wrap"
                    data-testid="scorecard-timeframe-filter"
                >
                    <span
                        className="text-overline"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.58rem" }}
                    >
                        Evaluate after
                    </span>
                    <div
                        className="inline-flex"
                        style={{
                            border: "1px solid hsl(var(--border-default))",
                            borderRadius: 2,
                            overflow: "hidden",
                        }}
                    >
                        {TIMEFRAME_OPTIONS.map((opt, i) => {
                            const active = timeframe === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setTimeframe(opt.value)}
                                    data-testid={`scorecard-timeframe-${opt.value}`}
                                    className="font-mono text-xs px-4 py-2 transition-colors"
                                    style={{
                                        background: active
                                            ? "hsl(var(--hold))"
                                            : "hsl(var(--surface))",
                                        color: active
                                            ? "hsl(var(--surface))"
                                            : "hsl(var(--text-primary))",
                                        borderLeft:
                                            i === 0
                                                ? "none"
                                                : "1px solid hsl(var(--border-default))",
                                        letterSpacing: "0.08em",
                                        fontWeight: active ? 600 : 400,
                                        cursor: "pointer",
                                    }}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {loading && (
                    <div className="py-20 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                    </div>
                )}

                {!loading && s && (
                    <>
                        {/* "Why is this empty?" explainer — rendered when all verdicts are
                            still pending OR when we have zero verdicts. The common case after
                            a user's first week: they've run 5 analyses but none are ≥7 days
                            old yet, so everything is pending and `overall === null`. */}
                        {(s.total === 0 || s.pending === s.total) && (
                            <section
                                className="module mt-8 p-6 md:p-8"
                                style={{
                                    background: "hsla(38,75%,55%,0.05)",
                                    border: "1px solid hsl(var(--hold))",
                                    borderRadius: 2,
                                }}
                                data-testid="scorecard-empty-explainer"
                            >
                                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                                    Why you see no hits/misses yet
                                </p>
                                <h2 className="font-serif text-2xl md:text-3xl mt-2" style={{ letterSpacing: "-0.01em" }}>
                                    {s.total === 0
                                        ? "Run at least one analysis — then come back after a week."
                                        : `You have ${s.pending} verdict${s.pending !== 1 ? "s" : ""} cooking. None are ${me?.summary?.min_age_days || 7} days old yet.`}
                                </h2>
                                <p className="mt-3 text-sm max-w-3xl" style={{ color: "hsl(var(--text-secondary))" }}>
                                    <strong>This page only scores verdicts after they've had time to play out.</strong>{" "}
                                    We wait <strong>{me?.summary?.min_age_days || 7} days</strong> in the 7-day view,{" "}
                                    <strong>30 days</strong> in the 30-day view, and <strong>90 days</strong> in the
                                    90-day view. Anything younger shows up as <em>pending</em> and doesn't count
                                    toward accuracy. It's the most honest way to measure the AI — anything shorter and
                                    you'd just be grading on intraday noise.
                                </p>

                                <div
                                    className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-0"
                                    style={{ border: "1px solid hsl(var(--border-default))" }}
                                >
                                    <div className="p-4" style={{ borderRight: "1px solid hsl(var(--border-default))" }}>
                                        <p className="text-overline" style={{ fontSize: "0.58rem" }}>Min age</p>
                                        <p className="mt-1.5 font-mono text-sm">
                                            {me?.summary?.min_age_days || 7} days
                                        </p>
                                    </div>
                                    <div className="p-4" style={{ borderRight: "1px solid hsl(var(--border-default))" }}>
                                        <p className="text-overline" style={{ fontSize: "0.58rem" }}>Hit threshold</p>
                                        <p className="mt-1.5 font-mono text-sm">
                                            ±{me?.summary?.threshold_pct || 5}%
                                        </p>
                                    </div>
                                    <div className="p-4" style={{ borderRight: "1px solid hsl(var(--border-default))" }}>
                                        <p className="text-overline" style={{ fontSize: "0.58rem" }}>You have</p>
                                        <p className="mt-1.5 font-mono text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                                            {s.total} verdict{s.total !== 1 ? "s" : ""}
                                        </p>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-overline" style={{ fontSize: "0.58rem" }}>Still cooking</p>
                                        <p className="mt-1.5 font-mono text-sm" style={{ color: "hsl(var(--hold))" }}>
                                            {s.pending} pending
                                        </p>
                                    </div>
                                </div>

                                <p className="text-overline mt-6" style={{ fontSize: "0.58rem" }}>
                                    What you need to do
                                </p>
                                <ol className="mt-2 space-y-1.5 text-sm list-decimal list-inside" style={{ color: "hsl(var(--text-secondary))" }}>
                                    <li>
                                        <strong>Keep running analyses</strong> — every new verdict enters the pipeline
                                        and becomes eligible for scoring ~{me?.summary?.min_age_days || 7} days later.
                                    </li>
                                    <li>
                                        <strong>Come back after a week</strong>. The 7-day scorecard is the fastest view
                                        to populate — once your oldest verdict crosses the threshold, you'll see your
                                        first hit/miss appear here.
                                    </li>
                                    <li>
                                        <strong>Nothing else</strong>. There's no manual rating, no feedback button. The
                                        market resolves the verdicts automatically using closing prices — we just
                                        compare what the AI said on day T to where the price is on day T + {me?.summary?.min_age_days || 7}.
                                    </li>
                                </ol>

                                <p className="mt-5 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>
                                    Also check the <strong>30-day</strong> and <strong>90-day</strong> filters above —
                                    once you have verdicts old enough, they'll populate those views too.
                                </p>

                                {s.total === 0 ? (
                                    <Link to="/dashboard" className="btn-primary mt-6 inline-flex">
                                        Run your first analysis →
                                    </Link>
                                ) : null}
                            </section>
                        )}

                        {/* Hero stats */}
                        <section className="grid grid-cols-12 gap-1 md:gap-4 mt-10">
                            <div className="col-span-12 md:col-span-5 module p-6 md:p-8 flex flex-col md:flex-row items-center gap-6" data-testid="scorecard-hero">
                                <VerdictRing
                                    score={overall ?? 0}
                                    signal={overall == null ? "HOLD" : overall >= 60 ? "BUY" : overall >= 40 ? "HOLD" : "SELL"}
                                    size={180}
                                />
                                <div>
                                    <p className="text-overline">Your hit rate</p>
                                    <p
                                        className="font-serif mt-2"
                                        style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)", lineHeight: 1.1, letterSpacing: "-0.01em" }}
                                    >
                                        {overall != null
                                            ? `You're calling markets at ${overall}% accuracy.`
                                            : "Not enough resolved verdicts yet."}
                                    </p>
                                    <p
                                        className="text-xs mt-4 font-mono"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        {s.hits} hits · {s.misses} misses · {s.pending} pending · {s.total} total
                                    </p>
                                </div>
                            </div>

                            <div className="col-span-12 md:col-span-7 grid grid-cols-3 gap-1 md:gap-4">
                                {["BUY", "SELL", "HOLD"].map((rec) => {
                                    const r = s.by_recommendation[rec];
                                    return (
                                        <div key={rec} className="module p-5 md:p-6" data-testid={`scorecard-${rec.toLowerCase()}`}>
                                            <SignalBadge signal={rec} />
                                            <div className="font-mono hero-number mt-3" style={{ fontSize: "2.2rem" }}>
                                                {r.hit_rate != null ? `${r.hit_rate}%` : "—"}
                                            </div>
                                            <p className="text-overline mt-1" style={{ fontSize: "0.56rem" }}>
                                                {r.hits}/{r.hits + r.misses} resolved · {r.total} total
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Global benchmark */}
                            <div className="col-span-12 module mt-1 md:mt-0 p-5 md:p-6 flex items-center justify-between flex-wrap gap-3" data-testid="scorecard-global">
                                <div>
                                    <p className="text-overline">Platform benchmark</p>
                                    <p className="font-serif text-xl md:text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                        Across all Neural users ·{" "}
                                        <span className="font-mono">
                                            {gs?.hit_rate != null ? `${gs.hit_rate}%` : "—"} hit rate
                                        </span>
                                    </p>
                                </div>
                                <p className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                                    {gs?.hits || 0} hits · {gs?.misses || 0} misses · {gs?.pending || 0} pending · {gs?.total || 0} total
                                </p>
                            </div>
                        </section>

                        {/* Verdicts table */}
                        <section className="module mt-6 md:mt-8" data-testid="scorecard-verdicts">
                            <div
                                className="p-5 md:p-6"
                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                            >
                                <p className="text-overline">Your verdicts · most recent first</p>
                                <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    Verdict history
                                </h2>
                            </div>

                            {me.verdicts.length === 0 ? (
                                <div className="py-12 text-center text-[hsl(var(--text-muted))]">
                                    <p className="text-overline">No verdicts yet</p>
                                    <Link to="/dashboard" className="btn-primary mt-6 inline-flex">
                                        Run your first analysis →
                                    </Link>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr>
                                                {["Ticker", "Signal", "Issued", "Entry", "Target", "Current", "Return", "Status"].map((h) => (
                                                    <th
                                                        key={h}
                                                        className="text-left text-overline py-3 px-4"
                                                        style={{ background: "hsl(var(--surface-elevated))", fontSize: "0.56rem" }}
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {me.verdicts.map((v) => {
                                                const ret = v.return_pct;
                                                const arrow =
                                                    ret == null ? (
                                                        <Minus size={12} strokeWidth={1.5} />
                                                    ) : ret >= 0 ? (
                                                        <TrendingUp size={12} strokeWidth={1.5} />
                                                    ) : (
                                                        <TrendingDown size={12} strokeWidth={1.5} />
                                                    );
                                                return (
                                                    <tr
                                                        key={v.analysis_id}
                                                        style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                                        data-testid={`verdict-row-${v.ticker}`}
                                                    >
                                                        <td className="py-3 px-4">
                                                            <Link
                                                                to={`/analysis/${v.ticker}`}
                                                                className="font-mono text-sm link-underline"
                                                            >
                                                                {v.ticker}
                                                            </Link>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <SignalBadge signal={v.recommendation} />
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                                                            {timeAgo(v.created_at)}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono">
                                                            {formatPrice(v.price_at_analysis)}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono" style={{ color: "hsl(var(--text-secondary))" }}>
                                                            {formatPrice(v.price_target)}
                                                        </td>
                                                        <td className="py-3 px-4 font-mono">
                                                            {formatPrice(v.actual_price)}
                                                        </td>
                                                        <td
                                                            className="py-3 px-4 font-mono flex items-center gap-1"
                                                            style={{
                                                                color:
                                                                    ret == null
                                                                        ? "hsl(var(--text-muted))"
                                                                        : ret >= 0
                                                                        ? "hsl(var(--buy))"
                                                                        : "hsl(var(--sell))",
                                                            }}
                                                        >
                                                            {arrow} {ret != null ? formatPct(ret) : "—"}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <StatusPill status={v.status} />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <p
                            className="text-overline mt-8 text-center"
                            style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                        >
                            Methodology: Neural measures each verdict against the current market price vs.
                            the entry price. Beta scorecard · future versions will use the exact time-horizon-end price.
                        </p>
                    </>
                )}
            </div>
        </AppShell>
    );
}
