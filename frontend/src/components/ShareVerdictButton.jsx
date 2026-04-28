import React, { useState } from "react";
import api from "@/lib/api";
import { Share2, Copy, Check, X, Loader2, Send, MessageCircle } from "lucide-react";

const SOCIAL_HANDLE = "@neuralstockintelligence";

// X (formerly Twitter) glyph — lucide ships a (now-deprecated) Twitter bird;
// the modern X mark is a clean two-stroke. Keep it small and inheritable.
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

// Build a research-framed share blurb (educational language only — never
// phrase as a price target or prediction).
function buildShareCopy(analysis, shareUrl) {
    const ticker = (analysis?.ticker || "").toUpperCase();
    const verdict = (analysis?.recommendation || "").toUpperCase();
    // The model field is `confidence_score` (0-100); accept `confidence` as a
    // fallback for unit-test stubs and external callers.
    const rawConf = analysis?.confidence_score ?? analysis?.confidence;
    const conf = Number.isFinite(rawConf) ? Math.round(rawConf) : null;

    // Opening line — ticker + AI read + confidence
    const verdictLine = ticker
        ? conf != null && verdict
            ? `${ticker} · AI read: ${verdict} · ${conf}% confidence`
            : ticker
        : "Neural Stock Intelligence";

    const body = `${verdictLine} — full reasoning + risks + scenarios:`;
    const tail = `Research only. Not financial advice. ${SOCIAL_HANDLE}`;

    return { body, tail, full: `${body} ${shareUrl}\n\n${tail}` };
}

/**
 * ShareVerdictButton — gated behind Pro/Elite plan.
 * Renders a button in the report page action row; opens a modal with copyable URL
 * AND one-tap share-intent buttons for X (Twitter), Telegram, WhatsApp.
 *
 * Backwards compatible: if `analysis` isn't passed, falls back to URL-only sharing
 * (no smart tweet copy). Callers should ideally pass the full analysis object so
 * the share blurb can include ticker / verdict / confidence.
 */
export default function ShareVerdictButton({ analysisId, analysis }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shareUrl, setShareUrl] = useState("");
    const [copied, setCopied] = useState(false);

    const gated = !analysisId;

    const start = async () => {
        setOpen(true);
        if (gated) return;
        if (shareUrl) return;
        setLoading(true);
        setError("");
        try {
            const r = await api.post(`/analysis/${analysisId}/share`);
            const url = `${window.location.origin}${r.data.url_path}`;
            setShareUrl(url);
        } catch (err) {
            setError(err?.response?.data?.detail || "Failed to create share link");
        } finally {
            setLoading(false);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch (err) {
            console.warn("clipboard copy failed:", err?.message || err);
        }
    };

    const blurb = analysis ? buildShareCopy(analysis, shareUrl) : null;

    // Intent URLs (open in a new tab so the modal stays put for follow-ups).
    const xText = blurb ? `${blurb.body} ${shareUrl}\n\n${blurb.tail}` : shareUrl;
    const xIntent = `https://x.com/intent/post?text=${encodeURIComponent(xText)}`;

    const tgText = blurb ? `${blurb.body}\n\n${blurb.tail}` : "";
    const tgIntent = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}${
        tgText ? `&text=${encodeURIComponent(tgText)}` : ""
    }`;

    const waText = blurb ? `${blurb.body} ${shareUrl}\n\n${blurb.tail}` : shareUrl;
    const waIntent = `https://wa.me/?text=${encodeURIComponent(waText)}`;

    return (
        <>
            <button
                onClick={start}
                className="btn-ghost"
                title="Share verdict publicly"
                disabled={gated}
                data-testid="share-verdict-button"
            >
                <Share2 size={14} strokeWidth={1.5} />
                Share
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
                    onClick={() => setOpen(false)}
                    data-testid="share-modal"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="module-elevated w-full max-w-lg"
                        style={{ background: "hsl(var(--surface))" }}
                    >
                        <div
                            className="p-5 flex items-center justify-between"
                            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                        >
                            <div>
                                <p className="text-overline">Your public link</p>
                                <h3 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    Share this verdict
                                </h3>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="btn-ghost !p-2"
                                aria-label="Close"
                                data-testid="share-modal-close"
                            >
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="p-5 md:p-6">
                            {!loading && error && (
                                <div className="signal-sell px-3 py-2 text-sm font-mono" data-testid="share-modal-error">
                                    {error}
                                </div>
                            )}

                            {loading && (
                                <div className="py-6 text-center">
                                    <Loader2 className="animate-spin mx-auto" size={20} />
                                    <p className="text-overline mt-3">Minting link…</p>
                                </div>
                            )}

                            {!loading && shareUrl && (
                                <>
                                    <p className="text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                        Anyone with this link can view your verdict, reasoning, and risk factors
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
                                            data-testid="share-url-input"
                                        />
                                        <button
                                            onClick={copy}
                                            className="px-4 font-ui text-xs font-medium"
                                            style={{
                                                background: copied ? "hsl(var(--buy))" : "hsl(var(--text-primary))",
                                                color: copied ? "hsl(var(--background))" : "hsl(var(--background))",
                                            }}
                                            data-testid="share-copy-button"
                                        >
                                            {copied ? (
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

                                    {/* Smart-share row — one-tap intent buttons */}
                                    <div
                                        className="mt-5 pt-5"
                                        style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                        data-testid="share-intent-row"
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
                                                data-testid="share-blurb-preview"
                                            >
                                                {blurb.body} <span style={{ color: "hsl(var(--text-primary))" }}>{shareUrl}</span>
                                                <br />
                                                <br />
                                                <span style={{ color: "hsl(var(--text-muted))" }}>{blurb.tail}</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-3 gap-2">
                                            <a
                                                href={xIntent}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-ghost flex items-center justify-center gap-2 !py-2.5"
                                                data-testid="share-intent-x"
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
                                                data-testid="share-intent-telegram"
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
                                                data-testid="share-intent-whatsapp"
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
                                        data-testid="share-open-preview"
                                    >
                                        Open preview →
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// Exposed for unit tests + reuse by other share surfaces.
export { buildShareCopy };
