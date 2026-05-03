import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import {
    Loader2, LineChart, ArrowUpRight, Clock, Calendar, Target,
    TrendingUp, AlertTriangle, Info,
} from "lucide-react";
import { timeAgo, formatPrice } from "@/lib/format";
import { API_BASE } from "@/lib/api";

const API = API_BASE;

const TIMELINES = [
    { key: "short_term", label: "Short Term", range: "days – 3 months", icon: Clock },
    { key: "medium_term", label: "Medium Term", range: "3 months – 2 years", icon: Calendar },
    { key: "long_term", label: "Long Term", range: "2+ years", icon: Target },
];

export default function PublicTimelinePage() {
    const { shareId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/public/timeline/${shareId}`);
                setData(r.data);
            } catch (err) {
                setError(err?.response?.data?.detail || "Timeline recommendation not found");
            } finally {
                setLoading(false);
            }
        })();
    }, [shareId]);

    const t = data?.timeline;
    const currency = t?.currency || "USD";

    return (
        <div className="min-h-screen grain" data-testid="public-timeline-page">
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
                    <Link
                        to="/signup"
                        className="btn-primary !text-xs"
                        data-testid="public-cta-signup"
                    >
                        Get your own analysis <ArrowUpRight size={12} strokeWidth={1.5} />
                    </Link>
                </div>
            </header>

            <main className="max-w-[1200px] mx-auto px-5 md:px-8 pt-10 pb-20 relative z-10">
                {loading && (
                    <div className="py-24 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                        <p className="text-overline mt-4">Loading timeline…</p>
                    </div>
                )}
                {error && !loading && (
                    <div className="py-24 text-center" data-testid="public-timeline-error">
                        <p className="text-overline" style={{ color: "hsl(var(--sell))" }}>
                            {error}
                        </p>
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                            This link may have been revoked or never existed.
                        </p>
                    </div>
                )}

                {!loading && t && (
                    <>
                        <p className="text-overline">
                            Shared by {data.shared_by_name} · {timeAgo(data.shared_at)} · Timeline Fit
                        </p>
                        <div className="mt-3 flex items-baseline gap-4 flex-wrap">
                            <h1
                                className="font-mono hero-number"
                                style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
                                data-testid="public-timeline-ticker"
                            >
                                {t.ticker}
                            </h1>
                            {t.name && (
                                <span
                                    className="font-serif italic"
                                    style={{
                                        fontSize: "clamp(1rem, 1.5vw, 1.4rem)",
                                        color: "hsl(var(--text-secondary))",
                                    }}
                                >
                                    {t.name}
                                </span>
                            )}
                            <Link
                                to={`/dashboard?focus=${encodeURIComponent(t.ticker)}`}
                                className="btn-ghost !text-xs inline-flex items-center gap-1 ml-auto"
                                data-testid="public-run-your-own-timeline"
                                title={`Log in or sign up, then run your own Timeline Fit on ${t.ticker}`}
                            >
                                Run your own on {t.ticker} <ArrowUpRight size={12} strokeWidth={1.5} />
                            </Link>
                        </div>

                        {/* Educational research banner */}
                        <section
                            className="mt-8 module p-5 md:p-6"
                            style={{
                                borderLeft: "3px solid hsl(var(--hold))",
                                background: "hsl(var(--surface-elevated))",
                            }}
                            data-testid="public-timeline-banner"
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
                                Timeline Fit ranks how well the current setup matches a{" "}
                                <strong>short / medium / long-term</strong> investment horizon.
                                It is a horizon-suitability classification — <strong>not</strong>{" "}
                                a buy / sell signal and <strong>not</strong> personalized
                                financial advice.
                            </p>
                            <p
                                className="mt-2 text-sm"
                                style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                            >
                                <strong style={{ color: "hsl(var(--text-primary))" }}>Confidence</strong>{" "}
                                reflects the model&apos;s internal classification strength based on
                                fundamentals, technicals, and price history — <strong>not</strong>{" "}
                                the probability of any future outcome.
                            </p>
                        </section>

                        {/* Recommendation block */}
                        <section
                            className="mt-6 p-5 md:p-7"
                            style={{
                                background: "hsla(38, 45%, 45%, 0.06)",
                                border: "1px solid hsl(var(--hold))",
                                borderRadius: 2,
                            }}
                            data-testid="public-timeline-recommendation"
                        >
                            <p
                                className="text-overline flex items-center gap-2"
                                style={{ color: "hsl(var(--hold))" }}
                            >
                                <TrendingUp size={12} strokeWidth={1.5} /> AI Recommendation
                            </p>
                            <h2
                                className="font-serif mt-2"
                                style={{
                                    fontSize: "2rem",
                                    letterSpacing: "-0.015em",
                                    color: "hsl(var(--hold))",
                                    lineHeight: 1.1,
                                }}
                            >
                                {t.recommendation_label}
                            </h2>
                            <p
                                className="text-base mt-3"
                                style={{ color: "hsl(var(--text-primary))", lineHeight: 1.65 }}
                            >
                                {t.summary}
                            </p>
                            <div className="flex items-center gap-4 mt-4 font-mono text-xs flex-wrap">
                                <span style={{ color: "hsl(var(--text-muted))" }}>Confidence</span>
                                <span style={{ color: "hsl(var(--hold))" }}>
                                    {t.confidence_score}%
                                </span>
                                {t.price_at_analysis != null && (
                                    <span style={{ color: "hsl(var(--text-muted))" }}>
                                        · Price at analysis{" "}
                                        <span style={{ color: "hsl(var(--text-primary))" }}>
                                            {formatPrice(t.price_at_analysis, currency)}
                                        </span>
                                    </span>
                                )}
                            </div>
                        </section>

                        {/* Three timeline scorecards */}
                        <section
                            className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-3 mt-8"
                            data-testid="public-timeline-cards"
                        >
                            {TIMELINES.map((tl) => {
                                const info = t.other_timelines?.[tl.key] || {};
                                const isBest = t.recommended_timeline === tl.key;
                                const Icon = tl.icon;
                                return (
                                    <div
                                        key={tl.key}
                                        className="p-4"
                                        style={{
                                            border: "1px solid " + (isBest ? "hsl(var(--hold))" : "hsl(var(--border-divider))"),
                                            borderWidth: isBest ? 2 : 1,
                                            background: isBest ? "hsla(38, 45%, 45%, 0.04)" : "transparent",
                                            borderRadius: 2,
                                        }}
                                        data-testid={`public-timeline-card-${tl.key}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <Icon
                                                size={14}
                                                strokeWidth={1.5}
                                                style={{ color: isBest ? "hsl(var(--hold))" : "hsl(var(--text-muted))" }}
                                            />
                                            {isBest && (
                                                <span
                                                    className="text-overline"
                                                    style={{
                                                        color: "hsl(var(--hold))",
                                                        fontSize: "0.54rem",
                                                    }}
                                                >
                                                    BEST FIT
                                                </span>
                                            )}
                                        </div>
                                        <p
                                            className="font-serif mt-3"
                                            style={{ fontSize: "1.1rem", letterSpacing: "-0.01em" }}
                                        >
                                            {tl.label}
                                        </p>
                                        <p
                                            className="text-overline mt-0.5"
                                            style={{ color: "hsl(var(--text-muted))", fontSize: "0.54rem" }}
                                        >
                                            {tl.range}
                                        </p>
                                        <div className="mt-3">
                                            <div
                                                className="h-1 w-full"
                                                style={{
                                                    background: "hsl(var(--surface-elevated))",
                                                    borderRadius: 1,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${info.fit_score || 0}%`,
                                                        height: "100%",
                                                        background: isBest ? "hsl(var(--hold))" : "hsl(var(--text-muted))",
                                                        borderRadius: 1,
                                                        transition: "width 600ms",
                                                    }}
                                                />
                                            </div>
                                            <p
                                                className="font-mono text-xs mt-2"
                                                style={{ color: isBest ? "hsl(var(--hold))" : "hsl(var(--text-secondary))" }}
                                            >
                                                {info.fit_score ?? 0}% fit
                                            </p>
                                        </div>
                                        <p
                                            className="text-xs mt-3 leading-relaxed"
                                            style={{ color: "hsl(var(--text-secondary))" }}
                                        >
                                            {info.note}
                                        </p>
                                    </div>
                                );
                            })}
                        </section>

                        {/* Why this timeline */}
                        {t.explanation && (
                            <section className="mt-8" data-testid="public-timeline-explanation">
                                <p className="text-overline mb-2">Why this timeline</p>
                                <p
                                    className="text-base leading-relaxed"
                                    style={{ color: "hsl(var(--text-primary))" }}
                                >
                                    {t.explanation}
                                </p>
                            </section>
                        )}

                        {/* Strengths + Risks */}
                        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 mt-8">
                            <div>
                                <p
                                    className="text-overline mb-2 flex items-center gap-2"
                                    style={{ color: "hsl(var(--buy))" }}
                                >
                                    <TrendingUp size={10} strokeWidth={1.5} /> Strengths
                                </p>
                                <ul className="space-y-2" data-testid="public-timeline-strengths">
                                    {(t.strengths || []).map((s, i) => (
                                        <li
                                            key={`strength-${i}-${(s || "").slice(0, 30)}`}
                                            className="text-sm leading-relaxed pl-4 relative"
                                            style={{ color: "hsl(var(--text-primary))" }}
                                        >
                                            <span
                                                className="absolute left-0 top-2 w-2 h-px"
                                                style={{ background: "hsl(var(--buy))" }}
                                            />
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <p
                                    className="text-overline mb-2 flex items-center gap-2"
                                    style={{ color: "hsl(var(--sell))" }}
                                >
                                    <AlertTriangle size={10} strokeWidth={1.5} /> Risks
                                </p>
                                <ul className="space-y-2" data-testid="public-timeline-risks">
                                    {(t.risks || []).map((r, i) => (
                                        <li
                                            key={`risk-${i}-${(r || "").slice(0, 30)}`}
                                            className="text-sm leading-relaxed pl-4 relative"
                                            style={{ color: "hsl(var(--text-primary))" }}
                                        >
                                            <span
                                                className="absolute left-0 top-2 w-2 h-px"
                                                style={{ background: "hsl(var(--sell))" }}
                                            />
                                            {r}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </section>

                        {t.data_completeness_note && (
                            <p
                                className="mt-6 text-xs font-mono flex items-start gap-2"
                                style={{ color: "hsl(var(--text-muted))" }}
                            >
                                <Info size={11} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                                {t.data_completeness_note}
                            </p>
                        )}

                        <p
                            className="text-overline leading-relaxed pt-6 mt-10"
                            style={{
                                color: "hsl(var(--text-muted))",
                                fontSize: "0.58rem",
                                borderTop: "1px solid hsl(var(--border-divider))",
                            }}
                        >
                            For research and informational purposes only. Not financial advice.
                            Neural is an AI-assisted analysis tool; consult a licensed advisor
                            before acting on any information.
                        </p>
                    </>
                )}
            </main>
        </div>
    );
}
