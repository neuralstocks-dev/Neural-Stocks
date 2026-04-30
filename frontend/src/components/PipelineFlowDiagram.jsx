import React, { useEffect, useState, useMemo } from "react";
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
// `target` is either a CSS selector or a data-testid we resolve at click
// time — clicking the node smooth-scrolls the matching detail section
// into view, turning the diagram into the page's table of contents.
const COMPUTE_LANES = [
    { key: "tech", icon: LineChart, label: "Technical indicators", sub: "RSI · MACD · BB · ATR · ADX", target: '[data-testid="pipeline-stage-02"]' },
    { key: "candle", icon: Layers, label: "Candlestick patterns", sub: "15-pattern rule engine · daily + weekly", target: '[data-testid="pipeline-stage-03"]' },
    { key: "ctx", icon: Newspaper, label: "Market context", sub: "Sector momentum · index trend", target: '[data-testid="pipeline-stage-04"]' },
    { key: "sent", icon: Gauge, label: "Sentiment", sub: "News · IDX filings (Bandarmology)", target: "#bandarmology" },
    { key: "anchor", icon: BookOpen, label: "Intrinsic anchor", sub: "Graham + RIM · sector-aware", target: "#intrinsic-anchor" },
];

const OUTPUTS = [
    { key: "ui", icon: FileText, label: "Web verdict", sub: "Browser report", target: '[data-testid="pipeline-stage-08"]' },
    { key: "pdf", icon: HardDrive, label: "PDF + Trade Slip", sub: "Downloadable artifacts", target: '[data-testid="pipeline-stage-08"]' },
    { key: "alert", icon: Send, label: "Telegram alerts", sub: "Confidence ≥ 75 BUY/SELL", target: '[data-testid="pipeline-stage-08"]' },
];

// All node identities + their scroll target. The IntersectionObserver
// uses this list to map a visible section back to the matching node so
// we can render a "you are here" highlight as the user scrolls through
// the long technical page. Keep keys stable — they're used as
// observation-element identifiers, ARIA selectors, and CSS class
// suffixes everywhere downstream.
const ALL_NODES = [
    { key: "ingest", target: '[data-testid="pipeline-stage-01"]' },
    { key: "tech", target: '[data-testid="pipeline-stage-02"]' },
    { key: "candle", target: '[data-testid="pipeline-stage-03"]' },
    { key: "ctx", target: '[data-testid="pipeline-stage-04"]' },
    { key: "sent", target: "#bandarmology" },
    { key: "anchor", target: "#intrinsic-anchor" },
    { key: "llm", target: '[data-testid="pipeline-stage-07"]' },
    { key: "output", target: '[data-testid="pipeline-stage-08"]' },
];

// Resolve a `target` string (CSS selector OR `#id` fragment) to its DOM
// element and smooth-scroll. Headers offset via the existing scroll-mt-24
// utility on each anchor section, so a `block: "start"` scroll lands
// flush with the page sticky header — no manual offset math needed.
function scrollToTarget(selector) {
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Brief flash highlight so the user's eye lands on the right block.
    el.classList.add("flow-target-flash");
    setTimeout(() => el.classList.remove("flow-target-flash"), 900);
}

// Hook: returns the key of the currently-most-visible pipeline target
// section. Watches all target sections via a single IntersectionObserver
// (one observer is cheaper than one per target — same threshold semantics).
// The "most visible" pick = highest intersectionRatio at update time, which
// handles cases where multiple sections share viewport space (e.g. small
// stage rows next to a tall deep-dive section) correctly.
function useActiveStage() {
    const [active, setActive] = useState(null);
    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return undefined;
        // Resolve targets to DOM elements once on mount — `target` selectors
        // are static. We rebuild only if the React tree mounts/unmounts the
        // diagram, which is the one moment the targets could be missing.
        const entries = ALL_NODES
            .map((n) => ({ key: n.key, el: document.querySelector(n.target) }))
            .filter((e) => e.el);
        if (entries.length === 0) return undefined;
        // Map back from DOM → key so the observer callback can look up
        // each entry without scanning ALL_NODES on every fire.
        const elToKey = new Map(entries.map((e) => [e.el, e.key]));
        // Track the most-recent intersectionRatio per key so we can pick
        // the winner across observer batches.
        const ratios = new Map();
        const obs = new IntersectionObserver(
            (batch) => {
                batch.forEach((b) => {
                    const k = elToKey.get(b.target);
                    if (!k) return;
                    ratios.set(k, b.isIntersecting ? b.intersectionRatio : 0);
                });
                // Pick the key with the highest live ratio. Falls back to
                // null when nothing is intersecting (user scrolled above
                // the pipeline section entirely).
                let bestKey = null;
                let bestRatio = 0;
                ratios.forEach((r, k) => {
                    if (r > bestRatio) {
                        bestRatio = r;
                        bestKey = k;
                    }
                });
                setActive(bestKey);
            },
            {
                // Center 50% of the viewport — a section is "active" when
                // it occupies the middle band, not when it just touches
                // the top or bottom edge. This matches reading behavior.
                rootMargin: "-25% 0px -25% 0px",
                threshold: [0, 0.25, 0.5, 0.75, 1],
            },
        );
        entries.forEach((e) => obs.observe(e.el));
        return () => obs.disconnect();
    }, []);
    return active;
}

export default function PipelineFlowDiagram() {
    const activeStage = useActiveStage();
    return (
        <div className="mt-10" data-testid="pipeline-flow-diagram">
            <p
                className="font-mono mb-3 text-center"
                style={{ fontSize: "10px", color: "hsl(var(--text-muted))", letterSpacing: "0.18em" }}
            >
                <span aria-hidden="true">▸</span>{" "}
                <span className="uppercase">Click any stage to jump to its details</span>
            </p>
            {/* Desktop / tablet ─ animated SVG flow */}
            <div className="hidden md:block">
                <FlowSVG activeStage={activeStage} />
                <FlowLegend />
            </div>
            {/* Mobile ─ stacked card flow */}
            <div className="md:hidden">
                <MobileFlow activeStage={activeStage} />
            </div>
        </div>
    );
}

/* ───────────────────────── desktop SVG flow ───────────────────────── */

function FlowSVG({ activeStage }) {
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
                    {/* Gradients use a higher start-opacity (0.55 vs the
                        old 0.3) so the dashed pattern stays clearly
                        animated in BOTH light and dark themes — the old
                        opacity made the leading edge of each connector
                        fade into the background, which masked the
                        flow-dash animation in dark mode.
                        Note: the ingest→compute leg uses CYAN (matching
                        the Data-ingest node outline) so the eye reads
                        the connector colour as a continuation of the
                        block it leaves. Compute→reason stays violet
                        (Claude Sonnet box), reason→outputs stays green
                        (output artifacts). */}
                    <linearGradient id="line-cyan" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="hsl(184, 75%, 60%)" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="hsl(184, 75%, 60%)" stopOpacity="0.95" />
                    </linearGradient>
                    <linearGradient id="line-gold" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0.95" />
                    </linearGradient>
                    <linearGradient id="line-violet" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.95" />
                    </linearGradient>
                    <linearGradient id="line-green" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="hsl(var(--buy))" stopOpacity="0.95" />
                    </linearGradient>

                    {/* Animated stroke-dash for "data flowing" effect on connectors. */}
                    <style>{`
                        @keyframes flow-dash {
                            from { stroke-dashoffset: 56; }
                            to { stroke-dashoffset: 0; }
                        }
                        @keyframes pulse-soft {
                            0%, 100% { opacity: 0.55; }
                            50% { opacity: 1; }
                        }
                        @keyframes target-flash {
                            0%   { box-shadow: 0 0 0 0 hsla(45, 92%, 65%, 0.55); }
                            100% { box-shadow: 0 0 0 14px hsla(45, 92%, 65%, 0);   }
                        }
                        @media (prefers-reduced-motion: reduce) {
                            .flow-anim { animation: none !important; }
                        }
                        .flow-conn {
                            /* Larger dash gap and slightly faster cycle
                               keeps the "data flowing" perception clear
                               even in dark mode where ambient contrast
                               muted the original 4 6 pattern. */
                            stroke-dasharray: 6 8;
                            animation: flow-dash 1.0s linear infinite;
                            fill: none;
                        }
                        .flow-conn-fast { animation-duration: 0.75s; }
                        .flow-pulse { animation: pulse-soft 2.4s ease-in-out infinite; }
                        .flow-node-bg { fill: hsl(var(--surface-elevated)); stroke-width: 1.25; }
                        .flow-node-clickable { cursor: pointer; transition: filter 200ms ease; }
                        .flow-node-clickable:hover .flow-node-bg { fill: hsl(var(--bg)); stroke-width: 2; }
                        .flow-node-clickable:hover { filter: drop-shadow(0 0 6px hsla(45, 92%, 65%, 0.35)); }
                        .flow-node-clickable:focus { outline: none; }
                        .flow-node-clickable:focus-visible .flow-node-bg { stroke-width: 2.25; }
                        .flow-target-flash { animation: target-flash 900ms ease-out; }
                        /* Active "you are here" state — driven by
                           IntersectionObserver on the target sections. */
                        @keyframes flow-active-ring {
                            0%, 100% { stroke-width: 2.4; }
                            50%      { stroke-width: 3.0; }
                        }
                        .flow-node-active .flow-node-bg {
                            stroke: hsl(var(--gold));
                            stroke-width: 2.6;
                            animation: flow-active-ring 1.6s ease-in-out infinite;
                            filter: drop-shadow(0 0 8px hsla(45, 92%, 65%, 0.55));
                        }
                        .flow-node-active { animation: none; opacity: 1 !important; }
                    `}</style>
                </defs>

                {/* ───── connector layer ─────────────────────────────────── */}
                {/* INGEST → 5 compute lanes (cyan — matches the ingest node outline) */}
                {COMPUTE_LANES.map((_, i) => {
                    const y2 = computeYStart + i * laneStep;
                    return (
                        <path
                            key={`in-${i}`}
                            className="flow-conn flow-anim"
                            d={`M ${ingestX + 70} ${reasonY} C ${ingestX + 200} ${reasonY}, ${computeX - 200} ${y2}, ${computeX - 70} ${y2}`}
                            stroke="url(#line-cyan)"
                            strokeWidth="2"
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
                            strokeWidth="2"
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
                            strokeWidth="2"
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
                    target='[data-testid="pipeline-stage-01"]'
                    active={activeStage === "ingest"}
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
                        target={lane.target}
                        active={activeStage === lane.key}
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
                    target='[data-testid="pipeline-stage-07"]'
                    active={activeStage === "llm"}
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
                        target={o.target}
                        active={activeStage === "output"}
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

function Node({ x, y, color, overline, label, sub, Icon, width, big = false, target, active = false }) {
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
    const interactive = !!target;
    const onActivate = (e) => {
        if (!target) return;
        // Stop the SVG-level click from firing twice when activated via keyboard.
        e?.preventDefault?.();
        scrollToTarget(target);
    };
    return (
        <g
            className={`flow-pulse ${interactive ? "flow-node-clickable" : ""} ${active ? "flow-node-active" : ""}`}
            onClick={interactive ? onActivate : undefined}
            onKeyDown={
                interactive
                    ? (e) => {
                          if (e.key === "Enter" || e.key === " ") onActivate(e);
                      }
                    : undefined
            }
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "link" : undefined}
            aria-label={interactive ? `Jump to ${label} details${active ? " (you are here)" : ""}` : undefined}
            aria-current={active ? "location" : undefined}
            data-testid={interactive ? `flow-node-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined}
        >
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
            {/* "You are here" indicator — small pulsing gold dot in the
                top-left corner, only when this node maps to the section
                currently under the user's reading viewport. The
                aria-current="location" attribute on the parent <g> makes
                this discoverable by screen readers; this dot is the
                visual equivalent for sighted users. */}
            {active && (
                <circle
                    cx={left + 7}
                    cy={top + 7}
                    r={3.5}
                    fill="hsl(var(--gold))"
                    data-testid="flow-node-here-dot"
                >
                    <animate
                        attributeName="opacity"
                        values="0.5;1;0.5"
                        dur="1.4s"
                        repeatCount="indefinite"
                    />
                </circle>
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
            <LegendDot color="hsl(184, 75%, 50%)" label="Data ingest" />
            {/* Use an explicit saturated gold (45° hue, 92% sat, 55%
                lightness) instead of `hsl(var(--gold))` — the gold CSS
                token in light mode resolves to a low-contrast goldenrod
                that disappeared against the page's cream background. */}
            <LegendDot color="hsl(45, 92%, 55%)" label="Deterministic compute" />
            <LegendDot color="hsl(256, 92%, 70%)" label="AI reasoning (stochastic)" />
            <LegendDot color="hsl(140, 50%, 45%)" label="Output artifact" />
            <span className="opacity-70">⏱ ≈ 12–18 s end-to-end</span>
        </div>
    );
}

function LegendDot({ color, label }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                aria-hidden="true"
                style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: color,
                    display: "inline-block",
                    // 1px outline so the dot stays visible in both light
                    // and dark modes — the gold dot used to vanish on the
                    // light theme's cream background where the gold token
                    // is a near-match, and pale dots could merge with
                    // dark surfaces too.
                    border: "1px solid hsl(var(--border-default))",
                    boxShadow: `0 0 0 1px ${color}33`,
                }}
            />
            <span className="uppercase tracking-wider">{label}</span>
        </span>
    );
}

/* ───────────────────────── mobile vertical flow ───────────────────── */

const ALL_STAGES_MOBILE = [
    { key: "ingest", color: "cyan", overline: "01", label: "Data ingest", sub: "yfinance · Finnhub · IDX provider", Icon: Database, target: '[data-testid="pipeline-stage-01"]' },
    ...COMPUTE_LANES.map((l, i) => ({
        key: l.key,
        color: "gold",
        overline: String(i + 2).padStart(2, "0"),
        label: l.label,
        sub: l.sub,
        Icon: l.icon,
        target: l.target,
    })),
    { key: "llm", color: "violet", overline: "07", label: "Claude Sonnet 4.5", sub: "LLM reasoning", Icon: Sparkles, target: '[data-testid="pipeline-stage-07"]' },
    { key: "output", color: "green", overline: "08", label: "Verdict + outputs", sub: "Web · PDF · Telegram", Icon: FileText, target: '[data-testid="pipeline-stage-08"]' },
];

function MobileFlow({ activeStage }) {
    return (
        <ol className="space-y-2" data-testid="pipeline-flow-mobile">
            {ALL_STAGES_MOBILE.map((s, i) => (
                <li key={s.overline} className="relative">
                    <MobileFlowCard {...s} active={activeStage === s.key} />
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

function MobileFlowCard({ color, overline, label, sub, Icon, target, active = false }) {
    const c = `hsl(${COLOR_VAR[color]})`;
    const onClick = target
        ? (e) => {
              e.preventDefault();
              scrollToTarget(target);
          }
        : undefined;
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 p-3 rounded-sm w-full text-left transition-colors"
            style={{
                border: active ? "1px solid hsl(var(--gold))" : "1px solid hsl(var(--border-divider))",
                borderLeft: `3px solid ${c}`,
                background: active ? "hsl(45, 92%, 65%, 0.08)" : "hsl(var(--surface-elevated))",
                minHeight: 56,
                cursor: target ? "pointer" : "default",
                boxShadow: active ? "0 0 0 1px hsl(45, 92%, 65%, 0.4)" : undefined,
            }}
            aria-current={active ? "location" : undefined}
            data-testid={`flow-mobile-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
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
            {target && (
                <span
                    aria-hidden="true"
                    style={{ color: "hsl(var(--text-muted))", flexShrink: 0, fontSize: "14px" }}
                >
                    →
                </span>
            )}
        </button>
    );
}
