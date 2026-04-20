import React from "react";

/**
 * AI Verdict radial ring with typographic confidence score.
 * Matches design spec: thin SVG ring, signal-colored stroke, huge mono number.
 */
export default function VerdictRing({ score = 0, signal = "HOLD", size = 200 }) {
    const s = (signal || "HOLD").toUpperCase();
    const color =
        s === "BUY" ? "hsl(var(--buy))" : s === "SELL" ? "hsl(var(--sell))" : "hsl(var(--hold))";
    const clamped = Math.max(0, Math.min(100, Number(score) || 0));
    const stroke = 2;
    const radius = size / 2 - 8;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clamped / 100) * circumference;

    return (
        <div
            className="relative"
            style={{ width: size, height: size }}
            data-testid="verdict-ring"
        >
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke="hsl(var(--border-default))"
                    strokeWidth={stroke}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                    style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2,0.7,0.2,1)" }}
                />
                {/* tick marks around ring */}
                {Array.from({ length: 40 }).map((_, i) => {
                    const a = (i / 40) * Math.PI * 2;
                    const inner = radius - 10;
                    const outer = radius - 4;
                    const cx = size / 2;
                    const cy = size / 2;
                    const x1 = cx + Math.cos(a) * inner;
                    const y1 = cy + Math.sin(a) * inner;
                    const x2 = cx + Math.cos(a) * outer;
                    const y2 = cy + Math.sin(a) * outer;
                    return (
                        <line
                            key={i}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="hsl(var(--border-divider))"
                            strokeWidth={0.5}
                        />
                    );
                })}
            </svg>
            <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ pointerEvents: "none" }}
            >
                <span className="text-overline" style={{ color }}>
                    {s}
                </span>
                <span
                    className="font-mono hero-number"
                    style={{
                        fontSize: size / 3.4,
                        color: "hsl(var(--text-primary))",
                        marginTop: 4,
                    }}
                    data-testid="verdict-score"
                >
                    {clamped}
                </span>
                <span className="text-overline" style={{ fontSize: "0.56rem", marginTop: 2 }}>
                    Confidence · %
                </span>
            </div>
        </div>
    );
}
