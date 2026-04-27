import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import VerdictRing from "@/components/VerdictRing";
import SignalBadge from "@/components/SignalBadge";
import PublicTrendingTicker from "@/components/PublicTrendingTicker";
import { Loader2, LineChart, AlertTriangle, Target, Shield, ArrowUpRight } from "lucide-react";
import { formatPrice, formatPct, timeAgo, formatCompact } from "@/lib/format";
import { API_BASE } from "@/lib/api";

const API = API_BASE;

export default function PublicVerdictPage() {
    const { shareId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/public/verdict/${shareId}`);
                setData(r.data);
            } catch (err) {
                setError(err?.response?.data?.detail || "Verdict not found");
            } finally {
                setLoading(false);
            }
        })();
    }, [shareId]);

    const a = data?.analysis;
    const signalColor = a?.recommendation === "BUY"
        ? "hsl(var(--buy))"
        : a?.recommendation === "SELL"
        ? "hsl(var(--sell))"
        : "hsl(var(--hold))";
    const currency = a?.quote_snapshot?.currency || "USD";

    return (
        <div className="min-h-screen grain" data-testid="public-verdict-page">
            <header
                className="sticky top-0 z-20"
                style={{
                    backdropFilter: "blur(14px)",
                    background: "hsl(var(--background) / 0.72)",
                    borderBottom: "1px solid hsl(var(--border-default))",
                }}
            >
                <div className="max-w-[1200px] mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3" data-testid="public-brand-link">
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                border: "1px solid hsl(var(--text-primary))",
                                display: "grid",
                                placeItems: "center",
                            }}
                        >
                            <LineChart size={14} strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="font-serif italic text-lg">Neural</span>
                            <span className="text-overline" style={{ fontSize: "0.56rem" }}>Stock Intelligence</span>
                        </div>
                    </Link>
                    <Link to="/signup" className="btn-primary !text-xs" data-testid="public-cta-signup">
                        Get your own verdicts <ArrowUpRight size={12} strokeWidth={1.5} />
                    </Link>
                </div>
            </header>

            <main className="max-w-[1200px] mx-auto px-5 md:px-8 pt-10 pb-20 relative z-10">
                {loading && (
                    <div className="py-24 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                        <p className="text-overline mt-4">Loading verdict…</p>
                    </div>
                )}
                {error && !loading && (
                    <div className="py-24 text-center">
                        <p className="text-overline" style={{ color: "hsl(var(--sell))" }}>
                            {error}
                        </p>
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                            This link may have been revoked or never existed.
                        </p>
                    </div>
                )}
                {!loading && a && (
                    <>
                        <p className="text-overline">
                            Shared by {data.shared_by_name} · {timeAgo(data.shared_at)}
                        </p>
                        <div className="mt-3 flex items-baseline gap-4 flex-wrap">
                            <h1
                                className="font-mono hero-number"
                                style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
                                data-testid="public-ticker"
                            >
                                {a.ticker}
                            </h1>
                            <span
                                className="font-serif italic"
                                style={{ fontSize: "clamp(1rem, 1.5vw, 1.4rem)", color: "hsl(var(--text-secondary))" }}
                            >
                                {a.quote_snapshot?.name || ""}
                            </span>
                            <Link
                                to={`/analysis/${encodeURIComponent(a.ticker)}?autorun=1`}
                                className="btn-ghost !text-xs inline-flex items-center gap-1 ml-auto"
                                data-testid="public-run-your-own"
                                title={`Log in or sign up, then we'll run your own AI analysis on ${a.ticker} immediately`}
                            >
                                Run your own on {a.ticker} <ArrowUpRight size={12} strokeWidth={1.5} />
                            </Link>
                        </div>

                        <section className="grid grid-cols-12 gap-1 md:gap-4 mt-8">
                            {/* Educational research banner — mirrors the
                                owner's web report so prospects landing on a
                                share link get the same framing. */}
                            <div
                                className="col-span-12 module p-5 md:p-6"
                                style={{
                                    borderLeft: "3px solid hsl(var(--hold))",
                                    background: "hsl(var(--surface-elevated))",
                                }}
                                data-testid="public-educational-banner"
                            >
                                <p
                                    className="text-overline"
                                    style={{ fontSize: "0.56rem", color: "hsl(var(--hold))" }}
                                >
                                    EDUCATIONAL RESEARCH REPORT
                                </p>
                                <p
                                    className="font-serif mt-2"
                                    style={{
                                        fontSize: "1.05rem",
                                        lineHeight: 1.55,
                                        letterSpacing: "-0.005em",
                                        color: "hsl(var(--text-primary))",
                                    }}
                                >
                                    This is a model-generated summary intended to help readers review market
                                    data, technical signals, and scenario analysis for a user-selected stock.
                                    It is <strong>not</strong> personalized financial advice and{" "}
                                    <strong>not</strong> a recommendation to buy, sell, or hold any security.
                                </p>
                                <p
                                    className="mt-2 text-sm"
                                    style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                                >
                                    <strong style={{ color: "hsl(var(--text-primary))" }}>Confidence</strong>{" "}
                                    refers to the model&apos;s internal classification strength based on the
                                    inputs used — <strong>not</strong> the probability of price movement or
                                    investment success.
                                </p>
                            </div>
                            <div className="col-span-12 md:col-span-5 module p-6 md:p-8 flex flex-col md:flex-row items-center gap-6" data-testid="public-verdict">
                                <VerdictRing
                                    score={a.confidence_score}
                                    signal={a.recommendation}
                                    size={180}
                                />
                                <div>
                                    <p className="text-overline">AI Verdict</p>
                                    <div className="mt-2">
                                        <SignalBadge signal={a.recommendation} size="lg" />
                                    </div>
                                    <p
                                        className="text-overline mt-1.5"
                                        style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                                    >
                                        Analytical bias · classification, not a trade instruction
                                    </p>
                                    <p
                                        className="font-serif mt-4"
                                        style={{ fontSize: "1.5rem", lineHeight: 1.15, letterSpacing: "-0.01em" }}
                                    >
                                        {a.executive_summary}
                                    </p>
                                    <p className="text-overline mt-4" style={{ fontSize: "0.56rem" }}>
                                        Issued {timeAgo(a.created_at)} · Horizon {a.time_horizon_weeks || 12}w · Price at analysis {formatPrice(a.price_at_analysis, currency)}
                                    </p>
                                </div>
                            </div>

                            <div className="col-span-12 md:col-span-7 grid grid-cols-2 gap-1 md:gap-4">
                                <div className="module p-5 md:p-6">
                                    <p className="text-overline flex items-center gap-2">
                                        <Target size={12} strokeWidth={1.5} /> Scenario level
                                    </p>
                                    <div className="font-mono hero-number mt-3" style={{ fontSize: "2rem" }}>
                                        {formatPrice(a.price_target, currency)}
                                    </div>
                                    <p
                                        className="text-[10px] mt-2"
                                        style={{ color: "hsl(var(--text-muted))", lineHeight: 1.5 }}
                                    >
                                        Illustrative directional reference — not a trade instruction.
                                    </p>
                                </div>
                                <div className="module p-5 md:p-6">
                                    <p className="text-overline flex items-center gap-2">
                                        <Shield size={12} strokeWidth={1.5} /> Invalidation level
                                    </p>
                                    <div className="font-mono hero-number mt-3" style={{ fontSize: "2rem" }}>
                                        {formatPrice(a.stop_loss, currency)}
                                    </div>
                                    <p
                                        className="text-[10px] mt-2"
                                        style={{ color: "hsl(var(--text-muted))", lineHeight: 1.5 }}
                                    >
                                        Level at which this read would weaken.
                                    </p>
                                </div>
                                <div className="module p-5 md:p-6 col-span-2">
                                    <p className="text-overline mb-3">Key snapshot</p>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <Metric label="Sector" value={a.fundamentals?.sector} mono={false} />
                                        <Metric label="Market Cap" value={formatCompact(a.fundamentals?.marketCap)} />
                                        <Metric label="P/E" value={a.fundamentals?.trailingPE?.toFixed?.(1)} />
                                        <Metric label="RSI" value={a.technicals?.rsi_14?.toFixed?.(1)} />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Verdict Accuracy v2 calibration block — mirrors the
                            audit trail visible to the verdict's owner in the
                            web report. Two states: amber/hold-bordered "fired"
                            with score breakdown + bullet adjustments + RF/
                            earnings source line, OR green/buy-bordered clean
                            empty-state stating both gates ran. Renders only
                            when calibration_version is present so older shares
                            don't display the block. */}
                        {(a.calibration_version === "v2" || Array.isArray(a.confidence_adjustments)) && (
                            <PublicCalibrationBlock analysis={a} />
                        )}

                        <section className="module p-6 md:p-10 mt-1 md:mt-4">
                            <p className="text-overline">Reasoning</p>
                            <h2
                                className="font-serif mt-2 mb-6"
                                style={{ fontSize: "clamp(1.7rem, 3vw, 2.4rem)", letterSpacing: "-0.015em" }}
                            >
                                Why this verdict.
                            </h2>
                            <div
                                className="dropcap text-base leading-relaxed"
                                style={{ color: "hsl(var(--text-primary))", maxWidth: "68ch" }}
                            >
                                {a.reasoning}
                            </div>
                        </section>

                        <section className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 mt-1 md:mt-4">
                            <article className="module p-6">
                                <p className="text-overline">Technical</p>
                                <h3 className="font-serif text-xl mt-2 mb-4">Momentum</h3>
                                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {a.technical_analysis}
                                </p>
                            </article>
                            <article className="module p-6">
                                <p className="text-overline">Fundamental</p>
                                <h3 className="font-serif text-xl mt-2 mb-4">Quality</h3>
                                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {a.fundamental_analysis}
                                </p>
                            </article>
                            <article className="module p-6">
                                <p className="text-overline">Peers</p>
                                <h3 className="font-serif text-xl mt-2 mb-4">Relative</h3>
                                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {a.peer_comparison}
                                </p>
                            </article>
                        </section>

                        <section className="module p-6 md:p-10 mt-1 md:mt-4">
                            <p className="text-overline flex items-center gap-2">
                                <AlertTriangle size={12} strokeWidth={1.5} /> Risks to the current interpretation
                            </p>
                            <h2
                                className="font-serif mt-2 mb-2"
                                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.015em" }}
                            >
                                Where the read could fail.
                            </h2>
                            <p
                                className="text-sm mb-6"
                                style={{ color: "hsl(var(--text-muted))", lineHeight: 1.55, maxWidth: "60ch" }}
                            >
                                Conditions under which the current model classification would weaken — not
                                exhaustive risks of holding the security.
                            </p>
                            <ol className="space-y-4">
                                {(a.risk_factors || []).map((r, i) => (
                                    <li
                                        key={`risk-${i}-${(r || "").slice(0, 30)}`}
                                        className="flex gap-4 pb-4"
                                        style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                    >
                                        <span
                                            className="font-mono text-xs mt-1"
                                            style={{ color: "hsl(var(--sell))", minWidth: "2rem" }}
                                        >
                                            R.{String(i + 1).padStart(2, "0")}
                                        </span>
                                        <p className="text-sm leading-relaxed flex-1">{r}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        {/* Alternative scenarios — silently skipped on older
                            shares without the field. */}
                        {a.alternative_scenarios && (
                            <section
                                className="module p-6 md:p-10 mt-1 md:mt-4"
                                data-testid="public-alt-scenarios"
                            >
                                <p className="text-overline">Alternative scenarios</p>
                                <h2
                                    className="font-serif mt-2 mb-2"
                                    style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.015em" }}
                                >
                                    How else this could read.
                                </h2>
                                <p
                                    className="text-sm mb-6"
                                    style={{ color: "hsl(var(--text-muted))", lineHeight: 1.55, maxWidth: "60ch" }}
                                >
                                    The same data can support multiple interpretations. Below are the
                                    conditions under which each direction would gain weight.
                                </p>
                                <div className="space-y-5">
                                    {a.alternative_scenarios.bullish && (
                                        <div
                                            className="p-4"
                                            style={{
                                                borderLeft: "3px solid hsl(var(--buy))",
                                                background: "hsl(var(--surface-elevated))",
                                            }}
                                        >
                                            <p
                                                className="text-overline"
                                                style={{ fontSize: "0.56rem", color: "hsl(var(--buy))" }}
                                            >
                                                Bullish scenario
                                            </p>
                                            <p className="mt-2 text-sm leading-relaxed">
                                                {a.alternative_scenarios.bullish}
                                            </p>
                                        </div>
                                    )}
                                    {a.alternative_scenarios.neutral && (
                                        <div
                                            className="p-4"
                                            style={{
                                                borderLeft: "3px solid hsl(var(--hold))",
                                                background: "hsl(var(--surface-elevated))",
                                            }}
                                        >
                                            <p
                                                className="text-overline"
                                                style={{ fontSize: "0.56rem", color: "hsl(var(--hold))" }}
                                            >
                                                Neutral scenario
                                            </p>
                                            <p className="mt-2 text-sm leading-relaxed">
                                                {a.alternative_scenarios.neutral}
                                            </p>
                                        </div>
                                    )}
                                    {a.alternative_scenarios.bearish && (
                                        <div
                                            className="p-4"
                                            style={{
                                                borderLeft: "3px solid hsl(var(--sell))",
                                                background: "hsl(var(--surface-elevated))",
                                            }}
                                        >
                                            <p
                                                className="text-overline"
                                                style={{ fontSize: "0.56rem", color: "hsl(var(--sell))" }}
                                            >
                                                Bearish scenario
                                            </p>
                                            <p className="mt-2 text-sm leading-relaxed">
                                                {a.alternative_scenarios.bearish}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        )}

                        {Array.isArray(a.what_could_change_view) && a.what_could_change_view.length > 0 && (
                            <section
                                className="module p-6 md:p-10 mt-1 md:mt-4"
                                data-testid="public-wccv"
                            >
                                <p className="text-overline">What could change the view</p>
                                <h2
                                    className="font-serif mt-2 mb-6"
                                    style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.015em" }}
                                >
                                    Concrete shifts to monitor.
                                </h2>
                                <ul className="space-y-3">
                                    {a.what_could_change_view.map((m, i) => (
                                        <li
                                            key={`wccv-${i}-${(m || "").slice(0, 30)}`}
                                            className="flex gap-3 text-sm leading-relaxed"
                                            style={{ color: "hsl(var(--text-primary))" }}
                                        >
                                            <span style={{ color: "hsl(var(--hold))" }}>·</span>
                                            <span className="flex-1">{m}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* How to read — canned legend so prospects landing
                            from social channels understand the framing. */}
                        <section
                            className="module p-6 md:p-10 mt-1 md:mt-4"
                            data-testid="public-how-to-read"
                        >
                            <p className="text-overline">How to read this report</p>
                            <h2
                                className="font-serif mt-2 mb-6"
                                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.015em" }}
                            >
                                A quick legend.
                            </h2>
                            <dl className="space-y-4 text-sm leading-relaxed">
                                <div className="grid grid-cols-12 gap-3">
                                    <dt
                                        className="col-span-12 md:col-span-3 text-overline"
                                        style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}
                                    >
                                        Analytical bias
                                    </dt>
                                    <dd className="col-span-12 md:col-span-9">
                                        The direction the model currently finds more evidence for. The
                                        BUY / SELL / HOLD label is an internal classification code — read it as{" "}
                                        <em>bullish</em>, <em>bearish</em>, or <em>neutral</em> research framing,
                                        not a trade instruction.
                                    </dd>
                                </div>
                                <div className="grid grid-cols-12 gap-3">
                                    <dt
                                        className="col-span-12 md:col-span-3 text-overline"
                                        style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}
                                    >
                                        Confidence
                                    </dt>
                                    <dd className="col-span-12 md:col-span-9">
                                        The strength of the model&apos;s classification based on the inputs
                                        available — <strong>not</strong> a forecast probability of price movement
                                        or trade success.
                                    </dd>
                                </div>
                                <div className="grid grid-cols-12 gap-3">
                                    <dt
                                        className="col-span-12 md:col-span-3 text-overline"
                                        style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}
                                    >
                                        Scenario level
                                    </dt>
                                    <dd className="col-span-12 md:col-span-9">
                                        An illustrative price reference matching the current model direction —
                                        for monitoring, not a buy/sell trigger.
                                    </dd>
                                </div>
                                <div className="grid grid-cols-12 gap-3">
                                    <dt
                                        className="col-span-12 md:col-span-3 text-overline"
                                        style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}
                                    >
                                        Invalidation level
                                    </dt>
                                    <dd className="col-span-12 md:col-span-9">
                                        The level at which the current interpretation would weaken or no longer
                                        hold.
                                    </dd>
                                </div>
                            </dl>
                            <p
                                className="mt-6 text-xs"
                                style={{ color: "hsl(var(--text-muted))", lineHeight: 1.6, maxWidth: "70ch" }}
                            >
                                This output is generated by an AI model from publicly available market data.
                                It is provided for informational and educational research use only, and does
                                not constitute financial advice, investment advice, a solicitation, or a
                                recommendation to buy, sell, or hold any security. Readers should conduct
                                their own research and, where appropriate, consult a licensed financial
                                professional.
                            </p>
                        </section>

                        <div
                            className="module mt-8 p-6 md:p-8 text-center"
                            style={{ borderColor: signalColor }}
                            data-testid="public-cta-bottom"
                        >
                            <p className="text-overline">Want your own verdicts?</p>
                            <h3
                                className="font-serif mt-3"
                                style={{ fontSize: "clamp(1.4rem, 2.5vw, 1.8rem)", letterSpacing: "-0.01em" }}
                            >
                                Track up to 5 stocks free on <em className="italic" style={{ color: signalColor }}>Neural</em>.
                            </h3>

                            <div className="mt-5 max-w-2xl mx-auto">
                                <PublicTrendingTicker
                                    windowDays={7}
                                    limit={8}
                                    idxOnly={(a.ticker || "").toUpperCase().endsWith(".JK")}
                                    ctaHref={null}
                                />
                            </div>

                            <Link to="/signup" className="btn-primary mt-5 inline-flex">
                                Create your account →
                            </Link>
                        </div>

                        <p
                            className="text-overline mt-8 text-center"
                            style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                        >
                            Shared via Neural · Educational use only · Not financial advice
                        </p>
                    </>
                )}
            </main>
        </div>
    );
}

function Metric({ label, value, mono = true }) {
    return (
        <div>
            <p className="text-overline" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p className={`text-lg mt-1 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p>
        </div>
    );
}

/**
 * PublicCalibrationBlock — read-only mirror of the AnalysisReportPage
 * calibration breadcrumb, designed for prospects landing on a share link.
 * Two states:
 *   - Fired (any confidence_adjustments): hold-bordered card with title,
 *     score breakdown line `LLM raw 78 → −12 → 66 final`, bullet list of
 *     each adjustment, academic source for the rule that fired (RF
 *     probabilities + Krauss/Do/Huck citation, or earnings-window cap).
 *   - Clean: buy-bordered card with explicit "no calibration needed" copy.
 * No interactive drawer (the public view is consumption-only) — the
 * source-of-truth deep-dive lives at /technical#confidence-calibration.
 */
function PublicCalibrationBlock({ analysis }) {
    const adj = Array.isArray(analysis.confidence_adjustments)
        ? analysis.confidence_adjustments
        : [];
    const fired = adj.length > 0;
    const pre = analysis.confidence_score_pre_calibration;
    const final = analysis.confidence_score;
    const showBreakdown =
        fired &&
        typeof pre === "number" &&
        typeof final === "number" &&
        pre !== final;

    const accent = fired ? "hold" : "buy";
    const rfPen = analysis.rf_disagreement_penalty;
    const eg = analysis.earnings_gate_applied;
    const rfOp = analysis.rf_opinion || {};
    const rfUp = rfOp.prob_up;
    const rfDown = rfOp.prob_down;
    const rfHorizon = rfOp.horizon_days || 20;
    const days = analysis.days_until_earnings;

    return (
        <section
            className="mt-1 md:mt-4 p-5 md:p-6"
            style={{
                border: "1px solid hsl(var(--border-default))",
                borderLeft: `3px solid hsl(var(--${accent}))`,
                background: "hsl(var(--surface-elevated))",
                borderRadius: 2,
            }}
            data-testid="public-calibration-block"
        >
            <p
                className="text-overline"
                style={{ color: `hsl(var(--${accent}))`, fontSize: "0.56rem" }}
            >
                {fired
                    ? "POST-LLM CALIBRATION · CONFIDENCE ADJUSTED"
                    : "POST-LLM CALIBRATION · NO ADJUSTMENT NEEDED"}
            </p>
            <h3
                className="font-serif mt-1"
                style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}
            >
                Verdict Accuracy v2
            </h3>

            {showBreakdown && (
                <div
                    className="mt-3 inline-flex items-center gap-2 font-mono"
                    style={{ fontSize: "0.78rem" }}
                    data-testid="public-score-breakdown"
                >
                    <span style={{ color: "hsl(var(--text-muted))" }}>LLM raw</span>
                    <span style={{ color: "hsl(var(--text-primary))", fontWeight: 600 }}>{pre}</span>
                    <span style={{ color: "hsl(var(--text-muted))" }}>→</span>
                    <span
                        style={{
                            color: "hsl(var(--sell))",
                            background: "hsla(0,55%,55%,0.08)",
                            padding: "1px 6px",
                            borderRadius: 2,
                            border: "1px solid hsl(var(--sell))",
                            fontWeight: 600,
                        }}
                    >
                        −{pre - final}
                    </span>
                    <span style={{ color: "hsl(var(--text-muted))" }}>→</span>
                    <span style={{ color: "hsl(var(--buy))", fontWeight: 600 }}>
                        {final} final
                    </span>
                </div>
            )}

            {fired ? (
                <>
                    <ul className="mt-4 space-y-2 text-sm" data-testid="public-calibration-bullets">
                        {adj.map((msg, i) => (
                            <li
                                key={`adj-${i}-${(msg || "").slice(0, 30)}`}
                                className="flex gap-2"
                                style={{ color: "hsl(var(--text-primary))" }}
                            >
                                <span style={{ color: `hsl(var(--${accent}))` }}>•</span>
                                <span>{msg}</span>
                            </li>
                        ))}
                    </ul>
                    {(rfPen || eg) && (
                        <div
                            className="mt-4 pt-3 text-xs"
                            style={{
                                color: "hsl(var(--text-muted))",
                                borderTop: "1px solid hsl(var(--border-divider))",
                                lineHeight: 1.5,
                            }}
                        >
                            {rfPen && typeof rfUp === "number" && typeof rfDown === "number" && (
                                <p>
                                    RF probabilities: P(up){" "}
                                    <span style={{ color: "hsl(var(--text-primary))", fontWeight: 600 }}>
                                        {Math.round(rfUp * 100)}%
                                    </span>
                                    {" · "}
                                    P(down){" "}
                                    <span style={{ color: "hsl(var(--text-primary))", fontWeight: 600 }}>
                                        {Math.round(rfDown * 100)}%
                                    </span>{" "}
                                    over {rfHorizon}-day forward window. Penalty rule:{" "}
                                    <span className="italic">Krauss, Do &amp; Huck (2017)</span> — tree-ensemble disagreement
                                    with discretionary direction calls predicts ~9pp lower hit-rate on equity-direction
                                    tasks.
                                </p>
                            )}
                            {eg && typeof days === "number" && (
                                <p className={rfPen ? "mt-2" : ""}>
                                    Earnings call{" "}
                                    <span style={{ color: "hsl(var(--text-primary))", fontWeight: 600 }}>
                                        {days} day{days === 1 ? "" : "s"} away
                                    </span>
                                    . Pre-earnings windows are event-driven — the LLM cannot price the surprise — so
                                    confidence is capped at 65 to reflect that uncertainty.
                                </p>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <p
                    className="mt-3 text-sm"
                    style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                >
                    Earnings-proximity gate and RF-disagreement penalty both ran clean. Confidence shown
                    is Claude&apos;s raw output — no adjustment applied.
                </p>
            )}
        </section>
    );
}
