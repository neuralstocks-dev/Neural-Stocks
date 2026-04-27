import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Minus, BookOpen, Search } from "lucide-react";
import { PATTERN_GUIDE } from "@/data/patternGuide";

const BIAS_META = {
    bullish: { color: "hsl(var(--buy))", bg: "hsl(var(--buy-bg))", icon: TrendingUp, label: "BULLISH" },
    bearish: { color: "hsl(var(--sell))", bg: "hsl(var(--sell-bg))", icon: TrendingDown, label: "BEARISH" },
    neutral: { color: "hsl(var(--hold))", bg: "hsl(var(--hold-bg))", icon: Minus, label: "NEUTRAL" },
};

function BiasBadge({ bias }) {
    const m = BIAS_META[bias] || BIAS_META.neutral;
    const Icon = m.icon;
    return (
        <span
            className="font-mono inline-flex items-center gap-1.5 px-2 py-0.5"
            style={{
                color: m.color,
                background: m.bg,
                border: `1px solid ${m.color}`,
                fontSize: "0.58rem",
                letterSpacing: "0.12em",
                borderRadius: 2,
            }}
        >
            <Icon size={10} strokeWidth={2} /> {m.label}
        </span>
    );
}

const COUNT_LABEL = { single: "1-candle", two: "2-candle", three: "3-candle" };

function PatternCard({ p, highlighted }) {
    const m = BIAS_META[p.bias] || BIAS_META.neutral;
    return (
        <div
            className="p-5 md:p-6 flex flex-col h-full"
            style={{
                background: highlighted ? "hsla(38, 45%, 45%, 0.06)" : "hsl(var(--surface-elevated))",
                border: highlighted
                    ? "1px solid hsl(var(--hold))"
                    : "1px solid hsl(var(--border-default))",
                borderRadius: 2,
            }}
            data-testid={`pattern-card-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
        >
            <div className="flex items-start justify-between gap-2">
                <span
                    className="font-mono inline-block px-2 py-0.5"
                    style={{
                        border: "1px solid hsl(var(--border-default))",
                        color: "hsl(var(--text-muted))",
                        fontSize: "0.54rem",
                        letterSpacing: "0.14em",
                        borderRadius: 2,
                    }}
                >
                    {COUNT_LABEL[p.count] || p.count}
                </span>
                <BiasBadge bias={p.bias} />
            </div>
            <h3
                className="font-serif mt-4"
                style={{ fontSize: "1.35rem", letterSpacing: "-0.005em", color: m.color }}
            >
                {p.name}
            </h3>
            <p
                className="text-sm mt-1 italic"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {p.tagline}
            </p>
            <div className="mt-4 space-y-3 text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                <div>
                    <p className="text-overline" style={{ fontSize: "0.54rem" }}>Shape</p>
                    <p className="leading-relaxed">{p.shape}</p>
                </div>
                <div>
                    <p className="text-overline" style={{ fontSize: "0.54rem" }}>What it means</p>
                    <p className="leading-relaxed">{p.meaning}</p>
                </div>
                <div>
                    <p className="text-overline" style={{ fontSize: "0.54rem" }}>How to read it</p>
                    <p className="leading-relaxed">{p.how_to_read}</p>
                </div>
                <div>
                    <p className="text-overline" style={{ fontSize: "0.54rem" }}>Best when</p>
                    <p
                        className="leading-relaxed"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        {p.best_when}
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * PatternGuideDialog: Opens a modal containing all 15 candlestick patterns with
 * educational info. Patterns detected in the current verdict (highlightNames)
 * bubble to the top and get a highlighted border.
 */
export default function PatternGuideDialog({ open, onOpenChange, highlightNames = [] }) {
    const [query, setQuery] = useState("");
    const [biasFilter, setBiasFilter] = useState("all");

    const highlightSet = useMemo(
        () => new Set(highlightNames.map((n) => (n || "").toLowerCase())),
        [highlightNames]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = PATTERN_GUIDE.filter((p) => {
            if (biasFilter !== "all" && p.bias !== biasFilter) return false;
            if (!q) return true;
            return (
                p.name.toLowerCase().includes(q) ||
                p.tagline.toLowerCase().includes(q) ||
                p.meaning.toLowerCase().includes(q)
            );
        });
        // Detected-in-this-verdict patterns first
        return list.sort((a, b) => {
            const ah = highlightSet.has(a.name.toLowerCase()) ? 1 : 0;
            const bh = highlightSet.has(b.name.toLowerCase()) ? 1 : 0;
            return bh - ah;
        });
    }, [query, biasFilter, highlightSet]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-5xl w-[95vw] max-h-[88vh] overflow-hidden flex flex-col"
                style={{
                    background: "hsl(var(--surface))",
                    border: "1px solid hsl(var(--border-default))",
                    color: "hsl(var(--text-primary))",
                    borderRadius: 2,
                }}
                data-testid="pattern-guide-dialog"
            >
                <DialogHeader>
                    <p className="text-overline flex items-center gap-2">
                        <BookOpen size={12} strokeWidth={1.5} /> Candlestick Pattern Guide
                    </p>
                    <DialogTitle
                        className="font-serif mt-2"
                        style={{ fontSize: "1.8rem", letterSpacing: "-0.01em" }}
                    >
                        The 15 patterns Neural Stock Intelligence™ detects.
                    </DialogTitle>
                    <p
                        className="mt-2 text-sm"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        Each pattern below has a shape definition, what it means, how to read it, and when
                        it's most reliable.{highlightNames.length > 0 && " Patterns detected in this verdict are highlighted first."}
                    </p>
                </DialogHeader>

                {/* Search + bias filter */}
                <div className="flex items-center gap-3 flex-wrap pt-3 pb-2">
                    <div
                        className="flex items-center gap-2 px-3 py-2"
                        style={{
                            border: "1px solid hsl(var(--border-default))",
                            background: "hsl(var(--surface-elevated))",
                            borderRadius: 2,
                            flex: "1 1 260px",
                        }}
                    >
                        <Search size={14} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
                        <input
                            type="text"
                            placeholder="Search patterns…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="bg-transparent outline-none text-sm font-mono flex-1"
                            style={{ color: "hsl(var(--text-primary))" }}
                            data-testid="pattern-guide-search"
                        />
                    </div>
                    <div
                        className="inline-flex"
                        style={{
                            border: "1px solid hsl(var(--border-default))",
                            borderRadius: 2,
                            overflow: "hidden",
                        }}
                    >
                        {[
                            { v: "all", label: "All" },
                            { v: "bullish", label: "Bullish" },
                            { v: "bearish", label: "Bearish" },
                            { v: "neutral", label: "Neutral" },
                        ].map((b, i) => {
                            const active = biasFilter === b.v;
                            return (
                                <button
                                    key={b.v}
                                    type="button"
                                    onClick={() => setBiasFilter(b.v)}
                                    className="font-mono text-xs px-3 py-2"
                                    style={{
                                        background: active ? "hsl(var(--hold))" : "hsl(var(--surface))",
                                        color: active ? "hsl(var(--surface))" : "hsl(var(--text-primary))",
                                        borderLeft: i === 0 ? "none" : "1px solid hsl(var(--border-default))",
                                        letterSpacing: "0.08em",
                                        fontWeight: active ? 600 : 400,
                                        cursor: "pointer",
                                    }}
                                    data-testid={`pattern-guide-bias-${b.v}`}
                                >
                                    {b.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Cards grid — scrollable */}
                <div className="overflow-y-auto flex-1 pt-2 pb-4 pr-1">
                    {filtered.length === 0 ? (
                        <p
                            className="text-center py-10 text-sm"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            No patterns match your search.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filtered.map((p) => (
                                <PatternCard
                                    key={p.name}
                                    p={p}
                                    highlighted={highlightSet.has(p.name.toLowerCase())}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
