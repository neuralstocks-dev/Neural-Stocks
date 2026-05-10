/**
 * StockDNADashboardCard — compact pitch card on the adult dashboard
 * surfacing the public StockDNA quiz. Mirrors the non-dismissible
 * style of `KidsDiscoverNudge` but is one row tall — designed to sit
 * directly underneath the kids nudge as a stacked cross-promo strip.
 *
 * Sticky-dismissible via `localStorage.stockdna_card_dismissed` so
 * users who've already discovered their type don't see it forever.
 */
import React, { useState, useEffect } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";

const STORAGE_DISMISSED = "stockdna_card_dismissed";

export default function StockDNADashboardCard() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (localStorage.getItem(STORAGE_DISMISSED) !== "1") setVisible(true);
    }, []);

    if (!visible) return null;

    const dismiss = () => {
        localStorage.setItem(STORAGE_DISMISSED, "1");
        setVisible(false);
    };
    const stampSeen = () => localStorage.setItem(STORAGE_DISMISSED, "1");

    return (
        <section
            data-testid="stockdna-dashboard-card"
            className="relative mb-6 overflow-hidden"
            style={{
                background: "linear-gradient(135deg, hsl(259 78% 60% / 0.08) 0%, hsl(var(--gold) / 0.05) 100%)",
                border: "1px solid hsl(259 78% 60% / 0.32)",
                borderRadius: 6,
            }}
        >
            <button
                onClick={dismiss}
                aria-label="Dismiss"
                data-testid="stockdna-card-dismiss"
                className="absolute top-3 right-3 p-1.5 z-10 transition-opacity hover:opacity-100"
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
            <a
                href="/stockdna"
                onClick={stampSeen}
                data-testid="stockdna-card-cta"
                className="flex items-start sm:items-center gap-4 p-5 sm:p-6"
                style={{ textDecoration: "none", color: "inherit" }}
            >
                <span
                    style={{
                        fontSize: "2rem",
                        lineHeight: 1,
                        flexShrink: 0,
                        filter: "drop-shadow(0 0 8px hsl(259 78% 60% / 0.4))",
                    }}
                >🧬</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={12} style={{ color: "hsl(259 80% 70%)" }} />
                        <span
                            style={{
                                fontSize: "0.62rem",
                                fontWeight: 600,
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                                color: "hsl(259 80% 70%)",
                            }}
                        >New · 5 min · Public</span>
                    </div>
                    <h3
                        className="leading-tight"
                        style={{
                            fontSize: "clamp(1.1rem, 2vw, 1.35rem)",
                            fontWeight: 600,
                            color: "hsl(var(--text-primary))",
                            marginBottom: 4,
                        }}
                    >
                        What's your StockDNA?
                    </h3>
                    <p
                        className="text-sm"
                        style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                    >
                        A psychometric quiz built on Nobel-winning behavioral finance research —
                        decodes your investor personality and matches you to stocks that fit how
                        you actually think.
                    </p>
                </div>
                <span
                    className="hidden sm:inline-flex items-center gap-1.5 flex-shrink-0"
                    style={{
                        color: "hsl(259 80% 70%)",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                    }}
                >
                    Take the quiz <ArrowRight size={13} />
                </span>
            </a>
        </section>
    );
}
