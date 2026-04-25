import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { AlertTriangle, X, Loader2, Check } from "lucide-react";

/**
 * DisclaimerModal — gates AI analysis actions.
 * Self-loads the current disclaimer text on open. Requires two checkboxes
 * to be ticked before the accept button is enabled.
 */
export default function DisclaimerModal({ open, onClose, onAccepted }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [ackRead, setAckRead] = useState(false);
    const [ackOwnRisk, setAckOwnRisk] = useState(false);

    useEffect(() => {
        if (!open) {
            setAckRead(false);
            setAckOwnRisk(false);
            setError("");
            return;
        }
        setLoading(true);
        api
            .get("/disclaimer")
            .then((r) => setData(r.data))
            .catch((e) => setError(e?.response?.data?.detail || "Failed to load disclaimer"))
            .finally(() => setLoading(false));
    }, [open]);

    const accept = async () => {
        setSubmitting(true);
        setError("");
        try {
            await api.post("/disclaimer/accept");
            onAccepted?.();
        } catch (err) {
            setError(err?.response?.data?.detail || "Failed to save acceptance");
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const ready = ackRead && ackOwnRisk && !submitting;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-start md:items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
            data-testid="disclaimer-modal"
        >
            <div
                className="module-elevated w-full max-w-2xl mt-8 md:mt-0"
                style={{ background: "hsl(var(--surface))" }}
            >
                <div
                    className="p-5 md:p-6 flex items-start justify-between gap-4"
                    style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle
                            size={22}
                            strokeWidth={1.5}
                            style={{ color: "hsl(var(--sell))", marginTop: 2 }}
                        />
                        <div>
                            <p className="text-overline" style={{ color: "hsl(var(--sell))" }}>
                                Required · before your first analysis
                            </p>
                            <h3
                                className="font-serif mt-1"
                                style={{ fontSize: "clamp(1.6rem, 3vw, 2rem)", letterSpacing: "-0.015em" }}
                            >
                                Not financial advice.
                            </h3>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="btn-ghost !p-2"
                        aria-label="Close"
                        data-testid="disclaimer-close-button"
                    >
                        <X size={16} strokeWidth={1.5} />
                    </button>
                </div>

                {loading && (
                    <div className="py-10 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                    </div>
                )}

                {data && (
                    <>
                        <div
                            className="px-5 md:px-6 py-5 max-h-[52vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-line"
                            style={{ color: "hsl(var(--text-secondary))" }}
                            data-testid="disclaimer-text"
                        >
                            {data.text}
                        </div>

                        <div
                            className="px-5 md:px-6 py-4 space-y-3"
                            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                        >
                            <label
                                className="flex items-start gap-3 cursor-pointer select-none"
                                data-testid="disclaimer-ack-read"
                            >
                                <input
                                    type="checkbox"
                                    checked={ackRead}
                                    onChange={(e) => setAckRead(e.target.checked)}
                                    className="mt-1 accent-[hsl(var(--buy))]"
                                />
                                <span className="text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                                    I have read the disclaimer and understand that all outputs are{" "}
                                    <em className="italic">educational, not advice</em>.
                                </span>
                            </label>
                            <label
                                className="flex items-start gap-3 cursor-pointer select-none"
                                data-testid="disclaimer-ack-risk"
                            >
                                <input
                                    type="checkbox"
                                    checked={ackOwnRisk}
                                    onChange={(e) => setAckOwnRisk(e.target.checked)}
                                    className="mt-1 accent-[hsl(var(--buy))]"
                                />
                                <span className="text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                                    I accept full responsibility for any investment decisions I make and agree to
                                    use Neural at my own risk.
                                </span>
                            </label>

                            {error && (
                                <div className="signal-sell px-3 py-2 text-xs font-mono" data-testid="disclaimer-error">
                                    {typeof error === "string" ? error : JSON.stringify(error)}
                                </div>
                            )}
                        </div>

                        <div
                            className="px-5 md:px-6 py-4 flex items-center justify-between gap-3 flex-wrap"
                            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                        >
                            <span className="text-overline" style={{ fontSize: "0.56rem" }}>
                                Version {data.version}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onClose}
                                    className="btn-ghost"
                                    disabled={submitting}
                                    data-testid="disclaimer-decline-button"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={accept}
                                    className="btn-primary"
                                    disabled={!ready}
                                    data-testid="disclaimer-accept-button"
                                >
                                    {submitting ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <>
                                            <Check size={14} strokeWidth={1.5} /> I understand &amp; accept
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}


/** Convenience hook: provides accepted state + a wrapper that ensures
 *  the user has accepted before running a gated action. Callers pass the
 *  intended action; if not accepted, the disclaimer modal state opens and
 *  the action is re-played after acceptance. */
export function useDisclaimer() {
    const [accepted, setAccepted] = useState(null); // null = unknown, bool after load
    const [open, setOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const r = await api.get("/disclaimer");
            setAccepted(!!r.data.accepted);
            return !!r.data.accepted;
        } catch {
            setAccepted(false);
            return false;
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const ensureAccepted = useCallback(
        (action) => {
            // accepted === null means the GET /disclaimer hasn't resolved
            // yet (user clicked very fast after page load). For a returning
            // user this is almost certainly `true` — running the action
            // optimistically gives instant feedback (spinner appears).
            // The downstream API will 428 if they actually haven't accepted,
            // and the caller's `promptFromError(err)` path opens the modal.
            // Only block (open modal up-front) when we KNOW they haven't
            // accepted — i.e., accepted === false.
            if (accepted !== false) {
                action?.();
                return;
            }
            setPendingAction(() => action);
            setOpen(true);
        },
        [accepted]
    );

    /** Open the modal in response to a backend 428 disclaimer_required.
     *  Useful when accepted state was stale / not yet loaded at click time. */
    const promptFromError = useCallback((err) => {
        const d = err?.response?.data?._detail_object;
        if (err?.response?.status === 428 || d?.code === "disclaimer_required") {
            setAccepted(false);
            setOpen(true);
            return true;
        }
        return false;
    }, []);

    const onAccepted = useCallback(() => {
        setAccepted(true);
        setOpen(false);
        if (pendingAction) {
            const a = pendingAction;
            setPendingAction(null);
            a();
        }
    }, [pendingAction]);

    const onClose = useCallback(() => {
        setOpen(false);
        setPendingAction(null);
    }, []);

    return { accepted, open, ensureAccepted, promptFromError, onAccepted, onClose };
}
