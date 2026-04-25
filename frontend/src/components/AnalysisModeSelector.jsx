import React from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles, Binary, Layers } from "lucide-react";

const MODES = [
    {
        value: "standard",
        label: "Standard",
        shortLabel: "Std",
        icon: Sparkles,
        description: "Classic AI analysis using technicals, fundamentals, and momentum.",
        pro: false,
    },
    {
        value: "candlestick",
        label: "Candlestick",
        shortLabel: "Candle",
        icon: Binary,
        description: "Pure candlestick pattern strategy. Detects Doji, Hammer, Engulfing, Morning/Evening Star, Three Soldiers/Crows and 10+ more. Best for timing entries and reversals.",
        pro: false,
    },
    {
        value: "hybrid",
        label: "Hybrid",
        shortLabel: "Hybrid",
        icon: Layers,
        description: "AI + Candlestick combined. Claude weighs fundamentals & technicals, then uses candlestick patterns for confirmation and timing. Recommended.",
        pro: false,
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
    disabled = false,
}) {
    const active = MODES.find((m) => m.value === value) || MODES[0];
    // Mobile-first: tighter padding so all three pills fit inside a 390px
    // viewport without the rightmost (Hybrid) clipping. sm:+ restores the
    // original desktop comfort.
    const pad = size === "sm" ? "px-1.5 py-1.5 sm:px-3" : "px-1.5 py-2 sm:px-4";
    const fontSize = size === "sm" ? "text-[0.68rem]" : "text-[0.7rem] sm:text-xs";

    return (
        <div data-testid={`${testIdPrefix}-selector`}>
            {/* Mobile: stack label above buttons (block). Desktop: inline-flex. */}
            <div className="block sm:flex sm:items-center sm:gap-2 sm:flex-wrap">
                <span
                    className="text-overline block sm:inline mb-1.5 sm:mb-0"
                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}
                >
                    {disabled ? "Mode used" : "Mode"}
                </span>
                <div
                    className="grid grid-cols-3 w-full sm:flex sm:w-auto"
                    style={{
                        border: "1px solid hsl(var(--border-default))",
                        borderRadius: 2,
                        overflow: "hidden",
                        opacity: disabled ? 0.85 : 1,
                    }}
                >
                    {MODES.map((m, i) => {
                        const isActive = value === m.value;
                        const locked = !disabled && m.pro && !canPro;
                        const clickDisabled = disabled || locked;
                        const Icon = m.icon;
                        return (
                            <button
                                key={m.value}
                                type="button"
                                onClick={() => {
                                    if (clickDisabled) return;
                                    onChange(m.value);
                                }}
                                disabled={clickDisabled}
                                title={
                                    disabled
                                        ? "This verdict was generated with the highlighted mode. Return to Dashboard to run a different mode."
                                        : locked
                                        ? `${m.label} mode requires Pro/Elite`
                                        : m.description
                                }
                                data-testid={`${testIdPrefix}-${m.value}`}
                                className={`${fontSize} font-mono ${pad} inline-flex items-center justify-center gap-1 sm:gap-2 min-w-0 whitespace-nowrap transition-colors`}
                                style={{
                                    background: isActive ? "hsl(var(--hold))" : "hsl(var(--surface))",
                                    color: isActive
                                        ? "hsl(var(--surface))"
                                        : (locked || disabled)
                                        ? "hsl(var(--text-muted))"
                                        : "hsl(var(--text-primary))",
                                    borderLeft:
                                        i === 0 ? "none" : "1px solid hsl(var(--border-default))",
                                    letterSpacing: "0.08em",
                                    fontWeight: isActive ? 600 : 400,
                                    cursor: clickDisabled ? "not-allowed" : "pointer",
                                    opacity: (!isActive && (locked || disabled)) ? 0.5 : 1,
                                }}
                            >
                                {locked ? (
                                    <Lock size={11} strokeWidth={1.8} />
                                ) : (
                                    <Icon size={12} strokeWidth={1.8} />
                                )}
                                <span className="truncate sm:hidden">{m.shortLabel}</span>
                                <span className="truncate hidden sm:inline">{m.label}</span>
                                {m.recommended && !locked && !disabled && (
                                    <span
                                        className="text-[0.5rem] hidden sm:inline"
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
                {!disabled && !canPro && (
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
                    {disabled
                        ? `This verdict was generated with ${active.label} mode. ${active.description}`
                        : active.description}
                </p>
            )}
        </div>
    );
}

export { MODES as ANALYSIS_MODES };
