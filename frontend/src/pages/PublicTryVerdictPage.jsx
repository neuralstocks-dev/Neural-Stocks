/**
 * PublicTryVerdictPage — anonymous-safe verdict viewer. Calls POST
 * /api/try/analysis/{ticker} on mount. The backend returns a REDACTED
 * verdict (risk factors / patterns / RF opinion / technical+fundamental
 * deep dives / bandarmology stripped). This page renders what's visible
 * + prominent "🔒 Sign up to unlock" overlays for each locked module.
 *
 * Conversion strategy: the visitor sees the verdict on *their* ticker
 * and the shape of what's missing, producing the strongest possible
 * signup motivation.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import axios from "axios";
import {
    LineChart,
    Loader2,
    Lock,
    AlertTriangle,
    ArrowUpRight,
    Sparkles,
    ShieldAlert,
    Share2,
    Copy,
    Check,
} from "lucide-react";
import VerdictRing from "@/components/VerdictRing";
import PublicTrendingTicker from "@/components/PublicTrendingTicker";
import { formatPrice, formatPct } from "@/lib/format";
import { BACKEND_URL } from "@/lib/api";

const API = BACKEND_URL;

export default function PublicTryVerdictPage() {
    const params = useParams();
    const location = useLocation();
    // Two modes:
    //  - /try/:ticker      → run a fresh anon analysis (POST)
    //  - /ts/:shareId      → fetch a shared anon verdict (GET, no analysis run)
    const isSharedView = location.pathname.startsWith("/ts/");
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState(null);

    useEffect(() => {
        let cancelled = false;
        let pollTimer = null;

        const pollJob = async (jobId, attempts = 0) => {
            if (cancelled) return;
            if (attempts > 60) {  // 60 * 2s = 2 min hard ceiling
                setError("Analysis is taking longer than expected. Please try again in a moment.");
                setLoading(false);
                return;
            }
            try {
                const res = await axios.get(`${API}/api/try/job/${encodeURIComponent(jobId)}`);
                const body = res.data || {};
                const jobStatus = body?._job?.status;
                if (jobStatus === "done") {
                    if (!cancelled) {
                        setData(body);
                        setLoading(false);
                        setProgress(null);
                    }
                    return;
                }
                if (jobStatus === "error") {
                    if (!cancelled) {
                        setError(body?._job?.error || "Analysis failed. Please try another ticker.");
                        setLoading(false);
                    }
                    return;
                }
                // Still pending — update progress label from server-streamed stage
                if (!cancelled) {
                    setProgress({
                        label: body?._job?.stage_label || null,
                        offset: body?._job?.stage_offset_s ?? null,
                        attempt: attempts + 1,
                    });
                }
                pollTimer = setTimeout(() => pollJob(jobId, attempts + 1), 2000);
            } catch (e) {
                if (!cancelled) {
                    setError(e?.response?.data?.detail || "Lost connection while loading analysis");
                    setLoading(false);
                }
            }
        };

        (async () => {
            setLoading(true);
            try {
                if (isSharedView) {
                    const res = await axios.get(`${API}/api/try/shared/${encodeURIComponent(params.shareId)}`);
                    if (!cancelled) {
                        setData(res.data);
                        setLoading(false);
                    }
                    return;
                }
                // Fresh try: POST may return either a full verdict (200, cache hit)
                // or a job_id (202, cache miss → poll).
                const res = await axios.post(
                    `${API}/api/try/analysis/${encodeURIComponent(params.ticker)}?mode=hybrid`,
                    null,
                    { validateStatus: (s) => s === 200 || s === 202 },
                );
                if (res.status === 202 && res.data?.job_id) {
                    pollJob(res.data.job_id);
                    return;  // poll will setData + setLoading(false)
                }
                if (!cancelled) {
                    setData(res.data);
                    setLoading(false);
                }
            } catch (e) {
                if (!cancelled) {
                    setError(
                        e?.response?.data?.detail ||
                        e?.message ||
                        "Could not run the analysis"
                    );
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [params.ticker, params.shareId, isSharedView]);

    const a = data;
    const signal = (a?.recommendation || "HOLD").toUpperCase();
    const signalColor = signal === "BUY" ? "hsl(var(--buy))" : signal === "SELL" ? "hsl(var(--sell))" : "hsl(var(--hold))";
    const rateLimited = data?._rate_limited;
    const locked = data?._locked || {};

    return (
        <div className="min-h-screen grain" data-testid="public-try-page">
            <header
                className="sticky top-0 z-20"
                style={{
                    backdropFilter: "blur(14px)",
                    background: "hsl(var(--background) / 0.72)",
                    borderBottom: "1px solid hsl(var(--border-default))",
                }}
            >
                <div className="max-w-[1200px] mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3" data-testid="try-brand-link">
                        <div style={{
                            width: 28, height: 28,
                            border: "1px solid hsl(var(--text-primary))",
                            display: "grid", placeItems: "center",
                        }}>
                            <LineChart size={14} strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="font-serif italic text-lg">Neural</span>
                            <span className="text-overline" style={{ fontSize: "0.56rem" }}>Stock Intelligence</span>
                        </div>
                    </Link>
                    <Link to="/signup" className="btn-primary !text-xs" data-testid="try-cta-signup-top">
                        Unlock full report <ArrowUpRight size={12} strokeWidth={1.5} />
                    </Link>
                </div>
            </header>

            <main className="max-w-[1200px] mx-auto px-5 md:px-8 pt-10 pb-20 relative z-10">
                {loading && (
                    <div className="py-24 text-center max-w-xl mx-auto">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                        <p className="text-overline mt-4">
                            {isSharedView
                                ? "Loading shared verdict…"
                                : `Running your free verdict on ${(params.ticker || "").toUpperCase()}…`}
                        </p>
                        {!isSharedView && (
                            <ProgressIndicator progress={progress} />
                        )}
                        {isSharedView && (
                            <p className="text-xs mt-2" style={{ color: "hsl(var(--text-muted))" }}>
                                Preview mode · redacted by design
                            </p>
                        )}
                    </div>
                )}

                {!loading && error && (
                    <div className="py-24 text-center">
                        <AlertTriangle className="mx-auto mb-3" size={20} style={{ color: "hsl(var(--sell))" }} />
                        <p className="text-overline" style={{ color: "hsl(var(--sell))" }}>{error}</p>
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                            The ticker may be invalid or outside our coverage. Try another one after signing up.
                        </p>
                        <Link to="/signup" className="btn-primary mt-6 inline-flex">
                            Sign up to analyse any stock →
                        </Link>
                    </div>
                )}

                {!loading && a && (
                    <>
                        {/* Preview banner */}
                        <div
                            className="p-3 mb-6 flex items-center gap-3 flex-wrap"
                            style={{
                                background: "hsla(40,80%,55%,0.08)",
                                border: "1px solid hsl(var(--hold))",
                                borderRadius: 2,
                            }}
                            data-testid="try-preview-banner"
                        >
                            <Sparkles size={14} strokeWidth={1.8} style={{ color: "hsl(var(--hold))" }} />
                            <p className="text-sm flex-1" style={{ color: "hsl(var(--text-primary))" }}>
                                {isSharedView ? (
                                    <>
                                        <strong>Shared preview.</strong> Someone ran this verdict on Neulab's free try and shared the preview with you. Run your own for any ticker below.
                                        {a._shared?.was_refreshed && (
                                            <span className="ml-2 text-xs italic" style={{ color: "hsl(var(--text-muted))" }}>
                                                · Verdict auto-refreshed to current market data
                                            </span>
                                        )}
                                    </>
                                ) : rateLimited ? (
                                    <><strong>Free daily analysis used.</strong> This is your {rateLimited.previous_ticker} verdict from earlier today. Sign up to run unlimited analyses.</>
                                ) : (
                                    <><strong>Free preview.</strong> Core verdict shown. Pattern details, risk factors, and confidence breakdown are unlocked after signup.</>
                                )}
                            </p>
                            {isSharedView ? (
                                <Link
                                    to={`/try/${encodeURIComponent(a.ticker || "")}`}
                                    className="text-overline inline-flex items-center gap-1"
                                    style={{ color: "hsl(var(--accent-primary))" }}
                                    data-testid="try-banner-cta-run-mine"
                                >
                                    Run my own on {a.ticker} → <ArrowUpRight size={11} strokeWidth={1.8} />
                                </Link>
                            ) : (
                                <Link
                                    to="/signup"
                                    className="text-overline inline-flex items-center gap-1"
                                    style={{ color: "hsl(var(--accent-primary))" }}
                                    data-testid="try-banner-cta"
                                >
                                    Sign up free → <ArrowUpRight size={11} strokeWidth={1.8} />
                                </Link>
                            )}
                        </div>

                        {/* Ticker + company headline */}
                        <div className="flex items-baseline gap-4 flex-wrap">
                            <h1
                                className="font-mono hero-number"
                                style={{ fontSize: "clamp(2.5rem, 5vw, 4rem)" }}
                                data-testid="try-ticker"
                            >
                                {a.ticker}
                            </h1>
                            <span
                                className="font-serif italic"
                                style={{ fontSize: "clamp(1rem, 1.5vw, 1.4rem)", color: "hsl(var(--text-secondary))" }}
                            >
                                {a.quote_snapshot?.name || a.ticker}
                            </span>
                            {/* Share button — only when we ran a fresh analysis (not when
                                already viewing a share) and the verdict was actually ours */}
                            {!isSharedView && a.id && (
                                <SharePreviewButton verdictId={a.id} />
                            )}
                        </div>

                        {/* Core verdict */}
                        <section className="grid grid-cols-12 gap-1 md:gap-4 mt-8" data-testid="try-core">
                            <div
                                className="col-span-12 md:col-span-5 module p-6 md:p-8 flex flex-col md:flex-row items-center gap-6"
                                style={{ borderColor: signalColor }}
                            >
                                <VerdictRing
                                    recommendation={signal}
                                    confidence={a.confidence_score || 0}
                                    size={140}
                                />
                                <div>
                                    <p className="text-overline">Verdict</p>
                                    <h2
                                        className="font-serif mt-2"
                                        style={{ fontSize: "clamp(1.6rem, 2.8vw, 2.2rem)", color: signalColor }}
                                    >
                                        {signal}
                                    </h2>
                                    <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                                        Confidence {a.confidence_score}%
                                    </p>
                                </div>
                            </div>

                            <div className="col-span-12 md:col-span-7 module p-6 md:p-8">
                                <p className="text-overline">Price target &amp; Stop-loss</p>
                                <div className="grid grid-cols-3 gap-3 mt-3">
                                    <Metric
                                        label="Now"
                                        value={formatPrice(a.price_at_analysis, a.quote_snapshot?.currency || "USD")}
                                    />
                                    <Metric
                                        label="Target"
                                        value={a.price_target != null ? formatPrice(a.price_target, a.quote_snapshot?.currency || "USD") : "—"}
                                        color="hsl(var(--buy))"
                                    />
                                    <Metric
                                        label="Stop-loss"
                                        value={a.stop_loss != null ? formatPrice(a.stop_loss, a.quote_snapshot?.currency || "USD") : "—"}
                                        color="hsl(var(--sell))"
                                    />
                                </div>
                                {a.upside_pct != null && (
                                    <p className="text-sm mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                                        Implied upside: <strong style={{ color: a.upside_pct >= 0 ? "hsl(var(--buy))" : "hsl(var(--sell))" }}>
                                            {formatPct(a.upside_pct)}
                                        </strong>
                                    </p>
                                )}
                            </div>
                        </section>

                        {/* Reasoning preview */}
                        <section className="module p-6 md:p-10 mt-1 md:mt-4" data-testid="try-reasoning">
                            <p className="text-overline">Why this verdict</p>
                            <p
                                className="mt-4 text-sm md:text-base leading-relaxed"
                                style={{ color: "hsl(var(--text-primary))" }}
                            >
                                {a.reasoning}
                            </p>
                            {locked.reasoning_full && (
                                <LockedHint label="Full reasoning" />
                            )}
                        </section>

                        {/* Locked modules — render blurred placeholders to tease the depth */}
                        <section className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 mt-1 md:mt-4">
                            <LockedModule
                                title="Technical Analysis"
                                hint="Momentum, RSI, MACD, moving averages"
                                show={!!locked.technical_analysis}
                            />
                            <LockedModule
                                title="Fundamental Analysis"
                                hint="Revenue, margin, P/E, growth vectors"
                                show={!!locked.fundamental_analysis}
                            />
                            <LockedModule
                                title="Peer Comparison"
                                hint="Sector & industry rank"
                                show={!!locked.peer_comparison}
                            />
                        </section>

                        <section className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4 mt-1 md:mt-4">
                            <LockedModule
                                title="Candlestick Patterns"
                                hint="15 patterns detected across daily + weekly timeframes"
                                show={!!locked.candlestick_findings}
                                wide
                            />
                            <LockedModule
                                title="Random Forest opinion"
                                hint="20-day horizon ML model · 344 tickers · isotonic calibration"
                                show={!!locked.rf_opinion}
                                wide
                            />
                            <LockedModule
                                title="Risk Factors"
                                hint="Ranked downside scenarios with probabilities"
                                show={!!locked.risk_factors}
                                wide
                                icon={ShieldAlert}
                            />
                            {locked.bandarmology && (
                                <LockedModule
                                    title="Bandarmology (IDX)"
                                    hint="Insider / director / major-holder flow analysis"
                                    show
                                    wide
                                />
                            )}
                        </section>

                        {/* Trending + final CTA */}
                        <div
                            className="module mt-8 p-6 md:p-8 text-center"
                            style={{ borderColor: signalColor }}
                        >
                            <p className="text-overline">Ready for the full report?</p>
                            <h3
                                className="font-serif mt-3"
                                style={{ fontSize: "clamp(1.4rem, 2.5vw, 1.8rem)", letterSpacing: "-0.01em" }}
                            >
                                Sign up free — unlock patterns, risks, and <em className="italic" style={{ color: signalColor }}>unlimited</em> analyses.
                            </h3>
                            <div className="mt-5 max-w-2xl mx-auto">
                                <PublicTrendingTicker
                                    windowDays={7}
                                    limit={8}
                                    idxOnly={(a.ticker || "").toUpperCase().endsWith(".JK")}
                                    ctaHref={null}
                                />
                            </div>
                            <Link to="/signup" className="btn-primary mt-5 inline-flex" data-testid="try-cta-signup-bottom">
                                Create your account →
                            </Link>
                            <p className="text-[11px] mt-3" style={{ color: "hsl(var(--text-muted))" }}>
                                Free tier · up to 5 watchlist stocks · 50 analyses / day
                            </p>
                        </div>

                        <p
                            className="text-overline mt-8 text-center"
                            style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                        >
                            Preview mode · Educational use only · Not financial advice
                        </p>
                    </>
                )}
            </main>
        </div>
    );
}

function Metric({ label, value, color }) {
    return (
        <div>
            <p className="text-overline" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p
                className="font-mono mt-1"
                style={{
                    fontSize: "clamp(1rem, 1.6vw, 1.2rem)",
                    color: color || "hsl(var(--text-primary))",
                }}
            >
                {value}
            </p>
        </div>
    );
}

function LockedModule({ title, hint, show, wide = false, icon: Icon }) {
    if (!show) return null;
    const ITag = Icon || Lock;
    return (
        <article
            className={`module p-6 md:p-8 relative overflow-hidden ${wide ? "" : ""}`}
            data-testid={`try-locked-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        >
            <p className="text-overline">{title}</p>
            {/* Teaser blurred placeholder bars */}
            <div className="mt-4 space-y-2 select-none" style={{ filter: "blur(6px)", opacity: 0.55 }}>
                <div style={{ height: 10, background: "hsl(var(--surface-elevated))", width: "92%" }} />
                <div style={{ height: 10, background: "hsl(var(--surface-elevated))", width: "78%" }} />
                <div style={{ height: 10, background: "hsl(var(--surface-elevated))", width: "85%" }} />
                <div style={{ height: 10, background: "hsl(var(--surface-elevated))", width: "64%" }} />
                <div style={{ height: 10, background: "hsl(var(--surface-elevated))", width: "90%" }} />
            </div>
            {/* Overlay */}
            <div
                className="absolute inset-0 flex items-center justify-center p-4"
                style={{
                    background: "linear-gradient(to bottom, transparent 0%, hsl(var(--background) / 0.85) 40%, hsl(var(--background) / 0.97) 80%)",
                }}
            >
                <div className="text-center">
                    <div
                        className="mx-auto mb-2 flex items-center justify-center"
                        style={{
                            width: 34, height: 34,
                            border: "1px solid hsl(var(--accent-primary))",
                            borderRadius: 2,
                        }}
                    >
                        <ITag size={15} strokeWidth={1.8} style={{ color: "hsl(var(--accent-primary))" }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: "hsl(var(--text-primary))" }}>
                        {title}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "hsl(var(--text-muted))" }}>
                        {hint}
                    </p>
                    <Link
                        to="/signup"
                        className="text-overline inline-flex items-center gap-1 mt-2"
                        style={{ color: "hsl(var(--accent-primary))" }}
                    >
                        Sign up to unlock → <ArrowUpRight size={10} strokeWidth={1.8} />
                    </Link>
                </div>
            </div>
        </article>
    );
}

function LockedHint({ label }) {
    return (
        <div
            className="mt-4 p-3 flex items-center gap-2"
            style={{
                background: "hsl(var(--surface-elevated))",
                border: "1px dashed hsl(var(--border-default))",
                borderRadius: 2,
            }}
        >
            <Lock size={12} strokeWidth={1.8} style={{ color: "hsl(var(--accent-primary))" }} />
            <span className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                {label} is truncated in preview.
            </span>
            <Link
                to="/signup"
                className="ml-auto text-overline inline-flex items-center gap-1"
                style={{ color: "hsl(var(--accent-primary))" }}
            >
                Unlock → <ArrowUpRight size={10} strokeWidth={1.8} />
            </Link>
        </div>
    );
}


function SharePreviewButton({ verdictId }) {
    const [state, setState] = useState("idle"); // idle | loading | shared | error
    const [url, setUrl] = useState("");
    const [copied, setCopied] = useState(false);

    const shareUrl = useMemo(() => {
        if (!url) return "";
        return typeof window !== "undefined" ? `${window.location.origin}${url}` : url;
    }, [url]);

    const doShare = async () => {
        if (state === "loading") return;
        setState("loading");
        try {
            const res = await axios.post(`${API}/api/try/share`, { verdict_id: verdictId });
            setUrl(res.data.url_path);
            setState("shared");
            // Try the native share sheet on touch devices — falls back to copy
            if (typeof navigator !== "undefined" && navigator.share) {
                try {
                    await navigator.share({
                        title: "Neulab preview verdict",
                        text: "Check out this free AI verdict I just ran on Neulab",
                        url: `${window.location.origin}${res.data.url_path}`,
                    });
                    return;
                } catch { /* user cancelled — fall through to copy affordance */ }
            }
        } catch (e) {
            setState("error");
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* noop */ }
    };

    if (state === "idle") {
        return (
            <button
                type="button"
                onClick={doShare}
                className="inline-flex items-center gap-1.5 ml-2 px-2.5 py-1.5 font-mono transition-all"
                style={{
                    color: "hsl(var(--accent-primary))",
                    border: "1px solid hsl(var(--accent-primary))",
                    background: "transparent",
                    fontSize: "0.6rem",
                    letterSpacing: "0.12em",
                    borderRadius: 2,
                    cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--accent-primary) / 0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                data-testid="share-preview-button"
            >
                <Share2 size={11} strokeWidth={1.8} /> SHARE PREVIEW
            </button>
        );
    }
    if (state === "loading") {
        return (
            <span className="inline-flex items-center gap-1.5 ml-2 text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                <Loader2 size={11} className="animate-spin" /> Minting link…
            </span>
        );
    }
    if (state === "error") {
        return (
            <span className="inline-flex items-center gap-1.5 ml-2 text-overline" style={{ color: "hsl(var(--sell))" }}>
                Couldn't create share link — try again in a moment
            </span>
        );
    }
    // state === "shared"
    return (
        <div
            className="inline-flex items-center gap-2 ml-2 px-2 py-1"
            style={{
                background: "hsl(var(--surface-elevated))",
                border: "1px solid hsl(var(--border-default))",
                borderRadius: 2,
            }}
            data-testid="share-preview-result"
        >
            <code
                className="font-mono text-xs"
                style={{ color: "hsl(var(--text-secondary))", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
                {shareUrl}
            </code>
            <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 text-overline px-1.5 py-0.5"
                style={{
                    color: copied ? "hsl(var(--buy))" : "hsl(var(--accent-primary))",
                    fontSize: "0.56rem",
                }}
                data-testid="share-preview-copy"
            >
                {copied ? (<><Check size={10} strokeWidth={2} /> COPIED</>) : (<><Copy size={10} strokeWidth={1.8} /> COPY</>)}
            </button>
        </div>
    );
}



/**
 * ProgressIndicator — renders the 5 canonical analysis stages as a checklist
 * with each stage marked as in-progress (spinner), done (green check), or
 * upcoming (muted dot). Uses the server-streamed `stage_offset_s` so the
 * UI matches the actual backend pipeline timing rather than faking it.
 */
const STAGES = [
    { offset: 0,  label: "Fetching live quote · OHLC · fundamentals" },
    { offset: 6,  label: "Detecting candlestick patterns across daily + weekly" },
    { offset: 12, label: "Running Random Forest model · 20-day horizon" },
    { offset: 18, label: "Gathering market context · news · peer signals" },
    { offset: 26, label: "Synthesising verdict with Anthropic Claude" },
];

function ProgressIndicator({ progress }) {
    // Figure out the highest-reached stage from server offset, fallback to 0
    const reachedOffset = progress?.offset != null ? progress.offset : -1;
    return (
        <ul className="mt-6 text-left space-y-2 font-mono text-xs">
            {STAGES.map((stage) => {
                const isDone = reachedOffset > stage.offset;
                const isActive = reachedOffset >= 0 && reachedOffset === stage.offset;
                const isUpcoming = !isDone && !isActive;
                return (
                    <li
                        key={stage.offset}
                        className="flex items-center gap-2"
                        style={{
                            color: isDone
                                ? "hsl(var(--buy))"
                                : isActive
                                ? "hsl(var(--text-primary))"
                                : "hsl(var(--text-muted))",
                            opacity: isUpcoming ? 0.55 : 1,
                        }}
                        data-testid={`stage-${stage.offset}`}
                    >
                        <span className="w-4 flex items-center justify-center">
                            {isDone ? "✓" : isActive ? (
                                <Loader2 size={10} className="animate-spin" />
                            ) : "·"}
                        </span>
                        <span>{stage.label}</span>
                    </li>
                );
            })}
        </ul>
    );
}

