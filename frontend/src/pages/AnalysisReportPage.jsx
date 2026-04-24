import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import VerdictRing from "@/components/VerdictRing";
import SignalBadge from "@/components/SignalBadge";
import ShareVerdictButton from "@/components/ShareVerdictButton";
import DisclaimerModal, { useDisclaimer } from "@/components/DisclaimerModal";
import AnalysisModeSelector from "@/components/AnalysisModeSelector";
import CandlestickFindings from "@/components/CandlestickFindings";
import MarketContextModules from "@/components/MarketContextModules";
import MethodologyLink from "@/components/MethodologyLink";
import RandomForestOpinion from "@/components/RandomForestOpinion";
import BandarmologyCard from "@/components/BandarmologyCard";
import ConfluenceChip from "@/components/ConfluenceChip";
import { useAuth } from "@/hooks/useAuth";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { ArrowLeft, Sparkles, Loader2, AlertTriangle, Target, Shield, FileDown } from "lucide-react";
import { formatPrice, formatPct, formatCompact, timeAgo } from "@/lib/format";
import { errMessage } from "@/lib/errors";

// Hoisted chart config objects — prevent new reference identity on every render,
// which would otherwise force recharts sub-components to re-render needlessly.
const CHART_MARGIN = { top: 10, right: 24, left: 0, bottom: 0 };
const AXIS_TICK_STYLE = { fill: "hsl(var(--text-muted))", fontSize: 10, fontFamily: "IBM Plex Mono" };
const X_AXIS_LINE_STYLE = { stroke: "hsl(var(--border-default))" };
const Y_DOMAIN = ["auto", "auto"];
const TOOLTIP_CONTENT_STYLE = {
    background: "hsl(var(--surface-elevated))",
    border: "1px solid hsl(var(--border-default))",
    fontFamily: "IBM Plex Mono",
    fontSize: 12,
    borderRadius: 2,
};
const TOOLTIP_LABEL_STYLE = { color: "hsl(var(--text-secondary))" };

export default function AnalysisReportPage() {
    const { ticker } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const disclaimer = useDisclaimer();
    const t = (ticker || "").toUpperCase();
    const [analysis, setAnalysis] = useState(null);
    const [history, setHistory] = useState([]);
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState("");
    // All 3 analysis modes are available to all tiers (Feb 2026).
    const canPro = true;
    const [mode, setMode] = useState("hybrid");
    // Latch so `?autorun=1` only fires once per mount, even if load() re-runs
    const [autorunFired, setAutorunFired] = useState(false);

    useEffect(() => {
        setMode("hybrid");
    }, []);

    // When viewing an existing verdict, the selector is read-only and locked
    // to the mode the verdict was generated with.
    const displayMode = analysis?.mode || mode;
    const selectorDisabled = Boolean(analysis);

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const [quoteR, histR] = await Promise.all([
                api.get(`/stocks/${t}/quote`),
                api.get(`/stocks/${t}/history`, { params: { period: "6mo", interval: "1d" } }),
            ]);
            setQuote(quoteR.data);
            setHistory(histR.data.points || []);
            try {
                const anR = await api.get(`/analysis/${t}/latest`);
                setAnalysis(anR.data);
            } catch {
                setAnalysis(null);
            }
        } catch (err) {
            setError(errMessage(err?.response?.data?.detail, "Failed to load"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t]);

    // Auto-trigger analysis on arrival when the `?autorun=1` flag is set
    // (used by the IDX Top Picks dialog so a pick → full verdict is one
    // click, not two). Only runs once per mount and only when no verdict
    // exists yet, so the reload button still works normally.
    useEffect(() => {
        if (autorunFired) return;
        if (loading || analyzing) return;
        if (searchParams.get("autorun") !== "1") return;
        if (analysis) {
            // Verdict already exists — strip the flag to clean up the URL
            setAutorunFired(true);
            searchParams.delete("autorun");
            setSearchParams(searchParams, { replace: true });
            return;
        }
        if (!quote) return;  // quote hasn't loaded yet; wait for next tick
        setAutorunFired(true);
        // Strip the flag immediately so refresh doesn't re-trigger.
        searchParams.delete("autorun");
        setSearchParams(searchParams, { replace: true });
        runAnalysis();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, analyzing, quote, analysis, autorunFired, searchParams]);

    const runAnalysis = async () => {
        disclaimer.ensureAccepted(async () => {
            setAnalyzing(true);
            setError("");
            try {
                // Re-analysis preserves the mode of the existing verdict (if any).
                const effectiveMode = analysis?.mode || mode;
                const r = await api.post(`/analysis/${t}?mode=${effectiveMode}`);
                setAnalysis(r.data);
            } catch (err) {
                if (disclaimer.promptFromError(err)) return;
                setError(errMessage(err?.response?.data?.detail, "Analysis failed"));
            } finally {
                setAnalyzing(false);
            }
        });
    };

    const chartData = history.map((p) => ({
        date: p.date?.slice(0, 10),
        close: p.close,
    }));

    const signalColor =
        analysis?.recommendation === "BUY"
            ? "hsl(var(--buy))"
            : analysis?.recommendation === "SELL"
            ? "hsl(var(--sell))"
            : "hsl(var(--hold))";

    return (
        <AppShell>
            <DisclaimerModal
                open={disclaimer.open}
                onClose={disclaimer.onClose}
                onAccepted={disclaimer.onAccepted}
            />
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-8 pb-16">
                <Link
                    to="/dashboard"
                    className="text-overline inline-flex items-center gap-2 mb-6 link-underline"
                    data-testid="back-to-dashboard"
                >
                    <ArrowLeft size={12} strokeWidth={1.5} /> Back to dashboard
                </Link>

                {loading && (
                    <div className="py-20 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                        <p className="mt-3 text-sm text-[hsl(var(--text-secondary))] font-mono">
                            Loading {t}…
                        </p>
                    </div>
                )}

                {error && !loading && (
                    <div className="signal-sell p-4 font-mono text-sm" data-testid="analysis-error">
                        {error}
                    </div>
                )}

                {!loading && quote && (
                    <>
                        {/* Top masthead */}
                        <section
                            className="module pb-6 md:pb-10 mb-1 md:mb-4"
                            data-testid={`analysis-header-${t}`}
                        >
                            <div className="p-5 md:p-8 grid grid-cols-12 gap-4 items-start">
                                <div className="col-span-12 md:col-span-8">
                                    <p className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                                        {quote.exchange || "—"} · {quote.currency || "USD"}
                                        {analysis?.idx_data_source === "rapidapi" ? (
                                            <span
                                                className="ml-2 px-1.5 py-0.5 font-mono"
                                                style={{
                                                    fontSize: "0.56rem",
                                                    border: "1px solid hsl(var(--buy))",
                                                    color: "hsl(var(--buy))",
                                                    borderRadius: 2,
                                                }}
                                                title="IDX live quote & fundamentals sourced from the RapidAPI provider"
                                                data-testid="idx-source-chip-rapidapi"
                                            >
                                                IDX LIVE
                                            </span>
                                        ) : analysis?.idx_data_source === "yfinance" ? (
                                            <span
                                                className="ml-2 px-1.5 py-0.5 font-mono"
                                                style={{
                                                    fontSize: "0.56rem",
                                                    border: "1px solid hsl(var(--border-divider))",
                                                    color: "hsl(var(--text-muted))",
                                                    borderRadius: 2,
                                                }}
                                                title="IDX primary source unavailable — using yfinance fallback"
                                                data-testid="idx-source-chip-fallback"
                                            >
                                                YF FALLBACK
                                            </span>
                                        ) : null}
                                    </p>
                                    <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1 mt-2 min-w-0">
                                        <h1
                                            className="font-mono hero-number break-all"
                                            style={{ fontSize: "clamp(2.2rem, 5vw, 4.5rem)" }}
                                            data-testid="ticker-symbol"
                                        >
                                            {t}
                                        </h1>
                                        <span
                                            className="font-serif italic"
                                            style={{ fontSize: "clamp(1rem, 1.5vw, 1.5rem)", color: "hsl(var(--text-secondary))" }}
                                        >
                                            {quote.name}
                                        </span>
                                    </div>
                                    <div className="mt-5 flex flex-wrap items-baseline gap-5">
                                        <div>
                                            <p className="text-overline">Last price</p>
                                            <div
                                                className="font-mono hero-number"
                                                style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)" }}
                                            >
                                                {formatPrice(quote.price, quote.currency)}
                                            </div>
                                        </div>
                                        <div
                                            className="font-mono"
                                            style={{
                                                color:
                                                    (quote.change_pct ?? 0) >= 0
                                                        ? "hsl(var(--buy))"
                                                        : "hsl(var(--sell))",
                                            }}
                                        >
                                            {quote.change != null
                                                ? `${quote.change > 0 ? "+" : ""}${quote.change.toFixed(2)}`
                                                : "—"}
                                            <span className="ml-2 opacity-80">
                                                {quote.change_pct != null
                                                    ? formatPct(quote.change_pct)
                                                    : ""}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-12 md:col-span-4 flex justify-start md:justify-end items-center gap-2">
                                    {analysis && (
                                        <>
                                            <ShareVerdictButton analysisId={analysis.id} />
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const { data } = await api.get(
                                                            `/analysis/${analysis.id}/pdf`,
                                                            { responseType: "blob" }
                                                        );
                                                        const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
                                                        const a = document.createElement("a");
                                                        a.href = url;
                                                        a.download = `neulab-${t.toLowerCase()}-${analysis.id.slice(0, 8)}.pdf`;
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        a.remove();
                                                        window.URL.revokeObjectURL(url);
                                                    } catch (err) {
                                                        setError(errMessage(err?.response?.data?.detail, "PDF download failed"));
                                                    }
                                                }}
                                                className="btn-quick inline-flex items-center gap-2"
                                                data-testid="download-pdf-button"
                                                title="Download this verdict as PDF"
                                            >
                                                <FileDown size={14} strokeWidth={1.5} />
                                                <span className="hidden md:inline">Export PDF</span>
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={runAnalysis}
                                        disabled={analyzing}
                                        className="btn-primary"
                                        data-testid="run-analysis-button"
                                    >
                                        {analyzing ? (
                                            <>
                                                <Loader2 size={14} className="animate-spin" /> Thinking…
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={14} strokeWidth={1.5} /> {analysis ? "Re-analyze" : "Analyze now"}
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Mode selector */}
                            <div className="px-5 md:px-8 pb-5" data-testid="report-mode-row">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-overline" style={{ fontSize: "0.58rem" }}>Analysis mode</span>
                                    <MethodologyLink anchor="modes" label="Analysis modes" variant="chip" />
                                </div>
                                <AnalysisModeSelector
                                    value={displayMode}
                                    onChange={setMode}
                                    canPro={canPro}
                                    size="sm"
                                    testIdPrefix="report-mode"
                                    disabled={selectorDisabled}
                                />
                            </div>

                            {/* Chart */}
                            <div className="px-2 md:px-4">
                                <div style={{ width: "100%", height: 260 }}>
                                    <ResponsiveContainer width="100%" height="100%" debounce={80}>
                                        <LineChart data={chartData} margin={CHART_MARGIN}>
                                            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border-divider))" vertical={false} />
                                            <XAxis
                                                dataKey="date"
                                                tick={AXIS_TICK_STYLE}
                                                tickLine={false}
                                                axisLine={X_AXIS_LINE_STYLE}
                                                minTickGap={40}
                                            />
                                            <YAxis
                                                tick={AXIS_TICK_STYLE}
                                                tickLine={false}
                                                axisLine={false}
                                                domain={Y_DOMAIN}
                                                width={52}
                                            />
                                            <Tooltip
                                                contentStyle={TOOLTIP_CONTENT_STYLE}
                                                labelStyle={TOOLTIP_LABEL_STYLE}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="close"
                                                stroke={signalColor}
                                                strokeWidth={1.5}
                                                dot={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </section>

                        {!analysis && (
                            <div
                                className="module p-10 md:p-16 text-center grid-bg"
                                data-testid="no-analysis-state"
                            >
                                <p className="text-overline">No verdict on file</p>
                                <h2
                                    className="font-serif mt-4"
                                    style={{ fontSize: "clamp(1.7rem, 3vw, 2.6rem)", lineHeight: 1.05 }}
                                >
                                    Generate your first AI verdict for
                                    <em className="italic ml-2" style={{ color: "hsl(var(--hold))" }}>
                                        {t}
                                    </em>
                                </h2>
                                <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Claude will synthesize price action, technicals, and fundamentals into one
                                    decisive call.
                                </p>
                                <button
                                    onClick={runAnalysis}
                                    disabled={analyzing}
                                    className="btn-primary mt-8"
                                    data-testid="empty-analyze-button"
                                >
                                    {analyzing ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" /> Thinking…
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={14} strokeWidth={1.5} /> Run Analysis
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {analysis && (
                            <>
                                {/* Verdict + targets */}
                                <section className="grid grid-cols-12 gap-1 md:gap-4 mb-1 md:mb-4">
                                    <div className="col-span-12 md:col-span-5 module p-6 md:p-8 flex flex-col md:flex-row items-center gap-6" data-testid="verdict-module">
                                        <VerdictRing
                                            score={analysis.confidence_score}
                                            signal={analysis.recommendation}
                                            size={180}
                                        />
                                        <div>
                                            <p className="text-overline flex items-center gap-1.5">
                                                AI Verdict
                                                <MethodologyLink anchor="confidence" label="How confidence is scored" />
                                            </p>
                                            <div className="mt-2">
                                                <SignalBadge signal={analysis.recommendation} size="lg" />
                                            </div>
                                            <p
                                                className="font-serif mt-4"
                                                style={{ fontSize: "1.6rem", lineHeight: 1.15, letterSpacing: "-0.01em" }}
                                            >
                                                {analysis.executive_summary}
                                            </p>
                                            <p className="text-overline mt-4" style={{ fontSize: "0.56rem" }}>
                                                Last updated {timeAgo(analysis.created_at)} · Horizon {analysis.time_horizon_weeks || 12}w
                                            </p>
                                        </div>
                                    </div>

                                    <div className="col-span-12 md:col-span-7 grid grid-cols-2 gap-1 md:gap-4">
                                        <div className="module p-5 md:p-6" data-testid="price-target-module">
                                            <p className="text-overline flex items-center gap-2">
                                                <Target size={12} strokeWidth={1.5} /> Price Target
                                            </p>
                                            <div className="font-mono hero-number mt-3" style={{ fontSize: "2.2rem" }}>
                                                {formatPrice(analysis.price_target, quote.currency)}
                                            </div>
                                            <p
                                                className="text-xs font-mono mt-2"
                                                style={{
                                                    color:
                                                        analysis.price_target > quote.price
                                                            ? "hsl(var(--buy))"
                                                            : "hsl(var(--sell))",
                                                }}
                                            >
                                                {formatPct(
                                                    ((analysis.price_target - quote.price) / quote.price) * 100
                                                )}{" "}
                                                from current
                                            </p>
                                        </div>
                                        <div className="module p-5 md:p-6" data-testid="stop-loss-module">
                                            <p className="text-overline flex items-center gap-2">
                                                <Shield size={12} strokeWidth={1.5} /> Stop Loss
                                            </p>
                                            <div className="font-mono hero-number mt-3" style={{ fontSize: "2.2rem" }}>
                                                {formatPrice(analysis.stop_loss, quote.currency)}
                                            </div>
                                            <p className="text-xs font-mono mt-2" style={{ color: "hsl(var(--sell))" }}>
                                                {formatPct(
                                                    ((analysis.stop_loss - quote.price) / quote.price) * 100
                                                )}{" "}
                                                risk cap
                                            </p>
                                        </div>
                                        <div className="module p-5 md:p-6 col-span-2" data-testid="key-metrics-module">
                                            <p className="text-overline mb-3">Key snapshot</p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <Metric label="P/E" value={analysis.fundamentals?.trailingPE?.toFixed(1)} />
                                                <Metric label="Market Cap" value={formatCompact(analysis.fundamentals?.marketCap)} />
                                                <Metric anchor="rsi" label="RSI (14)" value={analysis.technicals?.rsi_14?.toFixed(1)} />
                                                <Metric anchor="sma" label="SMA 20" value={analysis.technicals?.sma_20 != null ? formatPrice(analysis.technicals.sma_20, quote.currency) : "—"} />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Editorial: Reasoning */}
                                <section className="module p-6 md:p-10 mb-1 md:mb-4" data-testid="reasoning-module">
                                    <p className="text-overline">Reasoning</p>
                                    <h2
                                        className="font-serif mt-2 mb-6"
                                        style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)", letterSpacing: "-0.015em" }}
                                    >
                                        Why this verdict.
                                    </h2>
                                    <div
                                        className="dropcap text-base leading-relaxed"
                                        style={{
                                            columnCount: chartData.length > 0 ? 1 : 1,
                                            color: "hsl(var(--text-primary))",
                                            maxWidth: "68ch",
                                        }}
                                    >
                                        {analysis.reasoning}
                                    </div>
                                </section>

                                {/* Candlestick Findings (only when present) */}
                                {analysis.candlestick_findings && (
                                    <CandlestickFindings
                                        findings={analysis.candlestick_findings}
                                        summary={analysis.candlestick_summary}
                                        mode={analysis.mode}
                                    />
                                )}

                                {/* Market context — Finnhub: headlines, analyst consensus, earnings */}
                                <MarketContextModules marketContext={analysis.market_context} />

                                {/* Random Forest secondary opinion (renders only when model loaded) */}
                                <RandomForestOpinion opinion={analysis.rf_opinion} />
                                <BandarmologyCard bandarmology={analysis.bandarmology} />
                                <ConfluenceChip confluence={analysis.confluence} />

                                {/* Technical / Fundamental / Peer */}
                                <section id="verdict-drivers" className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 mb-1 md:mb-4">
                                    <article id="technical-analysis" className="module p-6 scroll-mt-24" data-testid="technical-module">
                                        <p className="text-overline">Technical Analysis</p>
                                        <h3 className="font-serif text-2xl mt-2 mb-4">Momentum</h3>
                                        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                            {analysis.technical_analysis}
                                        </p>
                                    </article>
                                    <article id="fundamental-analysis" className="module p-6 scroll-mt-24" data-testid="fundamental-module">
                                        <p className="text-overline">Fundamental Analysis</p>
                                        <h3 className="font-serif text-2xl mt-2 mb-4">Quality</h3>
                                        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                            {analysis.fundamental_analysis}
                                        </p>
                                    </article>
                                    <article id="peer-comparison" className="module p-6 scroll-mt-24" data-testid="peer-module">
                                        <p className="text-overline">Peer Comparison</p>
                                        <h3 className="font-serif text-2xl mt-2 mb-4">Relative</h3>
                                        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                            {analysis.peer_comparison}
                                        </p>
                                    </article>
                                </section>

                                {/* Risks */}
                                <section className="module p-6 md:p-10" data-testid="risks-module">
                                    <p className="text-overline flex items-center gap-2">
                                        <AlertTriangle size={12} strokeWidth={1.5} /> Risk Factors
                                    </p>
                                    <h2
                                        className="font-serif mt-2 mb-6"
                                        style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.015em" }}
                                    >
                                        What could go wrong.
                                    </h2>
                                    <ol className="space-y-4">
                                        {(analysis.risk_factors || []).map((r, i) => (
                                            <li
                                                key={`risk-${i}-${(r || "").slice(0, 30)}`}
                                                className="flex gap-4 pb-4"
                                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                                data-testid={`risk-item-${i}`}
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

                                {/* Data sources — understated footer */}
                                <section
                                    className="mt-6 md:mt-8 px-4 py-3"
                                    style={{
                                        borderTop: "1px solid hsl(var(--border-divider))",
                                        borderBottom: "1px solid hsl(var(--border-divider))",
                                        color: "hsl(var(--text-muted))",
                                    }}
                                    data-testid="data-sources-footer"
                                >
                                    <p
                                        className="text-overline mb-1"
                                        style={{ fontSize: "0.52rem" }}
                                    >
                                        Data sources
                                    </p>
                                    <p className="text-[11px] leading-relaxed font-mono">
                                        {(analysis.ticker || "").toUpperCase().endsWith(".JK") ? (
                                            <>
                                                Market quotes &amp; key stats: <strong>RapidAPI · Indonesia Stock Exchange (IDX)</strong> (primary) + <strong>Yahoo Finance</strong> (<code>yfinance</code>, fallback &amp; OHLC history).
                                                {" "}Insider / director filings &amp; <strong>Bandarmology</strong> smart-money signals: <strong>RapidAPI IDX</strong> (computed in-house from raw filings).
                                                {" "}Company news: <strong>CNBC Indonesia</strong> + <strong>Detik Finance</strong> RSS (ticker &amp; Bahasa alias matched).
                                                {" "}News sentiment: Neulab keyword heuristic (English + Bahasa Indonesia).
                                                {" "}Candlestick pattern detection: Neulab in-house deterministic engine (15 patterns, daily + weekly).
                                                {" "}AI reasoning &amp; verdict synthesis: <strong>Anthropic Claude Sonnet 4.5</strong>.
                                            </>
                                        ) : (
                                            <>
                                                Market quotes &amp; OHLC history: <strong>Finnhub.io</strong> (live) + <strong>Yahoo Finance</strong> (fundamentals &amp; history, via <code>yfinance</code>).
                                                {" "}Company news, analyst consensus &amp; earnings calendar: <strong>Finnhub.io</strong>.
                                                {" "}News sentiment: Neulab keyword heuristic over headlines.
                                                {" "}Candlestick pattern detection: Neulab in-house deterministic engine (15 patterns, daily + weekly).
                                                {" "}AI reasoning &amp; verdict synthesis: <strong>Anthropic Claude Sonnet 4.5</strong>.
                                            </>
                                        )}
                                    </p>
                                </section>

                                <p
                                    className="text-overline mt-6 text-center"
                                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                                >
                                    This is not financial advice. For educational use only.
                                </p>
                            </>
                        )}
                    </>
                )}
            </div>
        </AppShell>
    );
}

function Metric({ label, value, anchor }) {
    return (
        <div>
            <p className="text-overline flex items-center gap-1" style={{ fontSize: "0.56rem" }}>
                {label}
                {anchor && <MethodologyLink anchor={anchor} label={label} />}
            </p>
            <p className="font-mono text-lg mt-1">{value ?? "—"}</p>
        </div>
    );
}
