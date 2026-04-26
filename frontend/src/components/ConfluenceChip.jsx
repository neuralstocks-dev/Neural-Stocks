/**
 * ConfluenceChip — prominent banner shown on IDX verdict pages when the
 * candlestick analyzer and bandarmology agree (or disagree). Rendered
 * above the CandlestickFindings card so the user sees it first.
 *
 * Three variants:
 *  - bullish  — both signals agree on upside (green, strong CTA styling)
 *  - bearish  — both signals agree on downside (red)
 *  - divergence — they disagree (amber caution)
 */
import React from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const STYLE = {
    bullish: {
        color: "hsl(var(--buy))",
        bg: "hsla(145,45%,55%,0.08)",
        icon: CheckCircle2,
        badge: "BULLISH CONFLUENCE",
    },
    bearish: {
        color: "hsl(var(--sell))",
        bg: "hsla(0,55%,55%,0.08)",
        icon: XCircle,
        badge: "BEARISH CONFLUENCE",
    },
    divergence: {
        color: "hsl(var(--hold))",
        bg: "hsla(38,75%,55%,0.08)",
        icon: AlertTriangle,
        badge: "SIGNAL DIVERGENCE",
    },
};

// Tier → color band. Mirrors the backend `_confluence_quality()` cutoffs
// (excellent ≥80, strong ≥60, moderate ≥40, weak <40) so we don't have to
// re-derive thresholds on the client.
const QUALITY_TIER_STYLE = {
    excellent: { color: "hsl(var(--buy))", label: "Excellent" },
    strong:    { color: "hsl(var(--buy))", label: "Strong" },
    moderate:  { color: "hsl(var(--hold))", label: "Moderate" },
    weak:      { color: "hsl(var(--text-muted))", label: "Weak" },
};

function freshnessTooltip(ageDays) {
    if (ageDays == null) return "Filing age unavailable";
    if (ageDays === 0) return "Filed today — maximum freshness weight";
    if (ageDays === 1) return "Filed yesterday — same-day weight";
    if (ageDays < 30) return `Filed ${ageDays} days ago — high freshness weight`;
    const months = Math.round(ageDays / 30);
    if (ageDays < 60) return `Filed ${months} month${months === 1 ? "" : "s"} ago — moderate weight, signal still recent`;
    return `Filed ${months} months ago — degrading weight, approaching stale cutoff (90d)`;
}

export default function ConfluenceChip({ confluence }) {
    if (!confluence) return null;
    const cfg = STYLE[confluence.direction] || STYLE.divergence;
    const Icon = cfg.icon;
    const patterns = confluence.patterns || [];
    const accPct = confluence.accumulation_ratio != null
        ? Math.round(confluence.accumulation_ratio * 100)
        : null;

    return (
        <section
            className="p-5 md:p-6 mb-1 md:mb-4"
            style={{
                background: cfg.bg,
                border: `1px solid ${cfg.color}`,
                borderRadius: 2,
            }}
            data-testid="confluence-chip"
        >
            <div className="flex items-start gap-4">
                <Icon size={24} strokeWidth={1.25} style={{ color: cfg.color, flexShrink: 0 }} className="mt-1" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span
                            className="px-2 py-0.5 font-mono"
                            style={{
                                fontSize: "0.65rem",
                                background: cfg.color,
                                color: "hsl(var(--bg))",
                                letterSpacing: "0.08em",
                            }}
                            data-testid="confluence-badge"
                        >
                            {cfg.badge}
                        </span>
                        {confluence.strength && confluence.direction !== "divergence" ? (
                            <span className="text-[11px] font-mono uppercase" style={{ color: "hsl(var(--text-muted))" }}>
                                · {confluence.strength}
                            </span>
                        ) : null}
                        {/* Quality score badge — surfaces the multiplicative
                            weight of {freshness × regime × pattern_count ×
                            direction}. Lets users instantly tell a same-day
                            3-pattern strong-accumulation confluence (95+
                            "excellent") from an 80-day 1-pattern mild one
                            ("weak") — both pass the binary trigger but mean
                            wildly different things. */}
                        {typeof confluence.quality_score === "number" ? (
                            <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10.5px]"
                                style={{
                                    border: `1px solid ${(QUALITY_TIER_STYLE[confluence.quality_tier] || QUALITY_TIER_STYLE.moderate).color}`,
                                    color: (QUALITY_TIER_STYLE[confluence.quality_tier] || QUALITY_TIER_STYLE.moderate).color,
                                    borderRadius: 2,
                                }}
                                data-testid="confluence-quality-badge"
                                title={
                                    `Quality ${confluence.quality_score}/100 (${confluence.quality_tier}). ` +
                                    `Computed as freshness × regime × patterns × direction. ` +
                                    freshnessTooltip(confluence.freshness_age_days)
                                }
                            >
                                <span style={{ opacity: 0.7 }}>QUALITY</span>
                                <strong>{confluence.quality_score}</strong>
                                <span style={{ opacity: 0.55, fontSize: "0.85em" }}>/100</span>
                                <span
                                    className="uppercase"
                                    style={{ fontSize: "0.85em", letterSpacing: "0.05em", opacity: 0.85 }}
                                >
                                    · {(QUALITY_TIER_STYLE[confluence.quality_tier] || QUALITY_TIER_STYLE.moderate).label}
                                </span>
                            </span>
                        ) : null}
                    </div>
                    <h3
                        className="font-serif mt-2"
                        style={{ fontSize: "1.35rem", color: "hsl(var(--text-primary))", letterSpacing: "-0.01em" }}
                    >
                        {confluence.label}
                    </h3>
                    <p className="mt-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        {confluence.direction === "bullish" ? (
                            <>
                                {confluence.pattern_count} bullish candlestick pattern{confluence.pattern_count > 1 ? "s" : ""} (
                                {patterns.join(", ")}) aligned with{" "}
                                <strong style={{ color: cfg.color }}>{accPct}% insider accumulation</strong>.
                                Two independent signals pointing the same direction is a higher-conviction setup than either
                                alone — but neither is a guarantee. Size positions accordingly.
                            </>
                        ) : confluence.direction === "bearish" ? (
                            <>
                                {confluence.pattern_count} bearish pattern{confluence.pattern_count > 1 ? "s" : ""} (
                                {patterns.join(", ")}) aligned with{" "}
                                <strong style={{ color: cfg.color }}>{100 - (accPct ?? 50)}% insider distribution</strong>.
                                Both the price action and the insider ledger are leaning down. Consider tightening stops or
                                reducing exposure — but a reversal can still surprise you.
                            </>
                        ) : (
                            <>
                                The candlestick analyzer flagged {confluence.pattern_count} reversal pattern
                                {confluence.pattern_count > 1 ? "s" : ""} ({patterns.join(", ")}) that{" "}
                                <strong style={{ color: cfg.color }}>disagrees with the insider flow</strong>{" "}
                                ({accPct}% accumulation). When price-action and smart-money signals pull opposite directions,
                                wait for one to resolve before sizing up.
                            </>
                        )}
                    </p>
                </div>
            </div>
        </section>
    );
}
