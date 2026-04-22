import React, { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, BookOpen } from "lucide-react";
import PatternGuideDialog from "@/components/PatternGuideDialog";

function BiasBadge({ bias }) {
    const map = {
        bullish: { c: "hsl(var(--buy))", bg: "hsl(var(--buy-bg))", label: "BULLISH", icon: TrendingUp },
        bearish: { c: "hsl(var(--sell))", bg: "hsl(var(--sell-bg))", label: "BEARISH", icon: TrendingDown },
        neutral: { c: "hsl(var(--hold))", bg: "hsl(var(--hold-bg))", label: "NEUTRAL", icon: Minus },
    };
    const m = map[bias] || map.neutral;
    const Icon = m.icon;
    return (
        <span
            className="font-mono inline-flex items-center gap-1.5 px-2 py-0.5"
            style={{
                color: m.c,
                background: m.bg,
                border: `1px solid ${m.c}`,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                borderRadius: 2,
            }}
        >
            <Icon size={10} strokeWidth={2} /> {m.label}
        </span>
    );
}

function PatternRow({ p }) {
    return (
        <div
            className="py-3 px-4 flex items-start gap-4"
            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
            data-testid={`pattern-row-${(p.pattern || "").toLowerCase().replace(/\s+/g, "-")}`}
        >
            <div className="shrink-0 min-w-[90px]">
                <BiasBadge bias={p.bias} />
            </div>
            <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <p
                        className="font-serif"
                        style={{ fontSize: "1.05rem", letterSpacing: "-0.005em" }}
                    >
                        {p.pattern}
                    </p>
                    <p
                        className="font-mono text-xs"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        {p.candle_date?.slice(0, 10)} · strength {p.strength}
                    </p>
                </div>
                <p
                    className="text-sm leading-relaxed mt-1"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    {p.explanation}
                </p>
            </div>
        </div>
    );
}

function TimeframeColumn({ label, data }) {
    const patterns = data?.patterns || [];
    return (
        <div
            className="module"
            style={{ background: "hsl(var(--surface))" }}
            data-testid={`candlestick-${label.toLowerCase()}-column`}
        >
            <div
                className="p-4 md:p-5 flex items-center justify-between"
                style={{ borderBottom: "1px solid hsl(var(--border-default))" }}
            >
                <div>
                    <p className="text-overline" style={{ fontSize: "0.56rem" }}>
                        {label} timeframe
                    </p>
                    <p
                        className="font-mono text-xs mt-1"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        {data?.scanned_candles || 0} candles scanned
                    </p>
                </div>
                <BiasBadge bias={data?.net_bias || "neutral"} />
            </div>
            {patterns.length === 0 ? (
                <div
                    className="py-8 text-center text-xs"
                    style={{ color: "hsl(var(--text-muted))" }}
                >
                    No patterns detected on this timeframe.
                </div>
            ) : (
                <div>
                    {patterns.map((p) => (
                        <PatternRow
                            key={`${p.pattern}-${p.candle_date}`}
                            p={p}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function CandlestickFindings({ findings, summary, mode }) {
    const [guideOpen, setGuideOpen] = useState(false);
    const detectedNames = useMemo(() => {
        if (!findings) return [];
        const names = [];
        for (const tf of ["daily", "weekly"]) {
            const pats = findings[tf]?.patterns || [];
            for (const p of pats) if (p.pattern) names.push(p.pattern);
        }
        return names;
    }, [findings]);

    if (!findings) return null;
    const daily = findings.daily || {};
    const weekly = findings.weekly || {};
    const any = (daily.patterns?.length || 0) + (weekly.patterns?.length || 0);

    return (
        <section
            className="module p-6 md:p-10 mb-1 md:mb-4"
            data-testid="candlestick-findings-module"
        >
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Zap size={12} strokeWidth={1.5} /> Candlestick findings
                        <span
                            className="font-mono"
                            style={{
                                fontSize: "0.56rem",
                                color: "hsl(var(--hold))",
                                letterSpacing: "0.14em",
                            }}
                        >
                            · {mode?.toUpperCase()} MODE
                        </span>
                    </p>
                    <h2
                        className="font-serif mt-2"
                        style={{
                            fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
                            letterSpacing: "-0.015em",
                        }}
                    >
                        Pattern evidence.
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className="text-overline"
                        style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                    >
                        Combined bias
                    </span>
                    <BiasBadge bias={findings.combined_bias || "neutral"} />
                </div>
            </div>

            {any === 0 && (
                <p
                    className="mt-4 text-sm"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    No qualifying candlestick patterns were detected on either timeframe.
                    The AI verdict above is based on price action, technicals, and fundamentals alone.
                </p>
            )}

            {any > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4 mt-5">
                    <TimeframeColumn label="Daily" data={daily} />
                    <TimeframeColumn label="Weekly" data={weekly} />
                </div>
            )}

            {summary && (
                <div
                    className="mt-6 p-5 md:p-6"
                    style={{
                        background: "hsl(var(--surface-elevated))",
                        border: "1px solid hsl(var(--border-default))",
                        borderRadius: 2,
                    }}
                    data-testid="candlestick-summary-block"
                >
                    <p className="text-overline">How the AI used these patterns</p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-5">
                        <SummaryList
                            label="Primary signal"
                            items={summary.primary_patterns}
                            color="hsl(var(--buy))"
                            testId="primary-patterns"
                        />
                        <SummaryList
                            label="Confirmation"
                            items={summary.confirmation_patterns}
                            color="hsl(var(--hold))"
                            testId="confirmation-patterns"
                        />
                        <SummaryList
                            label="Rejected / overridden"
                            items={summary.rejected_patterns}
                            color="hsl(var(--text-muted))"
                            testId="rejected-patterns"
                        />
                    </div>
                    <p
                        className="text-overline mt-5"
                        style={{ fontSize: "0.56rem" }}
                    >
                        Timeframe used · {summary.timeframe_used || "—"}
                    </p>
                    {summary.bias_alignment && (
                        <p
                            className="mt-3 text-sm leading-relaxed"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            {summary.bias_alignment}
                        </p>
                    )}
                </div>
            )}

            {/* Learn more */}
            <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs" style={{ color: "hsl(var(--text-secondary))", maxWidth: "52ch" }}>
                    Not sure what a pattern means? Open the reference guide for shape diagrams, meaning, and how
                    to read each of the 15 patterns Neulab detects.
                </p>
                <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="btn-quick inline-flex items-center gap-2"
                    data-testid="open-pattern-guide-button"
                >
                    <BookOpen size={14} strokeWidth={1.5} />
                    Learn about patterns
                </button>
            </div>

            <PatternGuideDialog
                open={guideOpen}
                onOpenChange={setGuideOpen}
                highlightNames={detectedNames}
            />
        </section>
    );
}

function SummaryList({ label, items, color, testId }) {
    const list = Array.isArray(items) ? items : [];
    return (
        <div data-testid={`candlestick-${testId}`}>
            <p
                className="text-overline"
                style={{ color, fontSize: "0.56rem" }}
            >
                {label}
            </p>
            {list.length === 0 ? (
                <p
                    className="mt-2 font-mono text-xs"
                    style={{ color: "hsl(var(--text-muted))" }}
                >
                    —
                </p>
            ) : (
                <ul className="mt-2 space-y-1.5">
                    {list.map((item, i) => (
                        <li
                            key={`${label}-${i}`}
                            className="font-mono text-xs leading-relaxed"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            · {typeof item === "string" ? item : JSON.stringify(item)}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
