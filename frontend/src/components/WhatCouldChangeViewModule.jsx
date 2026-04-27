import React from "react";

/**
 * "What could change the view" module — concrete observable shifts that
 * would weaken the current model classification. Renders only when the
 * LLM produced the field.
 */
export default function WhatCouldChangeViewModule({ items }) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return (
        <section className="module p-6 md:p-10" data-testid="what-could-change-module">
            <p className="text-overline">What could change the view</p>
            <h2
                className="font-serif mt-2 mb-6"
                style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.015em" }}
            >
                Concrete shifts to monitor.
            </h2>
            <ul className="space-y-3">
                {items.map((m, i) => (
                    <li
                        key={`wccv-${i}-${(m || "").slice(0, 30)}`}
                        className="flex gap-3 text-sm leading-relaxed"
                        style={{ color: "hsl(var(--text-primary))" }}
                        data-testid={`wccv-item-${i}`}
                    >
                        <span style={{ color: "hsl(var(--hold))" }}>·</span>
                        <span className="flex-1">{m}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}
