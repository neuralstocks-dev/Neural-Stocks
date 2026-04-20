import React from "react";

/**
 * Minimal inline sparkline using SVG. No axes, no labels - just a price trend.
 */
export default function Sparkline({ data = [], width = 160, height = 40, color = "hsl(var(--text-secondary))" }) {
    const values = data.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    if (values.length < 2) {
        return <div style={{ width, height, opacity: 0.2 }} className="border-b border-dashed" />;
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);
    const pts = values
        .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
        .join(" ");
    const first = values[0];
    const last = values[values.length - 1];
    const trend = last >= first ? "hsl(var(--buy))" : "hsl(var(--sell))";
    const strokeColor = color === "trend" ? trend : color;
    return (
        <svg width={width} height={height} style={{ display: "block" }}>
            <polyline
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
            />
        </svg>
    );
}
