import React, { useState } from "react";
import api from "@/lib/api";
import { Share2, Copy, Check, X, Loader2, Lock } from "lucide-react";

/**
 * ShareVerdictButton — gated behind Pro/Elite plan.
 * Renders a button in the report page action row; opens a modal with copyable URL.
 */
export default function ShareVerdictButton({ analysisId, userPlan }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [shareUrl, setShareUrl] = useState("");
    const [copied, setCopied] = useState(false);

    const gated = !analysisId || userPlan === "free";

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
        } catch {
            // ignore
        }
    };

    return (
        <>
            <button
                onClick={start}
                className="btn-ghost"
                title={gated ? "Pro/Elite feature" : "Share verdict publicly"}
                data-testid="share-verdict-button"
            >
                {gated ? (
                    <Lock size={14} strokeWidth={1.5} />
                ) : (
                    <Share2 size={14} strokeWidth={1.5} />
                )}
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
                                <p className="text-overline">Share verdict</p>
                                <h3 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    {gated ? "Locked on Free plan" : "Your public link"}
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
                            {gated && (
                                <div>
                                    <p className="text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                        Public shareable verdict pages are unlocked on{" "}
                                        <span style={{ color: "hsl(var(--buy))" }}>Pro</span> and{" "}
                                        <span style={{ color: "hsl(var(--hold))" }}>Elite</span> plans. Upgrade to
                                        send a no-auth link to friends, clients, or advisors.
                                    </p>
                                    <a
                                        href="/pricing"
                                        className="btn-primary mt-6 inline-flex"
                                        data-testid="share-upgrade-cta"
                                    >
                                        See plans →
                                    </a>
                                </div>
                            )}

                            {!gated && loading && (
                                <div className="py-6 text-center">
                                    <Loader2 className="animate-spin mx-auto" size={20} />
                                    <p className="text-overline mt-3">Minting link…</p>
                                </div>
                            )}

                            {!gated && error && (
                                <div className="signal-sell px-3 py-2 text-sm font-mono" data-testid="share-modal-error">
                                    {error}
                                </div>
                            )}

                            {!gated && !loading && shareUrl && (
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
                                    <a
                                        href={shareUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-overline inline-block mt-4 link-underline"
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
