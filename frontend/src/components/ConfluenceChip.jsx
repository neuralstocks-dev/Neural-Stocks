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
