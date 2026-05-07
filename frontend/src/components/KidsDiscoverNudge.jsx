/**
 * KidsDiscoverNudge — pitch card on the adult dashboard proposing
 * KidStocks for users with kids aged 8–18.
 *
 * Stronger than a one-line banner: a proper card with eyebrow,
 * headline, three value-prop bullets, a sample of what the kid
 * actually sees (kid-view pull-quote), and TWO CTAs:
 *   - Primary: "Try it for your kid →" → kidstocks.net (new tab)
 *   - Secondary: "See a sample" → /kids/preview/AAPL?age=11-13
 *     (internal, public, no kid-account required)
 *
 * Dismissal is sticky in `localStorage.kids_nudge_dismissed`. Clicking
 * either CTA also stamps the flag — once they've seen the pitch, no
 * point re-surfacing it.
 */
import React, { useState, useEffect } from "react";
import { Sparkles, X, Brain, Coins, ShieldCheck, ArrowRight, Eye } from "lucide-react";

const STORAGE_DISMISSED = "kids_nudge_dismissed";
const KIDS_URL = "https://kidstocks.net";
const SAMPLE_URL = "/kids/preview/AAPL?age=11-13";

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

    // Both CTAs stamp the dismissal — they've seen the pitch.
    const stampSeen = () => {
        localStorage.setItem(STORAGE_DISMISSED, "1");
    };

    if (!visible) return null;

    return (
        <section
            data-testid="kids-discover-nudge"
            className="relative mb-6 overflow-hidden"
            style={{
                background: "linear-gradient(135deg, rgba(184,153,79,0.08) 0%, rgba(184,153,79,0.02) 100%)",
                border: "1px solid hsl(var(--accent-gold) / 0.35)",
                borderRadius: 6,
            }}
        >
            <button
                onClick={dismiss}
                aria-label="Dismiss"
                data-testid="kids-discover-nudge-dismiss"
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

            <div
                className="grid gap-6 p-6 sm:p-7"
                style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
            >
                {/* Pitch column */}
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <Sparkles size={14} style={{ color: "hsl(var(--accent-gold))" }} />
                        <span
                            className="text-overline"
                            style={{
                                color: "hsl(var(--accent-gold))",
                                letterSpacing: "0.18em",
                                fontSize: "0.62rem",
                                fontWeight: 600,
                            }}
                        >
                            FOR PARENTS
                        </span>
                    </div>

                    <div>
                        <h3
                            className="leading-tight"
                            style={{
                                fontSize: "clamp(1.25rem, 2.4vw, 1.6rem)",
                                fontWeight: 600,
                                color: "hsl(var(--text-primary))",
                                marginBottom: 8,
                            }}
                        >
                            Got a kid 8–18? Show them how the AI thinks.
                        </h3>
                        <p
                            className="text-sm leading-relaxed"
                            style={{ color: "hsl(var(--text-secondary))", maxWidth: 620 }}
                        >
                            KidStocks is the kid-safe layer over the same Neural Stock Intelligence
                            engine you use — institutional-grade analysis translated into language
                            an 8-year-old can actually understand. They learn to invest by reasoning,
                            not by gambling.
                        </p>
                    </div>

                    <ul
                        className="flex flex-col gap-2.5 text-sm"
                        style={{ color: "hsl(var(--text-primary))" }}
                    >
                        <li className="flex items-start gap-2.5">
                            <Brain size={16} style={{ color: "hsl(var(--accent-gold))", marginTop: 2, flexShrink: 0 }} />
                            <span>
                                <strong style={{ fontWeight: 600 }}>Same engine, age-adapted.</strong>{" "}
                                <span style={{ color: "hsl(var(--text-secondary))" }}>
                                    Three age bands — 8-10, 11-13, 14-18 — each with its own vocabulary and analogies.
                                </span>
                            </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <Coins size={16} style={{ color: "hsl(var(--accent-gold))", marginTop: 2, flexShrink: 0 }} />
                            <span>
                                <strong style={{ fontWeight: 600 }}>10,000 virtual StockCoins.</strong>{" "}
                                <span style={{ color: "hsl(var(--text-secondary))" }}>
                                    Zero real-money risk. Reflection journals earn bonus coins.
                                </span>
                            </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <ShieldCheck size={16} style={{ color: "hsl(var(--accent-gold))", marginTop: 2, flexShrink: 0 }} />
                            <span>
                                <strong style={{ fontWeight: 600 }}>COPPA-compliant for under-13.</strong>{" "}
                                <span style={{ color: "hsl(var(--text-secondary))" }}>
                                    Parental-consent flow built-in. You stay in control of the data.
                                </span>
                            </span>
                        </li>
                    </ul>

                    {/* Sample pull-quote — what the kid actually sees */}
                    <div
                        data-testid="kids-discover-nudge-sample"
                        className="text-sm"
                        style={{
                            borderLeft: "2px solid hsl(var(--accent-gold))",
                            padding: "10px 14px",
                            background: "rgba(184,153,79,0.04)",
                            color: "hsl(var(--text-secondary))",
                            fontStyle: "italic",
                            lineHeight: 1.55,
                        }}
                    >
                        <span style={{ fontStyle: "normal", marginRight: 6 }}>🤔</span>
                        “Apple is strong, but mixed signals have the AI hitting pause.”
                        <span
                            className="block mt-1"
                            style={{
                                fontStyle: "normal",
                                fontSize: "0.7rem",
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                color: "hsl(var(--text-muted))",
                            }}
                        >
                            — what an 11-year-old sees
                        </span>
                    </div>

                    {/* CTAs */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <a
                            href={KIDS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={stampSeen}
                            data-testid="kids-discover-nudge-cta"
                            className="inline-flex items-center gap-2 transition-opacity"
                            style={{
                                background: "hsl(var(--accent-gold))",
                                color: "#1a1a1a",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                textDecoration: "none",
                                padding: "10px 18px",
                                borderRadius: 2,
                            }}
                        >
                            Try it for your kid <ArrowRight size={14} />
                        </a>
                        <a
                            href={SAMPLE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={stampSeen}
                            data-testid="kids-discover-nudge-sample-cta"
                            className="inline-flex items-center gap-2 transition-opacity hover:opacity-100"
                            style={{
                                color: "hsl(var(--accent-gold))",
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                textDecoration: "none",
                                padding: "10px 14px",
                                border: "1px solid hsl(var(--accent-gold) / 0.6)",
                                borderRadius: 2,
                                opacity: 0.9,
                            }}
                        >
                            <Eye size={14} /> See a live sample
                        </a>
                        <span
                            className="text-xs"
                            style={{
                                color: "hsl(var(--text-muted))",
                                fontSize: "0.72rem",
                            }}
                        >
                            Free · No card · 30 sec to try
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
