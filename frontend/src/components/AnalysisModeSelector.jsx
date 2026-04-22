import React from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles, Binary, Layers } from "lucide-react";

const MODES = [
    {
        value: "standard",
        label: "Standard",
        icon: Sparkles,
        description: "Classic AI analysis using technicals, fundamentals, and momentum.",
        pro: false,
    },
    {
        value: "candlestick",
        label: "Candlestick",
        icon: Binary,
        description: "Pure candlestick pattern strategy. Detects Doji, Hammer, Engulfing, Morning/Evening Star, Three Soldiers/Crows and 10+ more. Best for timing entries and reversals.",
        pro: true,
    },
    {
        value: "hybrid",
        label: "Hybrid",
        icon: Layers,
        description: "AI + Candlestick combined. Claude weighs fundamentals & technicals, then uses candlestick patterns for confirmation and timing. Recommended.",
        pro: true,
        recommended: true,
    },
];

/**
 * Shared analysis-mode selector.
 * Props:
 *  - value: current mode ("standard" | "candlestick" | "hybrid")
 *  - onChange: (mode) => void
 *  - canPro: boolean — whether user can access Pro-gated modes
 *  - size: "sm" | "md" — visual size
 *  - testIdPrefix: data-testid prefix
 */
export default function AnalysisModeSelector({
    value,
    onChange,
    canPro,
    size = "md",
    testIdPrefix = "mode",
    hideDescription = false,
}) {
    const active = MODES.find((m) => m.value === value) || MODES[0];
    const pad = size === "sm" ? "px-3 py-1.5" : "px-4 py-2";
    const fontSize = size === "sm" ? "text-[0.68rem]" : "text-xs";

    return (
        <div data-testid={`${testIdPrefix}-selector`}>
            <div className="flex items-center gap-2 flex-wrap">
                <span
                    className="text-overline"
                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}
                >
                    Mode
                </span>
                <div
                    className="inline-flex"
                    style={{
                        border: "1px solid hsl(var(--border-default))",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    {MODES.map((m, i) => {
                        const isActive = value === m.value;
                        const locked = m.pro && !canPro;
                        const Icon = m.icon;
                        return (
                            <button
                                key={m.value}
                                type="button"
                                onClick={() => {
                                    if (locked) return;
                                    onChange(m.value);
                                }}
                                disabled={locked}
                                title={locked ? `${m.label} mode requires Pro/Elite` : m.description}
                                data-testid={`${testIdPrefix}-${m.value}`}
                                className={`${fontSize} font-mono ${pad} inline-flex items-center gap-2 transition-colors`}
                                style={{
                                    background: isActive ? "hsl(var(--hold))" : "hsl(var(--surface))",
                                    color: isActive
                                        ? "hsl(var(--surface))"
                                        : locked
                                        ? "hsl(var(--text-muted))"
                                        : "hsl(var(--text-primary))",
                                    borderLeft:
                                        i === 0 ? "none" : "1px solid hsl(var(--border-default))",
                                    letterSpacing: "0.08em",
                                    fontWeight: isActive ? 600 : 400,
                                    cursor: locked ? "not-allowed" : "pointer",
                                    opacity: locked ? 0.55 : 1,
                                }}
                            >
                                {locked ? (
                                    <Lock size={11} strokeWidth={1.8} />
                                ) : (
                                    <Icon size={12} strokeWidth={1.8} />
                                )}
                                <span>{m.label}</span>
                                {m.recommended && !locked && (
                                    <span
                                        className="text-[0.5rem]"
                                        style={{
                                            color: isActive
                                                ? "hsl(var(--surface))"
                                                : "hsl(var(--buy))",
                                            letterSpacing: "0.14em",
                                        }}
                                    >
                                        ★
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                {!canPro && (
                    <Link
                        to="/pricing"
                        className="text-overline"
                        style={{
                            color: "hsl(var(--hold))",
                            fontSize: "0.56rem",
                            letterSpacing: "0.1em",
                        }}
                        data-testid={`${testIdPrefix}-upgrade-link`}
                    >
                        Unlock Candlestick & Hybrid →
                    </Link>
                )}
            </div>
            {!hideDescription && (
                <p
                    className="mt-2 text-xs leading-relaxed"
                    style={{ color: "hsl(var(--text-secondary))", maxWidth: "68ch" }}
                    data-testid={`${testIdPrefix}-description`}
                >
                    {active.description}
                </p>
            )}
        </div>
    );
}

export { MODES as ANALYSIS_MODES };
