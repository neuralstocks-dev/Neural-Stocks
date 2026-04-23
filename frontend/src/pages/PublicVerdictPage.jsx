import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import VerdictRing from "@/components/VerdictRing";
import SignalBadge from "@/components/SignalBadge";
import { Loader2, LineChart, AlertTriangle, Target, Shield, ArrowUpRight } from "lucide-react";
import { formatPrice, formatPct, timeAgo, formatCompact } from "@/lib/format";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
                                        <Target size={12} strokeWidth={1.5} /> Price Target
                                    </p>
                                    <div className="font-mono hero-number mt-3" style={{ fontSize: "2rem" }}>
                                        {formatPrice(a.price_target, currency)}
                                    </div>
                                </div>
                                <div className="module p-5 md:p-6">
                                    <p className="text-overline flex items-center gap-2">
                                        <Shield size={12} strokeWidth={1.5} /> Stop Loss
                                    </p>
                                    <div className="font-mono hero-number mt-3" style={{ fontSize: "2rem" }}>
                                        {formatPrice(a.stop_loss, currency)}
                                    </div>
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
                                <AlertTriangle size={12} strokeWidth={1.5} /> Risk Factors
                            </p>
                            <h2
                                className="font-serif mt-2 mb-6"
                                style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.015em" }}
                            >
                                What could go wrong.
                            </h2>
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
