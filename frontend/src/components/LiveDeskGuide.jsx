import React, { useState } from "react";
import { Layers, Sparkles, FileText, FileDown, X, ChevronRight } from "lucide-react";

const STORAGE_KEY = "neulab_live_desk_guide_dismissed_v1";

const STEPS = [
    {
        n: "01",
        icon: Layers,
        title: "Pick a mode",
        body: "Standard (AI-only), Candlestick (patterns only), or Hybrid (AI + patterns — recommended). Your choice applies to every Analyze click below.",
    },
    {
        n: "02",
        icon: Sparkles,
        title: "Click Analyze",
        body: "Hit Analyze next to any watchlist stock — or run Top / Bottom 3 to sweep the whole list in one click. First results land in ~20-40 seconds.",
    },
    {
        n: "03",
        icon: FileText,
        title: "Read the verdict",
        body: "Open the analysis report for the full reasoning, candlestick findings, confidence score, price target, and horizon fit.",
    },
    {
        n: "04",
        icon: FileDown,
        title: "Export or share",
        body: "Download the full verdict as a branded PDF for your records, or share a public link with anyone — no login required on their side.",
    },
];

export default function LiveDeskGuide() {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });

    if (dismissed) return null;

    const handleDismiss = () => {
        try {
            localStorage.setItem(STORAGE_KEY, "1");
        } catch {
            /* noop */
        }
        setDismissed(true);
    };

    return (
        <section
            className="module px-5 md:px-6 py-5 mb-4 relative"
            style={{
                background:
                    "linear-gradient(135deg, hsla(38, 45%, 45%, 0.08) 0%, hsl(var(--surface)) 60%)",
                border: "1px solid hsl(var(--hold))",
            }}
            data-testid="live-desk-guide"
        >
            <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1 transition-colors"
                style={{ color: "hsl(var(--text-muted))" }}
                aria-label="Dismiss guide"
                data-testid="live-desk-guide-dismiss"
                title="Hide this guide"
            >
                <X size={14} strokeWidth={1.5} />
            </button>

            <div className="flex items-center gap-2 mb-4">
                <span className="text-overline" style={{ color: "hsl(var(--hold))", fontSize: "0.56rem" }}>
                    Live Desk · How to use
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-1 md:gap-3">
                {STEPS.map((s, i) => {
                    const Icon = s.icon;
                    const last = i === STEPS.length - 1;
                    return (
                        <div
                            key={s.n}
                            className="relative py-1 px-3 md:px-4"
                            data-testid={`live-desk-step-${s.n}`}
                        >
                            {!last && (
                                <ChevronRight
                                    size={12}
                                    strokeWidth={1.5}
                                    className="hidden md:block absolute"
                                    style={{
                                        right: -7,
                                        top: "36px",
                                        color: "hsl(var(--hold))",
                                        opacity: 0.5,
                                    }}
                                />
                            )}
                            <div className="flex items-center gap-2">
                                <span
                                    className="font-mono"
                                    style={{
                                        fontSize: "0.68rem",
                                        color: "hsl(var(--hold))",
                                        letterSpacing: "0.18em",
                                    }}
                                >
                                    {s.n}
                                </span>
                                <Icon size={14} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                            </div>
                            <h4
                                className="font-serif mt-2"
                                style={{
                                    fontSize: "1.05rem",
                                    letterSpacing: "-0.005em",
                                    color: "hsl(var(--text-primary))",
                                }}
                            >
                                {s.title}
                            </h4>
                            <p
                                className="mt-1.5 text-xs leading-relaxed"
                                style={{ color: "hsl(var(--text-secondary))" }}
                            >
                                {s.body}
                            </p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
