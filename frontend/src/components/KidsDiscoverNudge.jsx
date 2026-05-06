/**
 * KidsDiscoverNudge — soft cross-promo banner inside the adult dashboard.
 *
 * Surfaces ONLY to users who haven't visited /kids/preview yet AND
 * haven't dismissed the nudge. Both states tracked in localStorage:
 *   - `kids_preview_visited` — written by KidsPreviewPage on mount
 *   - `kids_nudge_dismissed`  — written here when X is tapped
 *
 * Dismiss is permanent (no time-based reappearance) — at this scale a
 * one-time prompt is plenty. Anyone who later types /kids/preview into
 * the URL bar can still find it; we just stop interrupting the working
 * zone.
 */
import React, { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";

const STORAGE_VISITED = "kids_preview_visited";
const STORAGE_DISMISSED = "kids_nudge_dismissed";

export default function KidsDiscoverNudge() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Defer the visibility check by one tick so we never flash the
        // banner during the same paint that could have just written
        // `kids_preview_visited` on a fast back-nav.
        const visited = localStorage.getItem(STORAGE_VISITED) === "1";
        const dismissed = localStorage.getItem(STORAGE_DISMISSED) === "1";
        if (!visited && !dismissed) setVisible(true);
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_DISMISSED, "1");
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <section
            data-testid="kids-discover-nudge"
            className="mb-4 px-5 py-3 flex items-center gap-4 flex-wrap"
            style={{
                background: "linear-gradient(135deg, rgba(184,153,79,0.10) 0%, rgba(184,153,79,0.04) 100%)",
                border: "1px solid hsl(var(--accent-gold) / 0.35)",
                borderRadius: 4,
            }}
        >
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <Sparkles
                    size={18}
                    style={{ color: "hsl(var(--accent-gold))", flexShrink: 0 }}
                />
                <p
                    className="text-sm leading-snug"
                    style={{ color: "hsl(var(--text-primary))" }}
                >
                    <span style={{ fontWeight: 600 }}>Have a kid?</span>{" "}
                    <span style={{ color: "hsl(var(--text-secondary))" }}>
                        Show them how the AI thinks — same engine, kid-friendly explanations.
                    </span>
                </p>
            </div>
            <a
                href="/kids/preview/AAPL?age=11-13"
                data-testid="kids-discover-nudge-cta"
                className="text-overline whitespace-nowrap"
                style={{
                    color: "hsl(var(--accent-gold))",
                    fontSize: "0.62rem",
                    letterSpacing: "0.18em",
                    textDecoration: "none",
                    padding: "6px 14px",
                    border: "1px solid hsl(var(--accent-gold))",
                    borderRadius: 2,
                }}
            >
                OPEN STOCKKIDS &rarr;
            </a>
            <button
                onClick={dismiss}
                aria-label="Dismiss"
                data-testid="kids-discover-nudge-dismiss"
                className="p-1 transition-opacity hover:opacity-100"
                style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    opacity: 0.5,
                    color: "hsl(var(--text-muted))",
                }}
            >
                <X size={16} />
            </button>
        </section>
    );
}
