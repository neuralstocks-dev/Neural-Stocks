import React, { useEffect, useState } from "react";
import { Loader2, X, Clock, TrendingUp, Calendar, Target, AlertTriangle, Info } from "lucide-react";
import api from "@/lib/api";

const TIMELINES = [
    { key: "short_term", label: "Short Term", range: "days – 3 months", icon: Clock },
    { key: "medium_term", label: "Medium Term", range: "3 months – 2 years", icon: Calendar },
    { key: "long_term", label: "Long Term", range: "2+ years", icon: Target },
];

export default function TimelineFitModal({ ticker, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError("");
            try {
                const r = await api.post(`/analysis/timeline/${ticker}`);
                if (!cancelled) setData(r.data);
            } catch (err) {
                if (!cancelled) setError(err?.response?.data?.detail || "Failed to generate timeline recommendation");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [ticker]);

    // Close on Escape key
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 grid place-items-center p-4"
            style={{ background: "rgba(6,6,6,0.72)", backdropFilter: "blur(6px)", zIndex: 100 }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            data-testid="timeline-fit-modal"
        >
            <div
                className="module w-full max-w-3xl max-h-[90vh] overflow-y-auto"
                style={{ background: "hsl(var(--surface-base))" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="p-5 md:p-7 flex items-start justify-between gap-4"
                    style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                >
                    <div>
                        <p className="text-overline flex items-center gap-2" style={{ color: "hsl(var(--hold))" }}>
                            <TrendingUp size={12} strokeWidth={1.5} /> Timeline Fit
                        </p>
                        <h2
                            className="font-serif mt-2"
                            style={{ fontSize: "2.2rem", letterSpacing: "-0.015em", lineHeight: 1.05 }}
                            data-testid="timeline-ticker"
                        >
                            {ticker}
                            {data?.name && (
                                <span
                                    className="font-sans text-base ml-3"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    {data.name}
                                </span>
                            )}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="btn-ghost !py-1.5 !px-2"
                        data-testid="timeline-modal-close"
                    >
                        <X size={14} strokeWidth={1.5} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 md:p-7">
                    {loading && (
                        <div className="py-20 text-center">
                            <Loader2 className="animate-spin mx-auto" size={24} />
                            <p className="mt-4 font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                Analyzing {ticker} across short, medium, and long-term horizons…
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="signal-sell px-4 py-3 font-mono text-sm" data-testid="timeline-error">
                            {error}
                        </div>
                    )}

                    {data && !loading && (
                        <>
                            {/* Recommendation header */}
                            <div
                                className="p-5 md:p-6 mb-6"
                                style={{
                                    background: "hsla(38, 45%, 45%, 0.06)",
                                    border: "1px solid hsl(var(--hold))",
                                    borderRadius: 2,
                                }}
                                data-testid="timeline-recommendation-label"
                            >
                                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                                    Recommendation
                                </p>
                                <h3
                                    className="font-serif mt-2"
                                    style={{ fontSize: "1.8rem", letterSpacing: "-0.01em", color: "hsl(var(--hold))" }}
                                >
                                    {data.recommendation_label}
                                </h3>
                                <p className="text-sm mt-3" style={{ color: "hsl(var(--text-primary))", lineHeight: 1.65 }}>
                                    {data.summary}
                                </p>
                                <div className="flex items-center gap-4 mt-4 font-mono text-xs flex-wrap">
                                    <span style={{ color: "hsl(var(--text-muted))" }}>
                                        Confidence
                                    </span>
                                    <span style={{ color: "hsl(var(--hold))" }}>
                                        {data.confidence_score}%
                                    </span>
                                    {data.cached && (
                                        <span
                                            className="text-overline px-2 py-0.5"
                                            style={{
                                                border: "1px solid hsl(var(--border-default))",
                                                color: "hsl(var(--text-muted))",
                                                fontSize: "0.54rem",
                                            }}
                                        >
                                            Cached · &lt;24h
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Timeline scorecards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-3 mb-7">
                                {TIMELINES.map((tl) => {
                                    const info = data.other_timelines?.[tl.key] || {};
                                    const isBest = data.recommended_timeline === tl.key;
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
                                            data-testid={`timeline-card-${tl.key}`}
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
                                                <p className="font-mono text-xs mt-2" style={{ color: isBest ? "hsl(var(--hold))" : "hsl(var(--text-secondary))" }}>
                                                    {info.fit_score ?? 0}% fit
                                                </p>
                                            </div>
                                            <p className="text-xs mt-3 leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                                {info.note}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Why */}
                            <section className="mb-6">
                                <p className="text-overline mb-2">Why this timeline</p>
                                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-primary))" }}>
                                    {data.explanation}
                                </p>
                            </section>

                            {/* Strengths + Risks */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
                                <section>
                                    <p
                                        className="text-overline mb-2 flex items-center gap-2"
                                        style={{ color: "hsl(var(--buy))" }}
                                    >
                                        <TrendingUp size={10} strokeWidth={1.5} /> Strengths
                                    </p>
                                    <ul className="space-y-2" data-testid="timeline-strengths">
                                        {(data.strengths || []).map((s, i) => (
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
                                </section>
                                <section>
                                    <p
                                        className="text-overline mb-2 flex items-center gap-2"
                                        style={{ color: "hsl(var(--sell))" }}
                                    >
                                        <AlertTriangle size={10} strokeWidth={1.5} /> Risks
                                    </p>
                                    <ul className="space-y-2" data-testid="timeline-risks">
                                        {(data.risks || []).map((r, i) => (
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
                                </section>
                            </div>

                            {/* Footer note + disclaimer */}
                            {data.data_completeness_note && (
                                <p
                                    className="text-xs font-mono mb-4 flex items-start gap-2"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    <Info size={11} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                                    {data.data_completeness_note}
                                </p>
                            )}

                            <p
                                className="text-overline leading-relaxed pt-4"
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
                </div>
            </div>
        </div>
    );
}
