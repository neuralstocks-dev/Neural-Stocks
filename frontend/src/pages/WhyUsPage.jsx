import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
    Activity,
    Binary,
    Layers,
    MessageSquareText,
    BellRing,
    Crown,
    Check,
    X,
    ArrowRight,
    Sparkles,
    ChevronRight,
    Info,
    Zap,
    Telescope,
    Bot,
    Smartphone,
    CalendarRange,
    Award,
    History,
    GraduationCap,
    Heart,
} from "lucide-react";
import SocialLinks from "@/components/SocialLinks";

// ---------- Product modules ----------
const MODULES = [
    {
        icon: Activity,
        title: "Signal Engine",
        status: "available",
        body: "Core AI system that generates and ranks BUY / SELL / HOLD signals from multi-factor data — technicals, fundamentals, and price action — with confidence-weighted context.",
    },
    {
        icon: Binary,
        title: "Score Card",
        status: "available",
        link: "/scorecard",
        body: "Composite confidence score showing relative opportunity strength with transparent factor breakdowns across technicals and fundamentals.",
    },
    {
        icon: Layers,
        title: "Candlestick Strategy",
        status: "available",
        body: "Three analyzer modes on every tier — Standard AI (fundamentals + technicals), Candlestick (15 pattern detectors on daily + weekly timeframes), and Hybrid (AI + Candlestick). AI weighs patterns as primary, confirmation, or rejection signals and explains every verdict. Even the free tier gets all three modes.",
    },
    {
        icon: MessageSquareText,
        title: "AI Explain Panels",
        status: "available",
        body: "AI recommendation and verdict with confidence % level on the stock and also if the stock is suitable for short, medium or long term performance.",
    },
    {
        icon: Award,
        title: "Calibrated Confidence",
        status: "available",
        body: "Every verdict's confidence score is post-processed by a disciplined rule: the Earnings-Proximity Gate caps confidence at 55 when an earnings release is within 5 calendar days — pre-earnings outcomes are largely event-driven and the model can't price the surprise. This adjustment leaves a transparent breadcrumb under the ring — we don't quietly hand-tune scores, every change is shown and explained.",
    {
        title: "Macro regime context, not just price action",
        status: "available",
        body: "Every verdict receives live macroeconomic data at analysis time — Fed Funds Rate, CPI trajectory, and 10Y yield (or Bank Indonesia rate for IDX tickers), sourced from London Strategic Edge. The AI is explicitly told the current rate cycle (hiking/cutting/holding) and its implications for rate-sensitive sectors before forming its verdict. Most AI stock tools reason about a stock in an economic vacuum. We don't.",
    },
    },
    {
        icon: BellRing,
        title: "Watchlists & Alerts",
        status: "available",
        body: "Track up to 25 tickers (5 on Free, 25 on Pro, unlimited on Elite), run one-click Analyze or full Pattern Scan across the list, and get push notifications the moment a high-conviction BUY/SELL verdict or candlestick reversal triggers — delivered straight to our Telegram bot (@neulab_bot). No phone number, no SMS fees.",
    },
    {
        icon: History,
        title: "Backtesting Lab",
        status: "available",
        link: "/backtest",
        body: "Replay any verdict against the last 12 months of price action — cumulative P&L, hit-rate, average hold-time, drawdown, and an IDX-only \"signal-quality\" panel that scores how often our bandarmology persistence + verdict alignment actually outperforms the baseline. Compare RF-Top-N vs. naive buy-and-hold side-by-side, on real fills with realistic slippage assumptions.",
    },
    {
        icon: Bot,
        title: "Autonomous AI Trading",
        status: "coming",
        body: "Let the Signal Engine execute for you. Rule-based autopilot that turns your watchlist verdicts into live orders through your connected broker — with hard risk caps, position sizing, and human-in-the-loop override on every trade.",
    },
    {
        icon: Smartphone,
        title: "Native Mobile Apps",
        status: "coming",
        body: "Neural Stock Intelligence™ on iOS and Android — full dashboard, one-tap Analyze, Touch ID / Face ID login, and native push alerts. Background refresh keeps your watchlist scoring even when the app is closed.",
    },
    {
        icon: CalendarRange,
        title: "SMS alerts · Watchlist CSV",
        status: "coming",
        body: "Two power-user workflows queued for the next drop — SMS alerts for regions where Telegram isn't practical, and CSV import/export so you can move your entire watchlist in a single click.",
    },
];

// ---------- Competitive matrix ----------
const COMPETITORS = [
    { key: "nsi", name: "Neural Stock Intelligence", tag: "By NeuLab Inc." },
    { key: "moomoo", name: "moomoo", tag: "Retail-heavy broker" },
    { key: "tiger", name: "Tiger Brokers", tag: "Execution-first" },
    { key: "tradingview", name: "TradingView · Finviz", tag: "Technical screeners" },
    { key: "stashaway", name: "StashAway · Syfe", tag: "Robo-advisors" },
    { key: "tradeideas", name: "Trade Ideas · Kavout", tag: "Pro AI ($50–200/mo)" },
    { key: "dbsvickers", name: "DBS Vickers · OCBC Sec.", tag: "Traditional broker" },
];

const FEATURES = [
    // IDX-exclusive differentiators (Apr 2026 — keep these at the top)
    {
        label: "Live director-level accumulation signals (Bandarmology) — IDX",
        info: "bandarmology",
        values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "none", stashaway: "none", tradeideas: "none", dbsvickers: "none" },
    },
    {
        label: "Candlestick × smart-money confluence chip — IDX",
        info: "confluence",
        values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "none", stashaway: "none", tradeideas: "none", dbsvickers: "none" },
    },
    {
        label: "Top IDX picks ranked by multi-factor score — refreshed every 30 min",
        info: "toppicks",
        values: { nsi: "full", moomoo: "partial", tiger: "partial", tradingview: "none", stashaway: "none", tradeideas: "none", dbsvickers: "none" },
    },
    {
        label: "Sector-aware intrinsic-value anchor (Graham Number + Residual Income Model)",
        info: "intrinsic",
        values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "none", stashaway: "none", tradeideas: "partial", dbsvickers: "none" },
    },
    { label: "Explainable AI reasoning (not just signals)", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "none", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Three analyzer modes — Standard AI · Candlestick · Hybrid", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "15 candlestick patterns with plain-English explanations", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "none", dbsvickers: "none" } },
    { label: "Daily + weekly pattern scan on your entire watchlist", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Short / Medium / Long-term horizon fit", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "none", stashaway: "partial", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Portfolio P&L with live pricing", values: { nsi: "full", moomoo: "full", tiger: "full", tradingview: "partial", stashaway: "full", tradeideas: "none", dbsvickers: "full" } },
    { label: "Top / Bottom batch sweep across watchlist", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Export verdict as branded PDF", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "none", dbsvickers: "partial" } },
    { label: "Broker-agnostic (no lock-in)", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "full", stashaway: "none", tradeideas: "full", dbsvickers: "none" } },
    { label: "Beginner-friendly narrative insight", values: { nsi: "full", moomoo: "partial", tiger: "none", tradingview: "none", stashaway: "full", tradeideas: "none", dbsvickers: "none" } },
    { label: "Public AI Accuracy Scorecard", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "none", stashaway: "none", tradeideas: "none", dbsvickers: "none" } },
    { label: "Shareable verdict links", values: { nsi: "full", moomoo: "partial", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "none", dbsvickers: "none" } },
    { label: "Telegram push alerts (no phone number required)", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Signal-grade alerts, no promotions", values: { nsi: "full", moomoo: "partial", tiger: "partial", tradingview: "full", stashaway: "none", tradeideas: "full", dbsvickers: "none" } },
    { label: "Web-first · runs anywhere · no install", values: { nsi: "full", moomoo: "partial", tiger: "partial", tradingview: "full", stashaway: "full", tradeideas: "partial", dbsvickers: "partial" } },
    { label: "Candlestick & Hybrid analysis on the free tier", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "none", dbsvickers: "none" } },
    { label: "Sector-relative EV/EBITDA + EV/FCF multiples", values: { nsi: "full", moomoo: "partial", tiger: "partial", tradingview: "partial", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Live macro regime context (Fed rate, CPI, yields) in every verdict", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "partial", dbsvickers: "none" } },
    { label: "Starts at $0 · Pro $9/mo", values: { nsi: "full", moomoo: "none", tiger: "none", tradingview: "partial", stashaway: "none", tradeideas: "none", dbsvickers: "partial" } },
];

// Deep explainer content for the info-button popovers on comparison rows.
// Keyed by feature.info string.
const INFO_CONTENT = {
    bandarmology: {
        title: "Bandarmology — what it actually is",
        body: (
            <>
                <p className="mb-3">
                    <strong>Bandarmology</strong> is Indonesian market slang for "tracking what
                    the market-makers (bandars) are doing". We surface it for every{" "}
                    <code>.JK</code> ticker by parsing the{" "}
                    <strong>official IDX &amp; KSEI insider-filing feed</strong> — every disclosed
                    movement of shares by directors, commissioners, and major shareholders.
                </p>
                <p className="mb-3">
                    On the verdict page you see:
                </p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                    <li>
                        <strong>Accumulation ratio</strong> — of all insider-moved shares, what % were buys
                    </li>
                    <li>
                        <strong>Smart-money %</strong> — same ratio, filtered to directors / commissioners / president directors / major shareholders only (people with material non-public context by law)
                    </li>
                    <li>
                        <strong>Foreign net flow</strong> — how many shares changed hands between domestic and foreign holders
                    </li>
                    <li>
                        <strong>Recent filings list</strong> — the 5 most recent disclosures with names, share counts, prices, and "SMART MONEY" / "FOREIGN" badges
                    </li>
                </ul>
                <p className="mb-3 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                    Honest caveats: insiders can be wrong, filings lag 3–10 business days, and sub-threshold
                    holders never appear. It's <em>evidence</em>, not a forecast — but it's evidence no
                    other retail IDX platform exposes right now.
                </p>
                <p>
                    <Link to="/technical#bandarmology" className="underline decoration-dotted underline-offset-4">
                        See the full methodology + formulas →
                    </Link>
                </p>
            </>
        ),
    },
    confluence: {
        title: "Candlestick × Bandarmology confluence",
        body: (
            <>
                <p className="mb-3">
                    When two completely independent signals point the same direction, that's more
                    meaningful than either alone. On every IDX verdict page we cross-reference:
                </p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                    <li>What our <strong>candlestick pattern scanner</strong> detected (Hammer, Engulfing, Harami, 12 more)</li>
                    <li>What the <strong>Bandarmology regime</strong> reports (accumulation, distribution, balanced)</li>
                </ul>
                <p className="mb-3">
                    If we see a <strong>bullish reversal pattern AND smart-money accumulation</strong>,
                    a green "BULLISH CONFLUENCE" banner appears above the verdict. If they
                    pull opposite directions, you get a yellow "SIGNAL DIVERGENCE" chip instead —
                    a signal to wait for one to resolve before sizing up.
                </p>
                <p className="text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                    It's still not a guarantee, but it's a higher-conviction setup. You can see
                    this fire on <code>BBCA.JK</code> right now if you run a Hybrid analysis.
                </p>
            </>
        ),
    },
    toppicks: {
        title: "Top IDX Picks — how the ranking works",
        body: (
            <>
                <p className="mb-3">
                    Open the <strong>IDX Top Picks</strong> quick action on your Dashboard to see the
                    top 10 trending Indonesian equities, refreshed every 30 minutes.
                </p>
                <p className="mb-3">
                    Score formula (transparent, no black box):
                </p>
                <div
                    className="p-3 font-mono text-[11.5px] mb-3"
                    style={{
                        background: "hsl(var(--bg))",
                        border: "1px solid hsl(var(--border-divider))",
                    }}
                >
                    score = 0.6 × capped_daily_pct_change + 0.4 × price_quality
                </div>
                <p className="mb-3">
                    Daily-% contribution is capped at ±10% so a single-day spike can't dominate the
                    ranking. <code>price_quality</code> penalises sub-Rp 100 penny stocks (they're
                    illiquid and prone to manipulation). Rupiah prices ≥ Rp 1,000 get full marks.
                </p>
                <p className="text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                    Tap any pick and the full AI verdict runs automatically — no extra clicks.
                </p>
            </>
        ),
    },
    intrinsic: {
        title: "Intrinsic-value anchor — Graham + RIM",
        body: (
            <>
                <p className="mb-3">
                    Most retail platforms surface raw P/E and P/B but never put the actual{" "}
                    <strong>fair-value calculation</strong> in front of you. Neural Stock Intelligence™ does — and
                    the LLM uses it as one more input when reasoning about the verdict.
                </p>
                <p className="mb-3">
                    Two formulas run in parallel on every analysis:
                </p>
                <ul className="list-disc list-inside space-y-1 mb-3">
                    <li>
                        <strong>Graham Number</strong> = √(22.5 × EPS × bookValue) — Benjamin
                        Graham's classic value formula. Best fit for asset-heavy sectors (banks,
                        utilities, industrials, REITs).
                    </li>
                    <li>
                        <strong>1-year Residual Income Model</strong> = bookValue × ROE /
                        cost-of-equity (CAPM with market-aware risk-free + equity-risk premium).
                        Best fit for profitable services / tech / healthcare where book value
                        undercounts intangibles.
                    </li>
                </ul>
                <p className="mb-3">
                    A sector-aware selector picks the better-fitting method, the chip on the
                    verdict page exposes both numbers side-by-side, and an applicability flag
                    (<code>high_fit</code> / <code>low_fit_intangible_heavy</code> /{" "}
                    <code>low_fit_unrepresentative_roe</code>) tells you when to caveat the read.
                </p>
                <p className="mb-3 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                    Honest caveats: anchors are <em>reference</em> numbers, not price targets —
                    a stock can sit at a deep premium for years and never revert. We deliberately
                    avoid DCF (multi-year FCF projections aren't free-tier yfinance data and the
                    5–10y horizon is mismatched with this app's 4–12 week research window).
                </p>
                <p>
                    <Link to="/technical#intrinsic-anchor" className="underline decoration-dotted underline-offset-4">
                        See the full methodology + formulas →
                    </Link>
                </p>
            </>
        ),
    },
};

function Cell({ v }) {
    if (v === "full") {
        return <div className="flex justify-center"><Check size={16} strokeWidth={1.8} style={{ color: "hsl(var(--buy))" }} /></div>;
    }
    if (v === "partial") {
        return <div className="flex justify-center"><div style={{ width: 10, height: 2, background: "hsl(var(--hold))" }} /></div>;
    }
    return <div className="flex justify-center"><X size={14} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))", opacity: 0.45 }} /></div>;
}

// ---------- Module card ----------
function ModuleCard({ mod }) {
    const Icon = mod.icon;
    const isComing = mod.status === "coming";
    const isLinked = Boolean(mod.link);
    const testId = `module-${mod.title.toLowerCase().replace(/\s+/g, "-")}`;

    const inner = (
        <>
            <div className="flex items-start justify-between gap-3">
                <Icon size={20} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                <span
                    className="text-overline px-2 py-0.5"
                    style={{
                        fontSize: "0.5rem",
                        border: "1px solid " + (isComing ? "hsl(var(--border-default))" : "hsl(var(--buy))"),
                        color: isComing ? "hsl(var(--text-muted))" : "hsl(var(--buy))",
                        borderRadius: 2,
                        letterSpacing: "0.14em",
                    }}
                >
                    {isComing ? "Coming soon" : "Available"}
                </span>
            </div>
            <h3 className="font-serif mt-5 flex items-center gap-2" style={{ fontSize: "1.35rem", letterSpacing: "-0.005em" }}>
                {mod.title}
                {isLinked && (
                    <ArrowRight
                        size={14}
                        strokeWidth={1.8}
                        style={{ color: "hsl(var(--hold))", opacity: 0.7 }}
                    />
                )}
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                {mod.body}
            </p>
            {isLinked && (
                <p
                    className="mt-4 text-overline"
                    style={{ color: "hsl(var(--hold))", fontSize: "0.56rem" }}
                >
                    Open Score Card &rarr;
                </p>
            )}
        </>
    );

    const baseClass = "module p-6 md:p-7 flex flex-col h-full";
    const baseStyle = {
        background: "hsl(var(--surface))",
        opacity: isComing ? 0.92 : 1,
    };

    if (isLinked) {
        return (
            <Link
                to={mod.link}
                className={baseClass + " transition-colors hover:border-[hsl(var(--hold))]"}
                style={{ ...baseStyle, textDecoration: "none", cursor: "pointer" }}
                data-testid={testId}
            >
                {inner}
            </Link>
        );
    }

    return (
        <div className={baseClass} style={baseStyle} data-testid={testId}>
            {inner}
        </div>
    );
}

function KidsStat({ value, label }) {
    return (
        <div
            className="p-4"
            style={{
                background: "hsl(var(--background) / 0.5)",
                border: "1px solid hsl(var(--gold) / 0.30)",
                borderRadius: 4,
            }}
        >
            <div
                className="font-serif"
                style={{
                    fontSize: "clamp(1.5rem, 2.6vw, 2rem)",
                    fontWeight: 700,
                    color: "hsl(var(--gold))",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.1,
                }}
            >
                {value}
            </div>
            <p className="mt-2 text-xs" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.5 }}>
                {label}
            </p>
        </div>
    );
}

function KidsBullet({ text }) {
    return (
        <li className="flex gap-2.5 items-start text-sm md:text-base">
            <Check
                size={16}
                strokeWidth={2}
                style={{ color: "hsl(var(--gold))", marginTop: 4, flexShrink: 0 }}
            />
            <span>{text}</span>
        </li>
    );
}

function NeuToolCard({ icon, name, tag, body, badge }) {
    return (
        <div
            className="rounded-sm p-5"
            style={{
                background: "hsl(150 30% 8% / 0.5)",
                border: "1px solid hsl(150 70% 45% / 0.22)",
            }}
            data-testid={`neutools-section-card-${name.replace(/\W+/g, "-").toLowerCase()}`}
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <span style={{ fontSize: "1.5rem", color: "hsl(150 70% 70%)", lineHeight: 1 }}>{icon}</span>
                {badge && (
                    <span
                        style={{
                            fontSize: "0.55rem",
                            letterSpacing: "0.12em",
                            color: "hsl(150 70% 70%)",
                            border: "1px solid hsl(150 70% 70% / 0.55)",
                            padding: "2px 7px",
                            textTransform: "uppercase",
                        }}
                    >
                        {badge}
                    </span>
                )}
            </div>
            <div
                className="font-serif"
                style={{
                    fontSize: "1.05rem",
                    color: "hsl(var(--text-primary))",
                    lineHeight: 1.2,
                    marginBottom: 2,
                }}
            >
                {name}
            </div>
            <div
                style={{
                    fontSize: "0.68rem",
                    letterSpacing: "0.1em",
                    color: "hsl(150 70% 70%)",
                    textTransform: "uppercase",
                    marginBottom: 10,
                }}
            >
                {tag}
            </div>
            <p
                style={{
                    fontSize: "0.85rem",
                    color: "hsl(var(--text-secondary))",
                    lineHeight: 1.65,
                }}
            >
                {body}
            </p>
        </div>
    );
}


export default function WhyUsPage() {
    const [infoKey, setInfoKey] = useState(null);
    const info = infoKey ? INFO_CONTENT[infoKey] : null;
    return (
        <>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="why-us-page">
                {/* ------------------- Hero ------------------- */}
                <section>
                    <p className="text-overline" style={{ color: "hsl(var(--hold))", letterSpacing: "0.16em" }}>
                        <Sparkles size={11} className="inline mr-1" strokeWidth={1.5} /> NEULAB · stock.neulab.xyz
                    </p>
                    <h1
                        className="font-serif mt-4 hero-number"
                        style={{ fontSize: "clamp(2.6rem, 6vw, 5rem)", lineHeight: 1.02, letterSpacing: "-0.025em" }}
                    >
                        AI stock intelligence,<br />
                        <em style={{ color: "hsl(var(--hold))" }}>without the noise.</em>
                    </h1>
                    <p className="mt-6 max-w-2xl text-base md:text-lg" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}>
                        <strong style={{ color: "hsl(var(--text-primary))" }}>Neural Stock Intelligence&trade;</strong>{" "}
                        turns market data into clear, explainable signals — so you can identify opportunities,
                        understand risk, and act with confidence.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-4">
                        <Link
                            to="/dashboard"
                            className="btn-primary !px-8 !py-3"
                            data-testid="hero-cta-launch"
                        >
                            <Zap size={14} strokeWidth={1.8} /> Launch Neural Stock Intelligence
                            <ArrowRight size={14} strokeWidth={1.8} />
                        </Link>
                        <a href="#how-it-works" className="btn-ghost !px-6 !py-3" data-testid="hero-cta-how">
                            See how it works
                        </a>
                    </div>

                    <p
                        className="mt-6 text-overline"
                        style={{
                            color: "hsl(var(--text-muted))",
                            fontSize: "0.6rem",
                            letterSpacing: "0.12em",
                        }}
                    >
                        Explainable signals · Risk-aware analytics · Built for disciplined decision-making
                    </p>
                </section>

                {/* ------------------- Inside NSI (Modules) ------------------- */}
                <section className="mt-20 md:mt-28" data-testid="inside-nsi">
                    <p className="text-overline">The product</p>
                    <h2
                        className="font-serif mt-2"
                        style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                    >
                        Inside Neural Stock Intelligence<span className="text-overline align-super" style={{ fontSize: "0.35em" }}>&trade;</span>
                    </h2>
                    <p className="mt-4 max-w-3xl text-base" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}>
                        A modular AI system built around explainability and discipline.
                        Each module is scoped tightly, cites its reasoning, and can be used independently or composed.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-1 md:gap-4 mt-8">
                        {MODULES.map((m) => <ModuleCard key={m.title} mod={m} />)}
                    </div>
                </section>

                {/* ------------------- How it works ------------------- */}
                <section className="mt-20 md:mt-28" id="how-it-works" data-testid="how-it-works">
                    <p className="text-overline">How it works</p>
                    <h2
                        className="font-serif mt-2"
                        style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                    >
                        Three steps. No black box.
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-6 mt-8">
                        {[
                            { step: "01", title: "Ingest", body: "Price, volume, fundamentals, technical indicators, and sentiment — gathered across exchanges in real time." },
                            { step: "02", title: "Score & rank", body: "AI models weigh multi-factor data and produce BUY / SELL / HOLD signals with composite Score Card ratings." },
                            { step: "03", title: "Explain", body: "Every signal comes with cited reasoning, confidence context, strengths, and risks — so you understand the thesis before acting." },
                        ].map((s) => (
                            <div
                                key={s.step}
                                className="module p-6 md:p-8"
                                style={{ background: "hsl(var(--surface))" }}
                                data-testid={`step-${s.step}`}
                            >
                                <p
                                    className="font-mono"
                                    style={{ fontSize: "0.95rem", color: "hsl(var(--hold))", letterSpacing: "0.2em" }}
                                >
                                    {s.step}
                                </p>
                                <h3 className="font-serif mt-3" style={{ fontSize: "1.5rem", letterSpacing: "-0.01em" }}>
                                    {s.title}
                                </h3>
                                <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {s.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ------------------- Competitive matrix ------------------- */}
                <section className="mt-20 md:mt-28" data-testid="competitive-matrix">
                    <p className="text-overline">How it compares</p>
                    <h2
                        className="font-serif mt-2"
                        style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
                    >
                        Most platforms execute.<br />
                        <span style={{ color: "hsl(var(--hold))" }}>Neural Stock Intelligence™ explains.</span>
                    </h2>
                    <p className="mt-4 max-w-3xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                        Brokers execute trades. Screeners filter lists. Robo-advisors rebalance indices.
                        None of them reason with you. Compare row by row.
                    </p>

                    <div className="module mt-8 overflow-x-auto" data-testid="competitive-table">
                        <table className="w-full text-sm" style={{ borderCollapse: "collapse", minWidth: 960 }}>
                            <thead>
                                <tr>
                                    <th
                                        className="text-left py-4 px-5 text-overline sticky left-0 z-10"
                                        style={{
                                            background: "hsl(var(--surface))",
                                            minWidth: 280,
                                            borderBottom: "1px solid hsl(var(--border-default))",
                                            fontSize: "0.58rem",
                                        }}
                                    >
                                        Feature
                                    </th>
                                    {COMPETITORS.map((c) => {
                                        const isUs = c.key === "nsi";
                                        return (
                                            <th
                                                key={c.key}
                                                className="text-center py-4 px-3"
                                                style={{
                                                    background: isUs ? "hsla(38, 45%, 45%, 0.08)" : "hsl(var(--surface))",
                                                    borderBottom: "1px solid " + (isUs ? "hsl(var(--hold))" : "hsl(var(--border-default))"),
                                                    minWidth: 120,
                                                }}
                                            >
                                                <div className="flex flex-col items-center gap-1">
                                                    {isUs && <Crown size={12} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />}
                                                    <span
                                                        className="font-serif"
                                                        style={{
                                                            fontSize: isUs ? "0.9rem" : "0.78rem",
                                                            color: isUs ? "hsl(var(--hold))" : "hsl(var(--text-primary))",
                                                            letterSpacing: "-0.005em",
                                                            lineHeight: 1.15,
                                                            fontWeight: isUs ? 600 : 400,
                                                        }}
                                                    >
                                                        {c.name}
                                                    </span>
                                                    <span className="text-overline" style={{ fontSize: "0.5rem", color: "hsl(var(--text-muted))" }}>
                                                        {c.tag}
                                                    </span>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {FEATURES.map((feat, idx) => (
                                    <tr
                                        key={feat.label}
                                        style={{
                                            borderBottom: "1px solid hsl(var(--border-divider))",
                                            background: idx % 2 === 0 ? "transparent" : "hsla(0, 0%, 0%, 0.02)",
                                        }}
                                    >
                                        <td
                                            className="py-3 px-5 sticky left-0"
                                            style={{
                                                background: "hsl(var(--surface))",
                                                color: "hsl(var(--text-primary))",
                                                fontSize: "0.85rem",
                                                lineHeight: 1.5,
                                                zIndex: 5,
                                            }}
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                {feat.label}
                                                {feat.info ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setInfoKey(feat.info)}
                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono hover:opacity-75"
                                                        style={{
                                                            fontSize: "0.58rem",
                                                            border: "1px solid hsl(var(--hold))",
                                                            color: "hsl(var(--hold))",
                                                            borderRadius: 2,
                                                            letterSpacing: "0.08em",
                                                        }}
                                                        title="What's this?"
                                                        data-testid={`whyus-info-${feat.info}`}
                                                    >
                                                        <Info size={9} strokeWidth={2} />
                                                        EXPLAIN
                                                    </button>
                                                ) : null}
                                            </span>
                                        </td>
                                        {COMPETITORS.map((c) => (
                                            <td
                                                key={c.key}
                                                className="py-3 px-3"
                                                style={{
                                                    background: c.key === "nsi" ? "hsla(38, 45%, 45%, 0.04)" : "transparent",
                                                }}
                                            >
                                                <Cell v={feat.values[c.key]} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div
                            className="py-4 px-5 flex items-center gap-6 flex-wrap font-mono"
                            style={{
                                borderTop: "1px solid hsl(var(--border-divider))",
                                color: "hsl(var(--text-muted))",
                                fontSize: "0.7rem",
                            }}
                        >
                            <span className="flex items-center gap-2">
                                <Check size={12} strokeWidth={1.8} style={{ color: "hsl(var(--buy))" }} /> Fully supported
                            </span>
                            <span className="flex items-center gap-2">
                                <div style={{ width: 10, height: 2, background: "hsl(var(--hold))" }} /> Partial / indirect
                            </span>
                            <span className="flex items-center gap-2">
                                <X size={12} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} /> Not supported
                            </span>
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                        Data reflects publicly documented features as of Feb 2026. Competitor products evolve — please verify current capabilities directly.
                    </p>
                </section>

                {/* ------------------- About Neulab ------------------- */}
                <section className="mt-20 md:mt-28" data-testid="about-neulab">
                    <div
                        className="module p-8 md:p-12"
                        style={{
                            background: "hsla(38, 45%, 45%, 0.04)",
                            border: "1px solid hsl(var(--hold))",
                        }}
                    >
                        <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>About</p>
                        <h2
                            className="font-serif mt-2"
                            style={{ fontSize: "clamp(2rem, 3.6vw, 2.8rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                        >
                            NeuLab Inc. is an AI research-driven fintech lab.
                        </h2>
                        <p
                            className="mt-5 text-base md:text-lg leading-relaxed max-w-3xl"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            NeuLab Inc. builds AI systems that transform complex market data into structured,
                            explainable intelligence — so disciplined investors can move beyond guessing
                            and into reasoned decisions.
                        </p>
                        <p
                            className="mt-4 text-sm leading-relaxed max-w-3xl"
                            style={{ color: "hsl(var(--text-secondary))" }}
                        >
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Neural Stock Intelligence&trade;</strong> is
                            our flagship product, available at <span className="font-mono">stock.neulab.xyz</span>.
                        </p>
                    </div>
                </section>

                {/* ------------------- StockDNA — Why personality matters ------------------- */}
                <section className="mt-20 md:mt-28" data-testid="stockdna-section">
                    <div
                        className="module p-8 md:p-12 relative overflow-hidden"
                        style={{
                            background: "linear-gradient(135deg, hsl(259 78% 60% / 0.10) 0%, hsl(259 78% 60% / 0.02) 100%)",
                            border: "1px solid hsl(259 78% 60% / 0.45)",
                        }}
                    >
                        <p className="text-overline" style={{ color: "hsl(259 80% 70%)" }}>
                            🧬 The fourth pillar
                        </p>
                        <h2
                            className="font-serif mt-2"
                            style={{ fontSize: "clamp(2rem, 3.6vw, 2.8rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                        >
                            Even the best AI is useless if it<br />
                            <em style={{ color: "hsl(259 80% 70%)" }}>doesn't fit how you think.</em>
                        </h2>

                        <p className="mt-6 text-base md:text-lg leading-relaxed max-w-3xl" style={{ color: "hsl(var(--text-primary))" }}>
                            Most investors lose money not because the analysis was wrong, but because the strategy didn't match their psychology.
                            A fundamental investor sells too early. A momentum trader holds too long. A value hunter chases growth.{" "}
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Personality, not intelligence, is the silent variable.</strong>
                        </p>

                        <p className="mt-4 text-base md:text-lg leading-relaxed max-w-3xl" style={{ color: "hsl(var(--text-primary))" }}>
                            That's why we built{" "}
                            <strong style={{ color: "hsl(259 80% 70%)" }}>StockDNA™</strong> — a 5-minute psychometric quiz
                            grounded in Nobel Prize–winning behavioural finance research. It maps you to one of 8 investor archetypes,
                            then matches you to stocks that fit how you actually reason about money.
                        </p>

                        <ul className="mt-6 space-y-2 max-w-3xl" style={{ color: "hsl(var(--text-secondary))" }}>
                            <KidsBullet text="10 questions. Built on Kahneman & Tversky, Markowitz, Fama & French, Klontz, and Mayfield et al." />
                            <KidsBullet text="8 archetypes — Visionary, Analyst, Maverick, Steady Hand, Explorer, Guardian, Strategist, Time Lord" />
                            <KidsBullet text="Matched stocks for IDX, US/Global, or both — based on your DNA, not generic advice" />
                            <KidsBullet text="Free, public, no signup needed. Available in English & Bahasa Indonesia" />
                        </ul>

                        <p className="mt-8 text-sm md:text-base italic max-w-3xl" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.7, borderLeft: "2px solid hsl(259 80% 70%)", paddingLeft: 16 }}>
                            Ray Dalio rebuilt Bridgewater around personality fit. Charlie Munger called it the most under-discussed
                            edge in markets.{" "}
                            <span style={{ color: "hsl(var(--text-primary))", fontStyle: "normal", fontWeight: 600 }}>
                                Five minutes from now you'll know which archetype you are — and which stocks were built for the way your brain works.
                            </span>
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                to="/stockdna"
                                className="inline-flex items-center gap-2"
                                style={{
                                    background: "hsl(259 78% 60%)",
                                    color: "#fff",
                                    padding: "12px 24px",
                                    borderRadius: 2,
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                }}
                                data-testid="stockdna-section-cta-take"
                            >
                                <span style={{ fontSize: "1.05rem" }}>🧬</span>
                                Take the StockDNA quiz
                                <ArrowRight size={14} strokeWidth={1.8} />
                            </Link>
                        </div>

                        <p className="mt-4 text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                            Free · 5 minutes · Export your result as PDF · Not financial advice.
                        </p>
                    </div>
                </section>

                {/* ------------------- NeuTools — The Investor Toolkit ------------------- */}
                <section className="mt-20 md:mt-28" data-testid="neutools-section">
                    <div
                        className="module p-8 md:p-12 relative overflow-hidden"
                        style={{
                            background: "linear-gradient(135deg, hsl(150 70% 45% / 0.10) 0%, hsl(150 70% 45% / 0.02) 100%)",
                            border: "1px solid hsl(150 70% 45% / 0.45)",
                        }}
                    >
                        <p className="text-overline" style={{ color: "hsl(150 70% 70%)" }}>
                            🛠 The investor toolkit
                        </p>
                        <h2
                            className="font-serif mt-2"
                            style={{ fontSize: "clamp(2rem, 3.6vw, 2.8rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                        >
                            Six free tools to{" "}
                            <em style={{ color: "hsl(150 70% 70%)" }}>calculate, test, learn, and grow.</em>
                        </h2>

                        <p className="mt-6 text-base md:text-lg leading-relaxed max-w-3xl" style={{ color: "hsl(var(--text-primary))" }}>
                            Not every moment calls for a full institutional verdict. Sometimes you just want to ask{" "}
                            <em>"what if I'd invested instead of spent?"</em> or{" "}
                            <em>"could I have survived 2008?"</em> or{" "}
                            <em>"what does this jargon actually mean?"</em>{" "}
                            <strong style={{ color: "hsl(var(--text-primary))" }}>
                                NeuTools™ is the toolkit for those questions
                            </strong>{" "}
                            — six bite-sized, free-forever, sign-up–free utilities that turn 30 seconds of curiosity into
                            a sharper investor.
                        </p>

                        <div className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="neutools-grid">
                            <NeuToolCard
                                icon="✦"
                                name="StockHoroscope™"
                                tag="Daily Market Reading"
                                body="A daily personalised market read in horoscope language — VIX, S&P 5D, IHSG 5D — matched to your investor archetype. A 30-second ritual that turns macro noise into one specific action for today."
                            />
                            <NeuToolCard
                                icon="≣"
                                name="StockCalc™"
                                tag="Compound Calculator"
                                body="Translate Rp 500K/month into a house, a car, retirement — at IDX or global return assumptions. We show life milestones, not abstract numbers, because that's what makes saving stick."
                            />
                            <NeuToolCard
                                icon="▼"
                                name="Bear Survival Quiz™"
                                tag="5 Historical Crashes"
                                body="2008 GFC. March 2020 COVID. 1997 Asian Crisis. Dot-com bust. 2022 rate shock. We put you at the worst moment of each and grade your decision A–F. The biggest wealth destroyer is panic selling — measure your edge before you need it."
                            />
                            <NeuToolCard
                                icon="◐"
                                name="Latte Factor™"
                                tag="Habit Cost Calculator"
                                body="Your daily kopi susu costs Rp 2.3 Billion over 30 years if invested in BBCA instead. We compound every habit so you can see the real opportunity cost — and decide which ones are still worth it."
                            />
                            <NeuToolCard
                                icon="§"
                                name="StockSlang™"
                                tag="Financial Jargon Translator"
                                badge="EN-only"
                                body="P/E, VIX, moat, EBITDA, free cash flow — 12 essential terms explained in plain English with a one-line street translation that makes them stick. Jargon is the #1 barrier OJK cites for low financial literacy in Indonesia. We're removing it."
                            />
                            <NeuToolCard
                                icon="⌛"
                                name="StockTimeMachine™"
                                tag="Financial Regret Calculator"
                                body="Pick a past date, an amount, a stock you wish you'd bought. See the missed gain in Rupiah and your Regret Score out of 100 — then a Recovery Plan showing what starting today still gets you. Regret, properly channelled, becomes action."
                            />
                        </div>

                        <p className="mt-8 text-sm md:text-base italic max-w-3xl" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.7, borderLeft: "2px solid hsl(150 70% 70%)", paddingLeft: 16 }}>
                            Five of the six tools are bilingual (EN + Bahasa Indonesia). StockSlang stays English because
                            its punchline is the wordplay.{" "}
                            <span style={{ color: "hsl(var(--text-primary))", fontStyle: "normal", fontWeight: 600 }}>
                                Zero API calls. Zero sign-up. Zero cost. The same engineering rigour we put into
                                institutional analysis, applied to the small, sharp decisions you make every week.
                            </span>
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link
                                to="/neutools"
                                className="inline-flex items-center gap-2"
                                style={{
                                    background: "hsl(150 70% 45%)",
                                    color: "#fff",
                                    padding: "12px 24px",
                                    borderRadius: 2,
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                }}
                                data-testid="neutools-section-cta-open"
                            >
                                <span style={{ fontSize: "1.05rem" }}>🛠</span>
                                Open the toolkit
                                <ArrowRight size={14} strokeWidth={1.8} />
                            </Link>
                        </div>

                        <p className="mt-4 text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                            Free · No sign-up · Works offline · Not financial advice · Educational use only.
                        </p>
                    </div>
                </section>

                {/* ------------------- Mission: KidStocks ------------------- */}
                <section className="mt-20 md:mt-28" data-testid="kids-mission">
                    <div
                        className="module p-8 md:p-12 relative overflow-hidden"
                        style={{
                            background: "linear-gradient(135deg, hsl(var(--gold) / 0.08) 0%, hsl(var(--gold) / 0.02) 100%)",
                            border: "1px solid hsl(var(--gold) / 0.45)",
                        }}
                    >
                        <p className="text-overline" style={{ color: "hsl(var(--gold))" }}>
                            <Heart size={11} className="inline mr-1" strokeWidth={1.5} />
                            Why we also build for kids
                        </p>
                        <h2
                            className="font-serif mt-2"
                            style={{ fontSize: "clamp(2rem, 3.6vw, 2.8rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                        >
                            We didn't stop at adults.<br />
                            <em style={{ color: "hsl(var(--gold))" }}>The damage is already done by then.</em>
                        </h2>

                        {/* Loss-aversion / urgency hook */}
                        <p
                            className="mt-6 text-base md:text-lg leading-relaxed max-w-3xl"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            By the time most adults get serious about their money, the costliest habits
                            are already locked in. <strong style={{ color: "hsl(var(--text-primary))" }}>Cambridge research found that
                            financial behaviours crystallise by age 7.</strong> By 18, the patterns are so
                            entrenched that even a great tool like NSI is fighting against a decade of
                            unconscious anchoring.
                        </p>

                        {/* Stat shock — social proof of the problem */}
                        <div className="mt-8 grid gap-4 sm:grid-cols-3" data-testid="kids-stats-grid">
                            <KidsStat
                                value="76%"
                                label="of US teens fail basic financial-literacy questions (FINRA 2024)"
                            />
                            <KidsStat
                                value="2 of 5"
                                label="OECD-PISA students worldwide can't read a payslip or budget (OECD 2023)"
                            />
                            <KidsStat
                                value="$1,819"
                                label="annual cost to the average American of being financially illiterate (NFEC 2024)"
                            />
                        </div>

                        {/* Identity / mission framing — psychological commitment */}
                        <p
                            className="mt-8 text-base md:text-lg leading-relaxed max-w-3xl"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            We didn't build NSI just to help adults trade smarter.{" "}
                            <strong style={{ color: "hsl(var(--gold))" }}>
                                We built it to break the cycle.
                            </strong>{" "}
                            Every parent reading this knows the feeling of wanting to teach their kid
                            something about money — and not knowing where to start, or worse, handing
                            them a fake-trading game that rewards gambling instincts.
                        </p>

                        <p
                            className="mt-4 text-base md:text-lg leading-relaxed max-w-3xl"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            That's why we built{" "}
                            <strong style={{ color: "hsl(var(--gold))" }}>KidStocks</strong> — the
                            kid-safe layer over the same Neural Stock Intelligence engine you trust
                            for yourself. Same AI reasoning. Same real-market data.{" "}
                            <em style={{ color: "hsl(var(--text-primary))" }}>Translated</em> into
                            language an 8-year-old can actually understand.
                        </p>

                        {/* Concrete proof points */}
                        <ul className="mt-6 space-y-2 max-w-3xl" style={{ color: "hsl(var(--text-secondary))" }}>
                            <KidsBullet text="Three age bands — 8-10 / 11-13 / 14-18 — each with its own vocabulary, analogies, and reasoning depth" />
                            <KidsBullet text="10,000 virtual StockCoins. Zero real money. Zero gambling instincts." />
                            <KidsBullet text="Reflection journals after every trade — kids learn to reason, not react" />
                            <KidsBullet text="COPPA-compliant under-13 parental consent flow, built-in" />
                        </ul>

                        {/* Founder-conviction close — identity hook */}
                        <p
                            className="mt-8 text-sm md:text-base italic max-w-3xl"
                            style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.7, borderLeft: "2px solid hsl(var(--gold))", paddingLeft: 16 }}
                        >
                            Most of you reading this didn't have a parent who could explain a P/E
                            ratio at the dinner table. We can't change that for you.{" "}
                            <span style={{ color: "hsl(var(--text-primary))", fontStyle: "normal", fontWeight: 600 }}>
                                But if you have a kid, niece, or nephew between 8 and 18 — you can
                                change it for them. In the next ten minutes.
                            </span>
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3">
                            <a
                                href="https://kidstocks.net"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2"
                                style={{
                                    background: "hsl(var(--gold))",
                                    color: "#1a1a1a",
                                    padding: "12px 24px",
                                    borderRadius: 2,
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                }}
                                data-testid="kids-mission-cta-primary"
                            >
                                <GraduationCap size={14} strokeWidth={1.8} />
                                Show your kid how the AI thinks
                                <ArrowRight size={14} strokeWidth={1.8} />
                            </a>
                            <Link
                                to="/kids/preview/AAPL?age=11-13"
                                target="_blank"
                                className="inline-flex items-center gap-2"
                                style={{
                                    color: "hsl(var(--gold))",
                                    border: "1px solid hsl(var(--gold) / 0.6)",
                                    padding: "12px 20px",
                                    borderRadius: 2,
                                    fontSize: "0.78rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.14em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                }}
                                data-testid="kids-mission-cta-sample"
                            >
                                See a live sample
                            </Link>
                        </div>

                        <p className="mt-4 text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                            Free · No card · Educational only · No real-money trading inside KidStocks.
                        </p>
                    </div>
                </section>

                {/* ------------------- Final CTA ------------------- */}
                <section className="mt-20 md:mt-28 text-center" data-testid="final-cta">
                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                        <Telescope size={11} className="inline mr-1" strokeWidth={1.5} /> Start now
                    </p>
                    <h2
                        className="font-serif mt-3"
                        style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)", letterSpacing: "-0.025em", lineHeight: 1.02 }}
                    >
                        Clear signals. Explained reasoning.<br />
                        <em style={{ color: "hsl(var(--buy))" }}>Confident decisions.</em>
                    </h2>
                    <p className="mt-6 max-w-2xl mx-auto text-base md:text-lg" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}>
                        Free tier includes 5 watchlist tickers and 3 full AI analyses per day.
                        No credit card. Cancel anytime.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            to="/dashboard"
                            className="btn-primary !px-10 !py-4"
                            style={{ fontSize: "1rem" }}
                            data-testid="final-cta-launch"
                        >
                            Launch Neural Stock Intelligence
                            <ArrowRight size={16} strokeWidth={1.8} />
                        </Link>
                        <Link
                            to="/scorecard"
                            className="btn-ghost !px-6 !py-4"
                            style={{ fontSize: "0.9rem" }}
                            data-testid="final-cta-scorecard"
                        >
                            See our AI track record <ChevronRight size={14} strokeWidth={1.5} />
                        </Link>
                    </div>
                </section>

                {/* ------------------- Footer ------------------- */}
                <footer
                    className="mt-24 pt-10 pb-4"
                    style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                    data-testid="neulab-footer"
                >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                            <p
                                className="font-serif"
                                style={{ fontSize: "1.2rem", letterSpacing: "0.08em", fontWeight: 600 }}
                            >
                                NEULAB
                            </p>
                            <p className="mt-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                AI research-driven fintech lab — NeuLab Inc.
                            </p>
                            <p className="mt-1 font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                neulab.xyz
                            </p>
                        </div>
                        <div>
                            <p className="text-overline">Product</p>
                            <ul className="mt-3 space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                <li><Link to="/dashboard" className="link-underline">Dashboard</Link></li>
                                <li><Link to="/scorecard" className="link-underline">AI Scorecard</Link></li>
                                <li><Link to="/pricing" className="link-underline">Pricing</Link></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-overline">Legal</p>
                            <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                <strong style={{ color: "hsl(var(--text-primary))" }}>
                                    Neural Stock Intelligence&trade; — by NeuLab Inc.
                                </strong>
                            </p>
                            <p
                                className="mt-2 text-xs leading-relaxed"
                                style={{ color: "hsl(var(--text-muted))" }}
                            >
                                For research and informational purposes only. Not financial advice.
                                Markets are volatile; past performance does not guarantee future results.
                            </p>
                        </div>
                    </div>
                    <p
                        className="mt-8 text-overline"
                        style={{
                            color: "hsl(var(--text-muted))",
                            fontSize: "0.56rem",
                            letterSpacing: "0.16em",
                        }}
                    >
                        &copy; 2026 NeuLab Inc. · All rights reserved
                    </p>
                    <div
                        className="mt-4 pt-4"
                        style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                    >
                        <p
                            className="text-overline mb-3"
                            style={{
                                color: "hsl(var(--text-muted))",
                                fontSize: "0.56rem",
                                letterSpacing: "0.16em",
                            }}
                        >
                            Follow
                        </p>
                        <SocialLinks variant="default" size="sm" />
                    </div>
                </footer>
            </div>

            {/* Feature-explainer dialog triggered by the EXPLAIN buttons */}
            <Dialog open={!!info} onOpenChange={(o) => !o && setInfoKey(null)}>
                <DialogContent
                    className="max-w-lg max-h-[90vh] overflow-y-auto"
                    data-testid="whyus-info-dialog"
                >
                    {info ? (
                        <>
                            <DialogHeader>
                                <DialogTitle className="font-serif text-2xl">
                                    {info.title}
                                </DialogTitle>
                                <DialogDescription className="text-[11.5px]">
                                    Short explainer so you know what's under the hood.
                                </DialogDescription>
                            </DialogHeader>
                            <div
                                className="mt-2 text-sm leading-relaxed"
                                style={{ color: "hsl(var(--text-primary))" }}
                            >
                                {info.body}
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
