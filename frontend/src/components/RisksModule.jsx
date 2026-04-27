import React from "react";
import { AlertTriangle } from "lucide-react";

/**
 * "Risks to the current interpretation" module — frames the LLM's
 * `risk_factors` array as conditions under which the model classification
 * would weaken, NOT as exhaustive holding risks. Educational tone.
 */
export default function RisksModule({ risks }) {
    const items = Array.isArray(risks) ? risks : [];
    if (items.length === 0) return null;
    return (
        <section className="module p-6 md:p-10" data-testid="risks-module">
            <p className="text-overline flex items-center gap-2">
                <AlertTriangle size={12} strokeWidth={1.5} /> Risks to the current interpretation
            </p>
            <h2
                className="font-serif mt-2 mb-2"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.015em" }}
            >
                Where the read could fail.
            </h2>
            <p
                className="text-sm mb-6"
                style={{ color: "hsl(var(--text-muted))", lineHeight: 1.55, maxWidth: "60ch" }}
            >
                These are conditions under which the current model classification would
                weaken — not exhaustive risks of holding the security.
            </p>
            <ol className="space-y-4">
                {items.map((r, i) => (
                    <li
                        key={`risk-${i}-${(r || "").slice(0, 30)}`}
                        className="flex gap-4 pb-4"
                        style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                        data-testid={`risk-item-${i}`}
                    >
                        <span
                            className="font-mono text-xs mt-1"
                            style={{ color: "hsl(var(--sell))", minWidth: "2rem" }}
                        >
                            R.{String(i + 1).padStart(2, "0")}
                        </span>
                        <p className="text-sm leading-relaxed flex-1">{r}</p>
                    </li>
                ))}
            </ol>
        </section>
    );
}
