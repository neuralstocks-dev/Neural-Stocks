import React from "react";

/**
 * Alternative scenarios module — bullish/neutral/bearish framings of the
 * same data. Renders only when the LLM produced the field (older analyses
 * pre-Feb-2026 silently skip, so we don't break their layout).
 */
export default function AlternativeScenariosModule({ scenarios, shareCta }) {
    if (!scenarios) return null;
    const { bullish, bearish, neutral } = scenarios;
    if (!bullish && !bearish && !neutral) return null;

    return (
        <section id="alt-scenarios" className="module p-6 md:p-10 scroll-mt-24" data-testid="alt-scenarios-module">
            <div className="flex items-start justify-between gap-3">
                <p className="text-overline">Alternative scenarios</p>
                {shareCta}
            </div>
            <h2
                className="font-serif mt-2 mb-2"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.015em" }}
            >
                How else this could read.
            </h2>
            <p
                className="text-sm mb-6"
                style={{ color: "hsl(var(--text-muted))", lineHeight: 1.55, maxWidth: "60ch" }}
            >
                The same data can support multiple interpretations. Below are the conditions
                under which each direction would gain weight.
            </p>
            <div className="space-y-5">
                {bullish && (
                    <ScenarioPanel
                        kind="bullish"
                        label="Bullish scenario"
                        color="buy"
                        body={bullish}
                    />
                )}
                {neutral && (
                    <ScenarioPanel
                        kind="neutral"
                        label="Neutral scenario"
                        color="hold"
                        body={neutral}
                    />
                )}
                {bearish && (
                    <ScenarioPanel
                        kind="bearish"
                        label="Bearish scenario"
                        color="sell"
                        body={bearish}
                    />
                )}
            </div>
        </section>
    );
}

function ScenarioPanel({ kind, label, color, body }) {
    return (
        <div
            className="p-4"
            style={{
                borderLeft: `3px solid hsl(var(--${color}))`,
                background: "hsl(var(--surface-elevated))",
            }}
            data-testid={`alt-scenario-${kind}`}
        >
            <p
                className="text-overline"
                style={{ fontSize: "0.56rem", color: `hsl(var(--${color}))` }}
            >
                {label}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{body}</p>
        </div>
    );
}
