import React from "react";
import {
    Database,
    LineChart,
    Layers,
    Newspaper,
    Gauge,
    BookOpen,
    Sparkles,
    FileText,
    Send,
    HardDrive,
} from "lucide-react";

/**
 * <PipelineFlowDiagram />
 *
 * SVG-rendered data-flow visualization of the 8-stage Neulab analysis
 * pipeline. Replaces the dense numbered list above with an at-a-glance
 * picture: where data starts, what gets computed in parallel, where the
 * AI reasoning happens, and what the user gets out the other end.
 *
 * Architecture choice — SVG over Canvas:
 *  - Sharp at any DPR (retina, 4K, mobile zoom).
 *  - Native accessibility: each <g> is keyboard-focusable.
 *  - CSS-driven animations via stroke-dashoffset on the connectors —
 *    no JS rAF loop, plays nicely with mobile battery life and
 *    `prefers-reduced-motion`.
 *
 * Layout (responsive):
 *  - md+ : single horizontal SVG, 5 parallel compute lanes between the
 *          ingest node and the LLM node, then 3 output fan-outs.
 *  - <md : vertical stacked card list (the SVG would force horizontal
 *          scroll on a 390-px screen and lose its spatial meaning).
 *
 * Color encoding:
 *   cyan   = ingest      (raw data lands here)
 *   gold   = compute     (deterministic transforms, no AI)
 *   violet = reasoning   (Claude — the only stochastic stop)
 *   green  = output      (artifacts the user takes away)
 */

// Compute lanes positioned in the middle column. Each lane carries one
// of the deterministic transforms that feeds the LLM payload. Order is
// vertical (top → bottom) for visual scan-ability — most-cited first
// (technicals/patterns), then context, then the new anchor.
const COMPUTE_LANES = [
    { key: "tech", icon: LineChart, label: "Technical indicators", sub: "RSI · MACD · BB · ATR · ADX" },
    { key: "candle", icon: Layers, label: "Candlestick patterns", sub: "15-pattern rule engine · daily + weekly" },
    { key: "ctx", icon: Newspaper, label: "Market context", sub: "Sector momentum · index trend" },
    { key: "sent", icon: Gauge, label: "Sentiment", sub: "News · IDX filings (Bandarmology)" },
    { key: "anchor", icon: BookOpen, label: "Intrinsic anchor", sub: "Graham + RIM · sector-aware" },
];

const OUTPUTS = [
    { key: "ui", icon: FileText, label: "Web verdict", sub: "Browser report" },
    { key: "pdf", icon: HardDrive, label: "PDF + Trade Slip", sub: "Downloadable artifacts" },
    { key: "alert", icon: Send, label: "Telegram alerts", sub: "Confidence ≥ 75 BUY/SELL" },
];

export default function PipelineFlowDiagram() {
    return (
        <div className="mt-10" data-testid="pipeline-flow-diagram">
            {/* Desktop / tablet ─ animated SVG flow */}
            <div className="hidden md:block">
                <FlowSVG />
                <FlowLegend />
            </div>
            {/* Mobile ─ stacked card flow */}
            <div className="md:hidden">
                <MobileFlow />
            </div>
        </div>
    );
}

/* ───────────────────────── desktop SVG flow ───────────────────────── */

function FlowSVG() {
    // Coord system: 1000 wide × 520 tall. Tweak here, viewBox does the rest.
    const W = 1000;
    const H = 520;
    const ingestX = 90;
    const computeX = 420;
    const reasonX = 720;
    const outputX = 920;
    const computeYStart = 60;
    const laneStep = 88; // 5 lanes × 88 = 440 → centers at 60 .. 412
    const reasonY = H / 2;
    const outputYStart = 130;
    const outputStep = 130;

    return (
        <div
            className="relative"
            style={{
                background:
                    "radial-gradient(ellipse at center, hsl(var(--surface-elevated)) 0%, hsl(var(--bg)) 80%)",
                border: "1px solid hsl(var(--border-divider))",
                borderRadius: 4,
                padding: "20px 12px",
            }}
        >
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ display: "block", maxHeight: 540 }}
                role="img"
                aria-label="Eight-stage analysis pipeline data flow"
            >
                <defs>
                    <linearGradient id="line-gold" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0.85" />
                    </linearGradient>
                    <linearGradient id="line-violet" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.85" />
                    </linearGradient>
                    <linearGradient id="line-green" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="hsl(var(--buy))" stopOpacity="0.85" />
                    </linearGradient>

                    {/* Animated stroke-dash for "data flowing" effect on connectors. */}
                    <style>{`
                        @keyframes flow-dash {
                            from { stroke-dashoffset: 36; }
                            to { stroke-dashoffset: 0; }
                        }
                        @keyframes pulse-soft {
                            0%, 100% { opacity: 0.55; }
                            50% { opacity: 1; }
                        }
                        @media (prefers-reduced-motion: reduce) {
                            .flow-anim { animation: none !important; }
                        }
                        .flow-conn {
                            stroke-dasharray: 4 6;
                            animation: flow-dash 1.3s linear infinite;
                            fill: none;
                        }
                        .flow-conn-fast { animation-duration: 0.95s; }
                        .flow-pulse { animation: pulse-soft 2.4s ease-in-out infinite; }
                        .flow-node-bg { fill: hsl(var(--surface-elevated)); stroke-width: 1.25; }
                        .flow-node-bg:hover { fill: hsl(var(--bg)); }
                    `}</style>
                </defs>

                {/* ───── connector layer ─────────────────────────────────── */}
                {/* INGEST → 5 compute lanes (gold) */}
                {COMPUTE_LANES.map((_, i) => {
                    const y2 = computeYStart + i * laneStep;
                    return (
                        <path
                            key={`in-${i}`}
                            className="flow-conn flow-anim"
                            d={`M ${ingestX + 70} ${reasonY} C ${ingestX + 200} ${reasonY}, ${computeX - 200} ${y2}, ${computeX - 70} ${y2}`}
                            stroke="url(#line-gold)"
                            strokeWidth="1.5"
                        />
                    );
                })}

                {/* 5 compute lanes → REASON (violet) */}
                {COMPUTE_LANES.map((_, i) => {
                    const y1 = computeYStart + i * laneStep;
                    return (
                        <path
                            key={`mid-${i}`}
                            className="flow-conn flow-anim flow-conn-fast"
                            d={`M ${computeX + 70} ${y1} C ${computeX + 200} ${y1}, ${reasonX - 200} ${reasonY}, ${reasonX - 70} ${reasonY}`}
                            stroke="url(#line-violet)"
                            strokeWidth="1.5"
                        />
                    );
                })}

                {/* REASON → 3 outputs (green) */}
                {OUTPUTS.map((_, i) => {
                    const y2 = outputYStart + i * outputStep;
                    return (
                        <path
                            key={`out-${i}`}
                            className="flow-conn flow-anim"
                            d={`M ${reasonX + 70} ${reasonY} C ${reasonX + 130} ${reasonY}, ${outputX - 130} ${y2}, ${outputX - 60} ${y2}`}
                            stroke="url(#line-green)"
                            strokeWidth="1.5"
                        />
                    );
                })}

                {/* ───── nodes ───────────────────────────────────────────── */}
                {/* Ingest */}
                <Node
                    x={ingestX}
                    y={reasonY}
                    color="cyan"
                    overline="01"
                    label="Data ingest"
                    sub="yfinance · Finnhub · IDX"
                    Icon={Database}
                    width={140}
                />

                {/* Compute lanes */}
                {COMPUTE_LANES.map((lane, i) => (
                    <Node
                        key={lane.key}
                        x={computeX}
                        y={computeYStart + i * laneStep}
                        color="gold"
                        overline={String(i + 2).padStart(2, "0")}
                        label={lane.label}
                        sub={lane.sub}
                        Icon={lane.icon}
                        width={170}
                    />
                ))}

                {/* Reason (LLM) — bigger node, violet */}
                <Node
                    x={reasonX}
                    y={reasonY}
                    color="violet"
                    overline="07"
                    label="Claude Sonnet 4.5"
                    sub="LLM reasoning"
                    Icon={Sparkles}
                    width={170}
                    big
                />

                {/* Outputs */}
                {OUTPUTS.map((o, i) => (
                    <Node
                        key={o.key}
                        x={outputX}
                        y={outputYStart + i * outputStep}
                        color="green"
                        overline={i === 0 ? "08" : ""}
                        label={o.label}
                        sub={o.sub}
                        Icon={o.icon}
                        width={150}
                    />
                ))}
            </svg>
        </div>
    );
}

/* ───────────────────────── node primitive ─────────────────────────── */

const COLOR_VAR = {
    cyan: "184, 75%, 60%",
    gold: "var(--gold)",
    violet: "256, 92%, 76%",
    green: "var(--buy)",
};

function Node({ x, y, color, overline, label, sub, Icon, width, big = false }) {
    // CSS HSL values aren't valid inside SVG inline style without `hsl()` wrap.
    // For named CSS vars (gold/buy) we use `hsl(var(--gold))`; for raw hsl
    // tuples we pass them through directly.
    const stroke = color === "gold" || color === "green"
        ? `hsl(${COLOR_VAR[color]})`
        : `hsl(${COLOR_VAR[color]})`;
    const h = big ? 92 : 72;
    const w = width;
    const left = x - w / 2;
    const top = y - h / 2;
    return (
        <g className="flow-pulse">
            <rect
                x={left}
                y={top}
                width={w}
                height={h}
                rx={3}
                className="flow-node-bg"
                stroke={stroke}
            />
            {/* Color tab on left edge */}
            <rect x={left} y={top} width={3} height={h} fill={stroke} rx={1.5} />
            {/* Icon ─ rendered via foreignObject so we can reuse lucide-react.
                Slight offset so the icon hugs the left padding. */}
            <foreignObject x={left + 12} y={top + 12} width={20} height={20}>
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: stroke }}>
                    <Icon size={16} strokeWidth={1.5} />
                </div>
            </foreignObject>
            {overline && (
                <text
                    x={left + w - 12}
                    y={top + 18}
                    textAnchor="end"
                    fontFamily="ui-monospace, 'IBM Plex Mono', monospace"
                    fontSize="9"
                    letterSpacing="2"
                    fill={stroke}
                    opacity="0.85"
                >
                    {overline}
                </text>
            )}
            <text
                x={left + 38}
                y={top + 26}
                fontFamily="Crimson Pro, 'Times New Roman', serif"
                fontSize={big ? 16 : 14}
                fontWeight="500"
                fill="hsl(var(--text-primary))"
            >
                {label}
            </text>
            <text
                x={left + 14}
                y={top + h - 16}
                fontFamily="ui-monospace, 'IBM Plex Mono', monospace"
                fontSize="9.5"
                fill="hsl(var(--text-muted))"
            >
                {sub}
            </text>
        </g>
    );
}

/* ───────────────────────── legend ─────────────────────────────────── */

function FlowLegend() {
    return (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center font-mono"
            style={{ fontSize: "10px", color: "hsl(var(--text-muted))" }}
        >
            <LegendDot color="hsl(184, 75%, 60%)" label="Data ingest" />
            <LegendDot color="hsl(var(--gold))" label="Deterministic compute" />
            <LegendDot color="hsl(256, 92%, 76%)" label="AI reasoning (stochastic)" />
            <LegendDot color="hsl(var(--buy))" label="Output artifact" />
            <span className="opacity-70">⏱ ≈ 12–18 s end-to-end</span>
        </div>
    );
}

function LegendDot({ color, label }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }}
            />
            <span className="uppercase tracking-wider">{label}</span>
        </span>
    );
}

/* ───────────────────────── mobile vertical flow ───────────────────── */

const ALL_STAGES_MOBILE = [
    { color: "cyan", overline: "01", label: "Data ingest", sub: "yfinance · Finnhub · IDX provider", Icon: Database },
    ...COMPUTE_LANES.map((l, i) => ({
        color: "gold",
        overline: String(i + 2).padStart(2, "0"),
        label: l.label,
        sub: l.sub,
        Icon: l.icon,
    })),
    { color: "violet", overline: "07", label: "Claude Sonnet 4.5", sub: "LLM reasoning", Icon: Sparkles },
    { color: "green", overline: "08", label: "Verdict + outputs", sub: "Web · PDF · Telegram", Icon: FileText },
];

function MobileFlow() {
    return (
        <ol className="space-y-2" data-testid="pipeline-flow-mobile">
            {ALL_STAGES_MOBILE.map((s, i) => (
                <li key={s.overline} className="relative">
                    <MobileFlowCard {...s} />
                    {i < ALL_STAGES_MOBILE.length - 1 && (
                        <div
                            aria-hidden="true"
                            className="mx-auto"
                            style={{
                                width: 1,
                                height: 14,
                                background: `linear-gradient(180deg, hsl(${COLOR_VAR[s.color]}) 0%, transparent 100%)`,
                            }}
                        />
                    )}
                </li>
            ))}
            <li className="text-center pt-2 font-mono" style={{ fontSize: "10px", color: "hsl(var(--text-muted))" }}>
                ⏱ ≈ 12–18 s end-to-end
            </li>
        </ol>
    );
}

function MobileFlowCard({ color, overline, label, sub, Icon }) {
    const c = `hsl(${COLOR_VAR[color]})`;
    return (
        <div
            className="flex items-center gap-3 p-3 rounded-sm"
            style={{
                border: "1px solid hsl(var(--border-divider))",
                borderLeft: `3px solid ${c}`,
                background: "hsl(var(--surface-elevated))",
            }}
        >
            <Icon size={18} strokeWidth={1.5} style={{ color: c, flexShrink: 0 }} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span
                        className="font-mono"
                        style={{ fontSize: "9px", color: c, letterSpacing: "0.18em" }}
                    >
                        {overline}
                    </span>
                    <span
                        className="font-serif"
                        style={{ fontSize: "0.95rem", color: "hsl(var(--text-primary))" }}
                    >
                        {label}
                    </span>
                </div>
                <p
                    className="mt-0.5 font-mono"
                    style={{ fontSize: "10.5px", color: "hsl(var(--text-muted))" }}
                >
                    {sub}
                </p>
            </div>
        </div>
    );
}
