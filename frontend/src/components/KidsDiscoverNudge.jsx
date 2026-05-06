/**
 * KidsDiscoverNudge — soft cross-promo banner inside the adult dashboard.
 *
 * Surfaces ONLY to users who haven't clicked through yet AND haven't
 * dismissed the nudge. State tracked in localStorage:
 *   - `kids_nudge_dismissed`  — set when × is tapped OR when the CTA
 *     is clicked (since the kid site opens in a new tab, we treat
 *     "they went there" as equivalent to "they've seen the pitch").
 *
 * Target domain: https://kidstocks.net (StockKids has its own domain).
 */
import React, { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";

const STORAGE_DISMISSED = "kids_nudge_dismissed";
const KIDS_URL = "https://kidstocks.net";

export default function KidsDiscoverNudge() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem(STORAGE_DISMISSED) === "1";
        if (!dismissed) setVisible(true);
    }, []);

    const dismiss = () => {
        localStorage.setItem(STORAGE_DISMISSED, "1");
        setVisible(false);
    };

    // When the CTA is clicked we ALSO mark the nudge as dismissed —
    // no point re-surfacing to someone who's already seen it.
    const onCtaClick = () => {
        localStorage.setItem(STORAGE_DISMISSED, "1");
        // Don't hide visually during this paint; the new tab opens and
        // the banner will be gone on next dashboard visit.
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
                href={KIDS_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCtaClick}
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
                OPEN KIDSTOCKS.NET &rarr;
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
