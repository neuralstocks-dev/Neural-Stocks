import React, { useEffect, useState } from "react";
import { Loader2, X, Clock, TrendingUp, Calendar, Target, AlertTriangle, Info, FileDown, Share2, Copy, Check, Send, MessageCircle } from "lucide-react";
import api from "@/lib/api";

const SOCIAL_HANDLE = "@neuralstockintelligence";

// Build a research-framed share blurb for Timeline Fit shares — mirrors the
// `buildShareCopy` helper in ShareVerdictButton but adapted to horizon
// recommendations (no BUY/SELL — uses the recommended_timeline label).
function buildTimelineShareCopy(timeline, shareUrl) {
    const ticker = (timeline?.ticker || "").toUpperCase();
    // Strip the "Best fit: " prefix the model adds to recommendation_label so
    // the share blurb reads "AI horizon fit: Long Term" instead of the
    // doubly-prefixed "AI horizon fit: Best fit: Long Term".
    const rawHorizon = timeline?.recommendation_label || "horizon fit";
    const horizon = rawHorizon.replace(/^best fit\s*[:\-—]\s*/i, "").trim() || rawHorizon;
    const rawConf = timeline?.confidence_score;
    const conf = Number.isFinite(rawConf) ? Math.round(rawConf) : null;

    const headline = ticker
        ? conf != null
            ? `${ticker} · AI horizon fit: ${horizon} · ${conf}% confidence`
            : `${ticker} · ${horizon}`
        : "Neural Stock Intelligence — Timeline Fit";

    const body = `${headline} — full reasoning + risks:`;
    const tail = `Research only. Not financial advice. ${SOCIAL_HANDLE}`;
    return { body, tail };
}

// X (formerly Twitter) glyph — clean two-stroke, matches the verdict-share
// modal so brand recall stays consistent across share artifacts.
function XIcon({ size = 14, strokeWidth = 1.5 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M4 4l16 16" />
            <path d="M20 4L4 20" />
        </svg>
    );
}

const TIMELINES = [
    { key: "short_term", label: "Short Term", range: "days – 3 months", icon: Clock },
    { key: "medium_term", label: "Medium Term", range: "3 months – 2 years", icon: Calendar },
    { key: "long_term", label: "Long Term", range: "2+ years", icon: Target },
];

export default function TimelineFitModal({ ticker, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [pdfState, setPdfState] = useState("idle"); // idle | busy | done | error
    const [pdfError, setPdfError] = useState("");

    // Share state — separate from PDF flow so a share-link mint doesn't
    // disturb an in-progress PDF download (or vice versa).
    const [shareOpen, setShareOpen] = useState(false);
    const [shareLoading, setShareLoading] = useState(false);
    const [shareError, setShareError] = useState("");
    const [shareUrl, setShareUrl] = useState("");
    const [shareCopied, setShareCopied] = useState(false);

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

    const downloadPdf = async () => {
        setPdfState("busy");
        setPdfError("");
        try {
            const { data: blob } = await api.get(
                `/analysis/timeline/${ticker}/pdf`,
                { responseType: "blob" }
            );
            const url = window.URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `neulab-timeline-${ticker.toLowerCase()}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setPdfState("done");
            setTimeout(() => setPdfState("idle"), 2500);
        } catch (err) {
            // Blob responseType makes axios stash JSON errors as a Blob — read it back.
            let detail = "PDF download failed";
            try {
                const errBlob = err?.response?.data;
                if (errBlob instanceof Blob) {
                    const txt = await errBlob.text();
                    const parsed = JSON.parse(txt);
                    if (parsed?.detail) detail = parsed.detail;
                } else if (err?.response?.data?.detail) {
                    detail = err.response.data.detail;
                }
            } catch (_) { /* swallow — use default */ }
            setPdfError(detail);
            setPdfState("error");
            setTimeout(() => setPdfState("idle"), 4500);
        }
    };

    const openShare = async () => {
        setShareOpen(true);
        if (shareUrl) return; // already minted in this session
        setShareLoading(true);
        setShareError("");
        try {
            const r = await api.post(`/analysis/timeline/${ticker}/share`);
            setShareUrl(`${window.location.origin}${r.data.url_path}`);
        } catch (err) {
            setShareError(err?.response?.data?.detail || "Failed to create share link");
        } finally {
            setShareLoading(false);
        }
    };

    const copyShareUrl = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 1800);
        } catch (err) {
            console.warn("clipboard copy failed:", err?.message || err);
        }
    };

    const blurb = (data && shareUrl) ? buildTimelineShareCopy(data, shareUrl) : null;
    const xText = blurb ? `${blurb.body} ${shareUrl}\n\n${blurb.tail}` : shareUrl;
    const xIntent = `https://x.com/intent/post?text=${encodeURIComponent(xText)}`;
    const tgText = blurb ? `${blurb.body}\n\n${blurb.tail}` : "";
    const tgIntent = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}${
        tgText ? `&text=${encodeURIComponent(tgText)}` : ""
    }`;
    const waText = blurb ? `${blurb.body} ${shareUrl}\n\n${blurb.tail}` : shareUrl;
    const waIntent = `https://wa.me/?text=${encodeURIComponent(waText)}`;

    return (
        <div
            className="fixed inset-0 grid place-items-start justify-items-center p-4 overflow-y-auto"
            style={{ background: "rgba(6,6,6,0.72)", backdropFilter: "blur(6px)", zIndex: 100 }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            data-testid="timeline-fit-modal"
        >
            <div
                className="module w-full max-w-3xl my-4"
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
                    <div className="flex items-center gap-2">
                        {data && !loading && (
                            <>
                                <button
                                    onClick={openShare}
                                    className="btn-quick inline-flex items-center gap-2"
                                    data-testid="timeline-share-button"
                                    title="Share this Timeline Fit publicly"
                                >
                                    <Share2 size={14} strokeWidth={1.5} />
                                    <span className="hidden sm:inline">Share</span>
                                </button>
                                <button
                                    onClick={downloadPdf}
                                    disabled={pdfState === "busy"}
                                    className="btn-quick inline-flex items-center gap-2"
                                    data-testid="timeline-export-pdf-button"
                                    title={
                                        pdfState === "error"
                                            ? pdfError
                                            : "Download this Timeline Fit report as a branded PDF"
                                    }
                                >
                                    {pdfState === "busy" ? (
                                        <>
                                            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                                            <span className="hidden sm:inline">Preparing…</span>
                                        </>
                                    ) : pdfState === "done" ? (
                                        <>
                                            <FileDown size={14} strokeWidth={1.5} />
                                            <span className="hidden sm:inline">Downloaded</span>
                                        </>
                                    ) : pdfState === "error" ? (
                                        <>
                                            <FileDown size={14} strokeWidth={1.5} />
                                            <span className="hidden sm:inline">Retry PDF</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileDown size={14} strokeWidth={1.5} />
                                            <span className="hidden sm:inline">Export PDF</span>
                                            <span className="sm:hidden">PDF</span>
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="btn-ghost !py-1.5 !px-2"
                            data-testid="timeline-modal-close"
                        >
                            <X size={14} strokeWidth={1.5} />
                        </button>
                    </div>
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
                                    AI Recommendation
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

            {/* Share submodal — minted on demand, persists for the modal lifetime */}
            {shareOpen && (
                <div
                    className="fixed inset-0 grid place-items-center p-4"
                    style={{ background: "rgba(6,6,6,0.78)", backdropFilter: "blur(8px)", zIndex: 110 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setShareOpen(false); }}
                    data-testid="timeline-share-modal"
                >
                    <div
                        className="module w-full max-w-lg"
                        style={{ background: "hsl(var(--surface-base))" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="p-5 flex items-center justify-between"
                            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                        >
                            <div>
                                <p className="text-overline">Your public link</p>
                                <h3 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    Share this Timeline Fit
                                </h3>
                            </div>
                            <button
                                onClick={() => setShareOpen(false)}
                                className="btn-ghost !p-2"
                                aria-label="Close share dialog"
                                data-testid="timeline-share-modal-close"
                            >
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="p-5 md:p-6">
                            {shareLoading && (
                                <div className="py-6 text-center">
                                    <Loader2 className="animate-spin mx-auto" size={20} />
                                    <p className="text-overline mt-3">Minting link…</p>
                                </div>
                            )}

                            {!shareLoading && shareError && (
                                <div
                                    className="signal-sell px-3 py-2 text-sm font-mono"
                                    data-testid="timeline-share-modal-error"
                                >
                                    {shareError}
                                </div>
                            )}

                            {!shareLoading && shareUrl && (
                                <>
                                    <p className="text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                        Anyone with this link can view your Timeline Fit recommendation,
                                        the three horizon scorecards, and the strengths / risks bullets
                                        (no login required). Your email and watchlist stay private.
                                    </p>

                                    <div
                                        className="mt-5 flex items-stretch gap-2"
                                        style={{ border: "1px solid hsl(var(--border-default))" }}
                                    >
                                        <input
                                            readOnly
                                            value={shareUrl}
                                            className="flex-1 px-3 py-3 font-mono text-xs bg-transparent outline-none"
                                            style={{ color: "hsl(var(--text-primary))" }}
                                            data-testid="timeline-share-url-input"
                                        />
                                        <button
                                            onClick={copyShareUrl}
                                            className="px-4 font-ui text-xs font-medium"
                                            style={{
                                                background: shareCopied ? "hsl(var(--buy))" : "hsl(var(--text-primary))",
                                                color: "hsl(var(--background))",
                                            }}
                                            data-testid="timeline-share-copy-button"
                                        >
                                            {shareCopied ? (
                                                <>
                                                    <Check size={12} strokeWidth={1.5} className="inline mr-1" />
                                                    Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Copy size={12} strokeWidth={1.5} className="inline mr-1" />
                                                    Copy
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    <div
                                        className="mt-5 pt-5"
                                        style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                        data-testid="timeline-share-intent-row"
                                    >
                                        <p
                                            className="text-overline mb-3"
                                            style={{ color: "hsl(var(--text-muted))" }}
                                        >
                                            Or post directly to
                                        </p>
                                        {blurb && (
                                            <div
                                                className="mb-3 p-3 font-mono text-xs leading-relaxed"
                                                style={{
                                                    background: "hsl(var(--background))",
                                                    border: "1px solid hsl(var(--border-divider))",
                                                    color: "hsl(var(--text-secondary))",
                                                }}
                                                data-testid="timeline-share-blurb-preview"
                                            >
                                                {blurb.body}{" "}
                                                <span style={{ color: "hsl(var(--text-primary))" }}>{shareUrl}</span>
                                                <br /><br />
                                                <span style={{ color: "hsl(var(--text-muted))" }}>{blurb.tail}</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-3 gap-2">
                                            <a
                                                href={xIntent}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-ghost flex items-center justify-center gap-2 !py-2.5"
                                                data-testid="timeline-share-intent-x"
                                                aria-label="Post on X (Twitter)"
                                            >
                                                <XIcon size={14} />
                                                <span className="text-xs font-medium">Post on X</span>
                                            </a>
                                            <a
                                                href={tgIntent}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-ghost flex items-center justify-center gap-2 !py-2.5"
                                                data-testid="timeline-share-intent-telegram"
                                                aria-label="Share on Telegram"
                                            >
                                                <Send size={14} strokeWidth={1.5} />
                                                <span className="text-xs font-medium">Telegram</span>
                                            </a>
                                            <a
                                                href={waIntent}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-ghost flex items-center justify-center gap-2 !py-2.5"
                                                data-testid="timeline-share-intent-whatsapp"
                                                aria-label="Share on WhatsApp"
                                            >
                                                <MessageCircle size={14} strokeWidth={1.5} />
                                                <span className="text-xs font-medium">WhatsApp</span>
                                            </a>
                                        </div>
                                    </div>

                                    <a
                                        href={shareUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-overline inline-block mt-5 link-underline"
                                        data-testid="timeline-share-open-preview"
                                    >
                                        Open preview →
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Exposed for unit tests + reuse by other share surfaces.
export { buildTimelineShareCopy };
