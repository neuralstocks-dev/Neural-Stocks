import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import VerdictRing from "@/components/VerdictRing";
import SignalBadge from "@/components/SignalBadge";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatPrice, formatPct, timeAgo } from "@/lib/format";

function StatusPill({ status }) {
    const map = {
        pending: { c: "hsl(var(--text-muted))", bg: "hsl(var(--surface-elevated))", label: "PENDING" },
        hit: { c: "hsl(var(--buy))", bg: "hsl(var(--buy-bg))", label: "HIT" },
        miss: { c: "hsl(var(--sell))", bg: "hsl(var(--sell-bg))", label: "MISS" },
        unresolvable: { c: "hsl(var(--text-muted))", bg: "hsl(var(--surface-elevated))", label: "N/A" },
    };
    const m = map[status] || map.pending;
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

function BandTable({ bands, testid }) {
    if (!bands) return null;
    const entries = Object.entries(bands);
    const anyResolved = entries.some(([, b]) => b.hits + b.misses > 0);
    if (!anyResolved) {
        return (
            <p className="text-sm py-4" style={{ color: "hsl(var(--text-muted))" }}>
                No resolved verdicts in any confidence band yet.
            </p>
        );
    }
    return (
        <div className="overflow-x-auto" data-testid={testid}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                    <tr>
                        {["Confidence band", "Hit rate", "Resolved", "Total"].map((h) => (
                            <th
                                key={h}
                                className="text-left text-overline py-2 px-3"
                                style={{ background: "hsl(var(--surface-elevated))", fontSize: "0.56rem" }}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {entries.map(([label, b]) => (
                        <tr key={label} style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                            <td className="py-2 px-3 font-mono text-xs">{label}</td>
                            <td
                                className="py-2 px-3 font-mono"
                                style={{
                                    color:
                                        b.hit_rate == null
                                            ? "hsl(var(--text-muted))"
                                            : b.hit_rate >= 60
                                            ? "hsl(var(--buy))"
                                            : b.hit_rate >= 40
                                            ? "hsl(var(--hold))"
                                            : "hsl(var(--sell))",
                                }}
                            >
                                {b.hit_rate != null ? `${b.hit_rate}%` : "\u2014"}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                                {b.hits}/{b.hits + b.misses}
                            </td>
                            <td className="py-2 px-3 font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                {b.total}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function ScorecardPage() {
    const [me, setMe] = useState(null);
    const [global, setGlobal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [bandView, setBandView] = useState("final");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                // Promise.allSettled, not Promise.all: /global aggregates
                // across the whole platform and can legitimately be slower
                // or briefly unavailable under load. If it fails, the user
                // should still see their own scorecard (which only needs
                // /me) rather than a fully blank page. A partial failure
                // here is not equivalent to a total failure.
                const [mResult, gResult] = await Promise.allSettled([
                    api.get("/scorecard/me"),
                    api.get("/scorecard/global"),
                ]);
                if (cancelled) return;
                if (mResult.status === "fulfilled") {
                    setMe(mResult.value.data);
                } else {
                    console.error("[Scorecard] /scorecard/me failed:", mResult.reason);
                }
                if (gResult.status === "fulfilled") {
                    setGlobal(gResult.value.data);
                } else {
                    console.error("[Scorecard] /scorecard/global failed:", gResult.reason);
                    // Leave `global` as null — the benchmark section already
                    // guards every field with `gs?.` and renders "—" when
                    // gs is null, so this degrades visually rather than crashing.
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const s = me?.summary;
    const gs = global?.summary;
    const overall = s?.hit_rate;

    return (
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="scorecard-page">
            <p className="text-overline">Accuracy Scorecard &middot; beta</p>
            <h1 className="font-serif hero-number mt-3" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>
                How often is the AI <em className="italic" style={{ color: "hsl(var(--buy))" }}>right?</em>
            </h1>
            <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                Each verdict is graded exactly once, permanently, the moment its own stated
                time horizon (2 to 12 weeks, set per-analysis) elapses. A BUY is a hit if the
                stock gained &ge; {s?.threshold_pct ?? 5}% by that date. A SELL is a hit if it fell
                by the same. HOLD hits when price stayed inside that band. Nothing is re-graded
                against today's price after the fact &mdash; once resolved, a grade doesn't move.
            </p>

            {loading && (
                <div className="py-20 text-center">
                    <Loader2 className="animate-spin mx-auto" size={22} />
                </div>
            )}

            {!loading && s && (
                <>
                    {(s.total === 0 || s.resolved === 0) && (
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
                                    ? "Run at least one analysis \u2014 then check back once its horizon passes."
                                    : `You have ${s.pending} verdict${s.pending !== 1 ? "s" : ""} still inside its horizon.`}
                            </h2>
                            <p className="mt-3 text-sm max-w-3xl" style={{ color: "hsl(var(--text-secondary))" }}>
                                <strong>This page only scores a verdict once the AI's own stated time
                                horizon for it has passed</strong> &mdash; typically 2&ndash;12 weeks, set individually
                                per analysis based on mode and market conditions. Anything still inside
                                its window shows as <em>pending</em> and doesn't count toward accuracy yet.
                                Once a verdict resolves, that grade is permanent &mdash; it's never recomputed
                                against a later price.
                            </p>

                            <div
                                className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-0"
                                style={{ border: "1px solid hsl(var(--border-default))" }}
                            >
                                <div className="p-4" style={{ borderRight: "1px solid hsl(var(--border-default))" }}>
                                    <p className="text-overline" style={{ fontSize: "0.58rem" }}>Hit threshold</p>
                                    <p className="mt-1.5 font-mono text-sm">&plusmn;{s.threshold_pct}%</p>
                                </div>
                                <div className="p-4" style={{ borderRight: "1px solid hsl(var(--border-default))" }}>
                                    <p className="text-overline" style={{ fontSize: "0.58rem" }}>You have</p>
                                    <p className="mt-1.5 font-mono text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                                        {s.total} verdict{s.total !== 1 ? "s" : ""}
                                    </p>
                                </div>
                                <div className="p-4">
                                    <p className="text-overline" style={{ fontSize: "0.58rem" }}>Still inside horizon</p>
                                    <p className="mt-1.5 font-mono text-sm" style={{ color: "hsl(var(--hold))" }}>
                                        {s.pending} pending
                                    </p>
                                </div>
                            </div>

                            {s.total === 0 ? (
                                <Link to="/dashboard" className="btn-primary mt-6 inline-flex">
                                    Run your first analysis &rarr;
                                </Link>
                            ) : null}
                        </section>
                    )}

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
                                <p className="text-xs mt-4 font-mono" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {s.hits} hits &middot; {s.misses} misses &middot; {s.pending} pending
                                    {s.unresolvable > 0 ? ` \u00b7 ${s.unresolvable} unresolvable` : ""} &middot; {s.total} total
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
                                            {r.hit_rate != null ? `${r.hit_rate}%` : "\u2014"}
                                        </div>
                                        <p className="text-overline mt-1" style={{ fontSize: "0.56rem" }}>
                                            {r.hits}/{r.hits + r.misses} resolved &middot; {r.total} total
                                        </p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="col-span-12 module mt-1 md:mt-0 p-5 md:p-6 flex items-center justify-between flex-wrap gap-3" data-testid="scorecard-global">
                            <div>
                                <p className="text-overline">Platform benchmark</p>
                                <p className="font-serif text-xl md:text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    Across all Neural users &middot;{" "}
                                    <span className="font-mono">
                                        {gs?.hit_rate != null ? `${gs.hit_rate}%` : "\u2014"} hit rate
                                    </span>
                                </p>
                            </div>
                            <p className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                                {gs?.hits || 0} hits &middot; {gs?.misses || 0} misses &middot; {gs?.pending || 0} pending &middot; {gs?.total || 0} total
                            </p>
                        </div>
                    </section>

                    <section className="module mt-6 md:mt-8" data-testid="scorecard-confidence-bands">
                        <div className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                            <div>
                                <p className="text-overline">Is confidence actually meaningful?</p>
                                <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    Hit rate by confidence band
                                </h2>
                                <p className="mt-2 text-sm max-w-2xl" style={{ color: "hsl(var(--text-secondary))" }}>
                                    If the 75-89 and 90-100 bands don't clearly outperform the lower bands,
                                    the confidence score isn't telling you what you think it's telling you.
                                    75+ is also the threshold that triggers Telegram alerts elsewhere in the app.
                                </p>
                            </div>
                            {me?.summary && (
                                <div
                                    className="inline-flex"
                                    style={{ border: "1px solid hsl(var(--border-default))", borderRadius: 2, overflow: "hidden" }}
                                >
                                    {[
                                        { key: "final", label: "Final (calibrated)" },
                                        { key: "pre_calibration", label: "Pre-calibration" },
                                    ].map((opt, i) => {
                                        const active = bandView === opt.key;
                                        return (
                                            <button
                                                key={opt.key}
                                                type="button"
                                                onClick={() => setBandView(opt.key)}
                                                className="font-mono text-[0.68rem] px-3 py-1.5 transition-colors"
                                                style={{
                                                    background: active ? "hsl(var(--hold))" : "hsl(var(--surface))",
                                                    color: active ? "hsl(var(--surface))" : "hsl(var(--text-primary))",
                                                    borderLeft: i === 0 ? "none" : "1px solid hsl(var(--border-default))",
                                                    letterSpacing: "0.04em",
                                                    fontWeight: active ? 600 : 400,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="px-5 md:px-6 pb-2">
                            <BandTable
                                bands={
                                    bandView === "final"
                                        ? s.by_confidence_band
                                        : s.by_confidence_band_pre_calibration
                                }
                                testid="scorecard-band-table"
                            />
                            <p className="text-xs pb-4" style={{ color: "hsl(var(--text-muted))" }}>
                                {bandView === "final"
                                    ? "Bucketed by the confidence score actually shown to you, after the earnings-proximity and RF-disagreement calibration rules run."
                                    : "Bucketed by the AI's raw confidence before calibration adjustments. Compare against the calibrated view \u2014 if calibration is working, this view should look less well-sorted than the calibrated one."}
                            </p>
                        </div>
                    </section>

                    <section className="module mt-6 md:mt-8" data-testid="scorecard-verdicts">
                        <div className="p-5 md:p-6" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                            <p className="text-overline">Your verdicts &middot; most recent first</p>
                            <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                Verdict history
                            </h2>
                        </div>

                        {me.verdicts.length === 0 ? (
                            <div className="py-12 text-center text-[hsl(var(--text-muted))]">
                                <p className="text-overline">No verdicts yet</p>
                                <Link to="/dashboard" className="btn-primary mt-6 inline-flex">
                                    Run your first analysis &rarr;
                                </Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            {["Ticker", "Signal", "Confidence", "Issued", "Horizon", "Entry", "Resolved at", "Return", "Status"].map((h) => (
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
                                                        <Link to={`/analysis/${v.ticker}`} className="font-mono text-sm link-underline">
                                                            {v.ticker}
                                                        </Link>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <SignalBadge signal={v.recommendation} />
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                                                        {v.confidence_score != null ? `${v.confidence_score}%` : "\u2014"}
                                                        {v.confidence_score_pre_calibration != null &&
                                                            v.confidence_score_pre_calibration !== v.confidence_score && (
                                                                <span style={{ color: "hsl(var(--text-muted))" }}>
                                                                    {" "}(was {v.confidence_score_pre_calibration}%)
                                                                </span>
                                                            )}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                                                        {timeAgo(v.created_at)}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                                                        {v.time_horizon_weeks ? `${v.time_horizon_weeks}w` : "\u2014"}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono">
                                                        {formatPrice(v.price_at_analysis, v.currency)}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono" style={{ color: "hsl(var(--text-secondary))" }}>
                                                        {v.resolution_price != null
                                                            ? formatPrice(v.resolution_price, v.currency)
                                                            : "\u2014"}
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
                                                        {arrow} {ret != null ? formatPct(ret) : "\u2014"}
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
                        {s.methodology}
                    </p>
                </>
            )}
        </div>
    );
}
