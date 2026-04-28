import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
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
import BrokerFlowCompanionCard from "@/components/BrokerFlowCompanionCard";
import IdxVerdictCalibrationNote from "@/components/IdxVerdictCalibrationNote";
import ConfluenceChip from "@/components/ConfluenceChip";
import AnalysisQueueChip from "@/components/AnalysisQueueChip";
import AnalysisProgressStepper from "@/components/AnalysisProgressStepper";
import LLMBudgetBanner from "@/components/LLMBudgetBanner";
import IntrinsicValueChip from "@/components/IntrinsicValueChip";
import ConfidenceCalibrationBreadcrumbs from "@/components/ConfidenceCalibrationBreadcrumbs";
import RisksModule from "@/components/RisksModule";
import AlternativeScenariosModule from "@/components/AlternativeScenariosModule";
import WhatCouldChangeViewModule from "@/components/WhatCouldChangeViewModule";
import HowToReadModule from "@/components/HowToReadModule";
import ShareSectionButton from "@/components/ShareSectionButton";
import ReanalyzeButtonContent from "@/components/ReanalyzeButtonContent";
import LlmHealthBadge from "@/components/LlmHealthBadge";

// Module-share headline builders. Each returns { title, text } that
// pre-fills the native share sheet (Twitter/Telegram/WhatsApp). Keep
// short — most channels truncate at ~280 chars and we want the URL
// itself to survive intact for click-through.
function buildIntrinsicShareCopy(ticker, anchor) {
    const method = anchor?.primary_anchor === "graham" ? "Graham anchor" : "RIM anchor";
    const est = anchor?.primary_estimate;
    const pct = anchor?.premium_to_anchor_pct;
    const sign = typeof pct === "number" && pct >= 0 ? "+" : "";
    if (typeof est === "number" && typeof pct === "number") {
        return {
            title: `${ticker} · ${method} reference`,
            text: `${ticker} trading at ${sign}${pct.toFixed(1)}% vs the ${method} of ${est.toFixed(2)} — see how Neural Stock Intelligence™ frames it.`,
        };
    }
    return { title: `${ticker} · valuation reference`, text: `${ticker} valuation anchor on Neural Stock Intelligence™.` };
}

function buildRisksShareCopy(ticker, risks) {
    const n = Array.isArray(risks) ? risks.length : 0;
    return {
        title: `${ticker} · ${n} risks the model flags`,
        text: `${n} conditions under which the current Neural Stock Intelligence™ read on ${ticker} would weaken.`,
    };
}

function buildAltScenariosShareCopy(ticker) {
    return {
        title: `${ticker} · alternative reads`,
        text: `Bullish, neutral, and bearish framings of the same data on ${ticker}.`,
    };
}

// Tiny mirror of the detection logic in LLMBudgetBanner so the parent
// can hide its generic red string when the friendly banner is taking
// over. Kept in sync intentionally — same simple matcher.
function _isBudgetError(payload) {
    if (!payload) return false;
    if (typeof payload === "string") {
        const s = payload.toLowerCase();
        return (
            s.includes("budget exceeded") ||
            s.includes("budget has been exceeded") ||
            s.includes("llm budget") ||
            s.includes("top up your") ||
            s.includes("insufficient credit")
        );
    }
    if (typeof payload === "object") {
        if (payload.error_code === "llm_budget_exceeded") return true;
        return _isBudgetError(payload.message);
    }
    return false;
}
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
import { ArrowLeft, Sparkles, Loader2, AlertTriangle, Target, Shield, FileDown, Receipt } from "lucide-react";
import { formatPrice, formatPct, formatCompact, timeAgo } from "@/lib/format";
import { pollAnalysisJob, formatAnalysisTimestamp } from "@/lib/analysisPolling";
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
    // Raw error payload (string or object) so specialised banners like
    // <LLMBudgetBanner /> can detect structured codes (error_code) instead
    // of brittle string matching. Set alongside `error` whenever we set it.
    const [errorRaw, setErrorRaw] = useState(null);
    // Live progress snapshot from the BG job — drives the per-stage
    // stepper next to the Re-analyze button. Reset to null when not
    // analyzing so the stepper hides automatically.
    const [progress, setProgress] = useState(null);
    // Live ETA + elapsed-seconds counter. `etaSec` is fetched once from
    // /analysis/queue/status at the moment we POST /start so the user
    // sees a *calibrated* expected duration (rolling EMA across recent
    // jobs + their position in the worker queue), not a hard-coded
    // guess. `elapsedSec` ticks every 1s while analyzing so the
    // remaining-seconds figure stays honest if the job runs long. Both
    // reset to 0 / null when analyzing flips back to false.
    const [etaSec, setEtaSec] = useState(null);
    const [elapsedSec, setElapsedSec] = useState(0);
    // All 3 analysis modes are available to all tiers (Feb 2026).
    const canPro = true;
    const [mode, setMode] = useState("hybrid");
    // Latch so `?autorun=1` only fires once per mount, even if load() re-runs
    const [autorunFired, setAutorunFired] = useState(false);

    useEffect(() => {
        setMode("hybrid");
    }, []);

    // Tick the elapsed-seconds counter every 1s while analyzing. Bound to
    // `analyzing` so the timer auto-stops the moment the job resolves
    // (or errors). We use Date.now() math instead of incrementing because
    // setInterval drifts and a job that takes 75s should report 75s, not
    // 73s due to drift accumulation across browser tabs.
    useEffect(() => {
        if (!analyzing) {
            setElapsedSec(0);
            return undefined;
        }
        const startedAt = Date.now();
        const id = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => clearInterval(id);
    }, [analyzing]);

    // When viewing an existing verdict, the selector is read-only and locked
    // to the mode the verdict was generated with.
    const displayMode = analysis?.mode || mode;
    const selectorDisabled = Boolean(analysis);

    const load = async () => {
        setLoading(true);
        setError("");
        setErrorRaw(null);
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
            setErrorRaw(null);
            setProgress(null);
            setEtaSec(null);
            // Fetch the live ETA from the worker pool *before* posting
            // /start so we can show the user a calibrated "~Ns left"
            // figure from second-1 instead of a hard-coded guess. Best
            // effort — if the queue endpoint is slow/erroring we
            // proceed without an ETA (the button just shows elapsed
            // seconds). The avg_duration_s from the rolling EMA is
            // typically 45-65s on US tickers, 60-90s on slow IDX.
            try {
                const q = await api.get(`/analysis/queue/status`);
                const wait = Number(q?.data?.estimated_wait_s) || 0;
                const avg = Number(q?.data?.avg_duration_s) || 50;
                setEtaSec(Math.round(wait + avg));
            } catch {
                /* non-fatal — proceed without an ETA */
            }
            try {
                // Re-analysis preserves the mode of the existing verdict (if any).
                const effectiveMode = analysis?.mode || mode;
                // Mobile-resilient poller — see lib/analysisPolling.js.
                // Budget is 260s (backend hard-cap is 240s) with visibility-
                // aware elapsed tracking so backgrounded tabs don't incorrectly
                // conclude the job timed out.
                const finalResult = await pollAnalysisJob({
                    api,
                    ticker: t,
                    mode: effectiveMode,
                    onProgress: (p) => setProgress(p),
                });
                setAnalysis(finalResult);
            } catch (err) {
                if (disclaimer.promptFromError(err)) return;
                const detail = err?.response?.data?.detail;
                const msg = detail || err?.message || "Analysis failed";
                setErrorRaw(detail || err?.message || null);
                setError(errMessage(msg, "Analysis failed"));
            } finally {
                setAnalyzing(false);
                setProgress(null);
                setEtaSec(null);
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
        <>
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
                    <>
                        <LLMBudgetBanner error={errorRaw} />
                        {/* Generic red banner is hidden when the friendly
                            LLM-budget banner is showing (it has its own
                            structured copy + Top-up CTA). */}
                        {!_isBudgetError(errorRaw) && (
                            <div className="signal-sell p-4 font-mono text-sm" data-testid="analysis-error">
                                <p>{error}</p>
                                {/* Inline retry CTA — most analysis errors are
                                    transient (upstream LLM blips). One click is
                                    materially less friction than searching for
                                    the Re-analyze button after reading the error. */}
                                {!analyzing && (
                                    <button
                                        onClick={runAnalysis}
                                        className="btn-primary mt-3 !py-1.5 !px-3 !text-xs"
                                        data-testid="analysis-error-retry-button"
                                    >
                                        Retry analysis
                                    </button>
                                )}
                            </div>
                        )}
                    </>
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
                                <div className="col-span-12 md:col-span-4 flex flex-wrap justify-start md:justify-end items-center gap-2">
                                    {analysis && (
                                        <>
                                            <ShareVerdictButton analysisId={analysis.id} analysis={analysis} />
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const { data } = await api.get(
                                                            `/analysis/${analysis.id}/trade-slip`,
                                                            { responseType: "blob" }
                                                        );
                                                        const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
                                                        const a = document.createElement("a");
                                                        a.href = url;
                                                        a.download = `neulab-trade-slip-${t.toLowerCase()}-${analysis.id.slice(0, 8)}.pdf`;
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        a.remove();
                                                        window.URL.revokeObjectURL(url);
                                                    } catch (err) {
                                                        setError(errMessage(err?.response?.data?.detail, "Trade slip download failed"));
                                                    }
                                                }}
                                                className="btn-quick inline-flex items-center gap-2"
                                                data-testid="download-trade-slip-button"
                                                title="One-page shareable trade slip — perfect for screenshots into Discord/Telegram"
                                            >
                                                <Receipt size={14} strokeWidth={1.5} />
                                                <span className="md:hidden">Slip</span>
                                                <span className="hidden md:inline">Trade Slip</span>
                                            </button>
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
                                                <span className="md:hidden">PDF</span>
                                                <span className="hidden md:inline">Export PDF</span>
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={runAnalysis}
                                        disabled={analyzing}
                                        className="btn-primary relative overflow-hidden"
                                        data-testid="run-analysis-button"
                                    >
                                        <ReanalyzeButtonContent
                                            analyzing={analyzing}
                                            elapsedSec={elapsedSec}
                                            etaSec={etaSec}
                                        />
                                    </button>
                                    <LlmHealthBadge />
                                    <AnalysisQueueChip watch />
                                </div>
                                {/* Per-stage stepper — visible only while a
                                    job is running. Reads progress.phase +
                                    progress.completed from /analysis/jobs/
                                    {id}. Replaces the opaque "Thinking…"
                                    spinner with a transparent receipt so
                                    users see WHICH part of the pipeline is
                                    working (data fetch / patterns / Claude
                                    / RF / calibration) right now. */}
                                {analyzing && progress && (
                                    <AnalysisProgressStepper
                                        progress={progress}
                                        mode={analysis?.mode || mode}
                                        className="mt-3"
                                    />
                                )}
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
                                    className="btn-primary mt-8 relative overflow-hidden"
                                    data-testid="empty-analyze-button"
                                >
                                    {analyzing ? (
                                        <ReanalyzeButtonContent
                                            analyzing={analyzing}
                                            elapsedSec={elapsedSec}
                                            etaSec={etaSec}
                                        />
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
                                    {/* Educational research disclaimer — sits
                                        prominently at the top of the report
                                        ABOVE the verdict module so it's the
                                        first thing the reader registers.
                                        Quoted-style left rule + serif copy
                                        matches the tone of the sample report
                                        (calm, paragraph-form, not a screaming
                                        warning chip). */}
                                    <div
                                        className="col-span-12 module p-5 md:p-6"
                                        style={{
                                            borderLeft: "3px solid hsl(var(--hold))",
                                            background: "hsl(var(--surface-elevated))",
                                        }}
                                        data-testid="educational-disclaimer-banner"
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
                                            This is a model-generated summary intended to help users review market
                                            data, technical signals, and scenario analysis for a user-selected
                                            stock. It is <strong>not</strong> personalized financial advice and{" "}
                                            <strong>not</strong> a recommendation to buy, sell, or hold any
                                            security.
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
                                                className="text-overline mt-1.5"
                                                style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                                                data-testid="analytical-bias-subtitle"
                                            >
                                                Analytical bias · classification, not a trade instruction
                                            </p>
                                            <p
                                                className="font-serif mt-4"
                                                style={{ fontSize: "1.6rem", lineHeight: 1.15, letterSpacing: "-0.01em" }}
                                            >
                                                {analysis.executive_summary}
                                            </p>
                                            <p
                                                className="text-overline mt-4"
                                                style={{ fontSize: "0.56rem" }}
                                                data-testid="analysis-generated-at"
                                            >
                                                Generated {formatAnalysisTimestamp(analysis.created_at)} · Horizon {analysis.time_horizon_weeks || 12}w
                                            </p>

                                            <ConfidenceCalibrationBreadcrumbs analysis={analysis} />
                                        </div>
                                    </div>

                                    <div className="col-span-12 md:col-span-7 grid grid-cols-2 gap-1 md:gap-4">
                                        <div className="module p-5 md:p-6" data-testid="price-target-module">
                                            <p className="text-overline flex items-center gap-2">
                                                <Target size={12} strokeWidth={1.5} /> Scenario level
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
                                            <p
                                                className="text-[10px] mt-2"
                                                style={{ color: "hsl(var(--text-muted))", lineHeight: 1.5 }}
                                            >
                                                Illustrative directional reference for monitoring — not a trade
                                                instruction.
                                            </p>
                                        </div>
                                        <div className="module p-5 md:p-6" data-testid="stop-loss-module">
                                            <p className="text-overline flex items-center gap-2">
                                                <Shield size={12} strokeWidth={1.5} /> Invalidation level
                                            </p>
                                            <div className="font-mono hero-number mt-3" style={{ fontSize: "2.2rem" }}>
                                                {formatPrice(analysis.stop_loss, quote.currency)}
                                            </div>
                                            <p className="text-xs font-mono mt-2" style={{ color: "hsl(var(--sell))" }}>
                                                {formatPct(
                                                    ((analysis.stop_loss - quote.price) / quote.price) * 100
                                                )}{" "}
                                                from current
                                            </p>
                                            <p
                                                className="text-[10px] mt-2"
                                                style={{ color: "hsl(var(--text-muted))", lineHeight: 1.5 }}
                                            >
                                                Level at which the current model interpretation would be weakened
                                                or invalidated.
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
                                        analysisCreatedAt={analysis.created_at}
                                    />
                                )}

                                {/* Market context — Finnhub: headlines, analyst consensus, earnings */}
                                <MarketContextModules marketContext={analysis.market_context} />

                                {/* Random Forest secondary opinion (renders only when model loaded) */}
                                <RandomForestOpinion opinion={analysis.rf_opinion} />
                                <BandarmologyCard bandarmology={analysis.bandarmology} />
                                <IdxVerdictCalibrationNote analysis={analysis} />
                                {analysis.bandarmology && <BrokerFlowCompanionCard />}
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
                                        <IntrinsicValueChip
                                            anchor={analysis.intrinsic_value_anchor}
                                            currency={quote?.currency || "USD"}
                                            shareCta={
                                                analysis.id && analysis.intrinsic_value_anchor?.primary_anchor &&
                                                analysis.intrinsic_value_anchor.primary_anchor !== "none" ? (
                                                    <ShareSectionButton
                                                        analysisId={analysis.id}
                                                        sectionId="intrinsic-anchor"
                                                        {...buildIntrinsicShareCopy(analysis.ticker, analysis.intrinsic_value_anchor)}
                                                    />
                                                ) : null
                                            }
                                        />
                                    </article>
                                    <article id="peer-comparison" className="module p-6 scroll-mt-24" data-testid="peer-module">
                                        <p className="text-overline">Peer Comparison</p>
                                        <h3 className="font-serif text-2xl mt-2 mb-4">Relative</h3>
                                        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                            {analysis.peer_comparison}
                                        </p>
                                    </article>
                                </section>

                                <RisksModule
                                    risks={analysis.risk_factors}
                                    shareCta={
                                        analysis.id && (analysis.risk_factors || []).length > 0 ? (
                                            <ShareSectionButton
                                                analysisId={analysis.id}
                                                sectionId="risks"
                                                {...buildRisksShareCopy(analysis.ticker, analysis.risk_factors)}
                                            />
                                        ) : null
                                    }
                                />

                                <AlternativeScenariosModule
                                    scenarios={analysis.alternative_scenarios}
                                    shareCta={
                                        analysis.id && analysis.alternative_scenarios ? (
                                            <ShareSectionButton
                                                analysisId={analysis.id}
                                                sectionId="alt-scenarios"
                                                {...buildAltScenariosShareCopy(analysis.ticker)}
                                            />
                                        ) : null
                                    }
                                />

                                <WhatCouldChangeViewModule items={analysis.what_could_change_view} />

                                <HowToReadModule />

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
                                                {" "}News sentiment: NSI keyword heuristic (English + Bahasa Indonesia).
                                                {" "}Candlestick pattern detection: NSI in-house deterministic engine (15 patterns, daily + weekly).
                                                {" "}AI reasoning &amp; verdict synthesis: <strong>Anthropic Claude Sonnet 4.5</strong>.
                                            </>
                                        ) : (
                                            <>
                                                Market quotes &amp; OHLC history: <strong>Finnhub.io</strong> (live) + <strong>Yahoo Finance</strong> (fundamentals &amp; history, via <code>yfinance</code>).
                                                {" "}Company news, analyst consensus &amp; earnings calendar: <strong>Finnhub.io</strong>.
                                                {" "}News sentiment: NSI keyword heuristic over headlines.
                                                {" "}Candlestick pattern detection: NSI in-house deterministic engine (15 patterns, daily + weekly).
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
        </>
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
