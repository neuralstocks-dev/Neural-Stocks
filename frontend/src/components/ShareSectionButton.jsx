import React, { useState, useRef, useEffect } from "react";
import { Share2, Check, Loader2 } from "lucide-react";
import api from "@/lib/api";

/**
 * ShareSectionButton — compact per-section share trigger.
 *
 * Mints (or reuses) the public share link for the analysis, builds a
 * deep-link URL with `#sectionId` so the public verdict page scrolls to
 * the matching module, then opens the native share sheet (Twitter /
 * Telegram / WhatsApp / etc) on platforms that support
 * `navigator.share()`. Falls back to copying to clipboard with a
 * temporary "Copied" confirmation chip on platforms that don't.
 *
 * Pre-filled `title` + `text` props are surfaced in the share sheet so
 * each module gets context-specific viral copy (e.g. an Intrinsic Anchor
 * share quotes the actual premium %).
 *
 * Gating: 402 from `/analysis/{id}/share` (Free plan) flips the chip to
 * an inline "Pro/Elite only" hint linking to /pricing — never a hard
 * error toast.
 */
export default function ShareSectionButton({ analysisId, sectionId, title, text }) {
    const [state, setState] = useState("idle"); // idle | loading | done | locked | error
    const [hint, setHint] = useState("");
    const timer = useRef(null);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    if (!analysisId || !sectionId) return null;

    const flash = (msg, ms = 2200) => {
        setHint(msg);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            setHint("");
            setState("idle");
        }, ms);
    };

    const handleClick = async () => {
        if (state === "loading") return;
        setState("loading");
        try {
            const r = await api.post(`/analysis/${analysisId}/share`);
            const url = `${window.location.origin}${r.data.url_path}#${sectionId}`;
            const payload = { url, title: title || "Neural Stock Intelligence™ analysis", text: text || "" };
            // Prefer native share sheet on mobile; clipboard fallback elsewhere.
            // Some desktop Chromiums advertise `navigator.share` but require
            // an explicit feature check on the payload — `canShare` returns
            // false when title/url combo isn't shareable.
            const canNative = typeof navigator !== "undefined"
                && typeof navigator.share === "function"
                && (typeof navigator.canShare !== "function" || navigator.canShare({ url }));
            if (canNative) {
                try {
                    await navigator.share(payload);
                    setState("done");
                    flash("Shared");
                    return;
                } catch (err) {
                    // User canceled the share sheet — silently treat as
                    // no-op so we don't fall through to clipboard copy on
                    // an explicit dismissal. AbortError is the cancel signal.
                    if (err?.name === "AbortError") {
                        setState("idle");
                        return;
                    }
                    // Fall through to clipboard on other errors.
                }
            }
            try {
                await navigator.clipboard.writeText(url);
                setState("done");
                flash("Link copied");
            } catch (err) {
                setState("error");
                flash("Copy failed");
            }
        } catch (err) {
            const status = err?.response?.status;
            if (status === 402) {
                setState("locked");
                flash("Pro/Elite only — upgrade →", 4000);
                return;
            }
            setState("error");
            flash("Share unavailable");
        }
    };

    const showSpinner = state === "loading";
    const showCheck = state === "done";

    return (
        <span className="inline-flex items-center gap-1.5">
            <button
                type="button"
                onClick={handleClick}
                title={`Share this section · /v/{share_id}#${sectionId}`}
                disabled={state === "loading"}
                className="inline-flex items-center gap-1 rounded-sm"
                style={{
                    fontSize: "10px",
                    padding: "3px 6px",
                    minHeight: "28px",
                    color: "hsl(var(--text-muted))",
                    border: "1px solid hsl(var(--border-divider))",
                    background: "transparent",
                    fontFamily: "var(--font-mono, ui-monospace)",
                    cursor: state === "loading" ? "default" : "pointer",
                    transition: "color 150ms, border-color 150ms",
                }}
                onMouseEnter={(e) => {
                    if (state === "loading") return;
                    e.currentTarget.style.color = "hsl(var(--text-primary))";
                    e.currentTarget.style.borderColor = "hsl(var(--text-primary))";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = "hsl(var(--text-muted))";
                    e.currentTarget.style.borderColor = "hsl(var(--border-divider))";
                }}
                data-testid={`share-section-${sectionId}`}
            >
                {showSpinner ? (
                    <Loader2 size={10} strokeWidth={1.5} className="animate-spin" />
                ) : showCheck ? (
                    <Check size={10} strokeWidth={1.5} />
                ) : (
                    <Share2 size={10} strokeWidth={1.5} />
                )}
                <span className="uppercase tracking-wider">Share</span>
            </button>
            {hint && (
                <span
                    className="font-mono"
                    style={{
                        fontSize: "10px",
                        color: state === "locked" || state === "error" ? "hsl(var(--sell))" : "hsl(var(--buy))",
                    }}
                    data-testid={`share-section-${sectionId}-hint`}
                >
                    {state === "locked" ? (
                        <a href="/pricing" className="link-underline" style={{ color: "inherit" }}>
                            {hint}
                        </a>
                    ) : (
                        hint
                    )}
                </span>
            )}
        </span>
    );
}
