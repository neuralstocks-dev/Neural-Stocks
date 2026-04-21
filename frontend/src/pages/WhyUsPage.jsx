import React from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import {
    Brain,
    Eye,
    Compass,
    Telescope,
    Shield,
    Zap,
    Check,
    X,
    TrendingUp,
    AlertTriangle,
    Sparkles,
    ArrowRight,
    BookOpen,
    Crown,
} from "lucide-react";

// ---------- Competitive matrix data ----------
const COMPETITORS = [
    { key: "neural", name: "Neural Stock Intelligence", tag: "You deserve this" },
    { key: "moomoo", name: "moomoo", tag: "Retail-heavy broker" },
    { key: "tiger", name: "Tiger Brokers", tag: "Execution-first" },
    { key: "tradingview", name: "TradingView · Finviz", tag: "Technical screeners" },
    { key: "stashaway", name: "StashAway · Syfe", tag: "Robo-advisors" },
    { key: "tradeideas", name: "Trade Ideas · Kavout", tag: "Pro AI ($50–200/mo)" },
    { key: "dbsvickers", name: "DBS Vickers · OCBC Sec.", tag: "Traditional broker" },
];

const FEATURES = [
    {
        label: "Explainable AI reasoning (not just signals)",
        values: {
            neural: "full",
            moomoo: "none",
            tiger: "none",
            tradingview: "none",
            stashaway: "none",
            tradeideas: "partial",
            dbsvickers: "none",
        },
    },
    {
        label: "Short / Medium / Long-term horizon fit",
        values: {
            neural: "full",
            moomoo: "none",
            tiger: "none",
            tradingview: "none",
            stashaway: "partial",
            tradeideas: "partial",
            dbsvickers: "none",
        },
    },
    {
        label: "Top / Bottom batch sweep across watchlist",
        values: {
            neural: "full",
            moomoo: "none",
            tiger: "none",
            tradingview: "partial",
            stashaway: "none",
            tradeideas: "partial",
            dbsvickers: "none",
        },
    },
    {
        label: "Broker-agnostic (no lock-in)",
        values: {
            neural: "full",
            moomoo: "none",
            tiger: "none",
            tradingview: "full",
            stashaway: "none",
            tradeideas: "full",
            dbsvickers: "none",
        },
    },
    {
        label: "Beginner-friendly narrative insight",
        values: {
            neural: "full",
            moomoo: "partial",
            tiger: "none",
            tradingview: "none",
            stashaway: "full",
            tradeideas: "none",
            dbsvickers: "none",
        },
    },
    {
        label: "Public AI Accuracy Scorecard (transparent track record)",
        values: {
            neural: "full",
            moomoo: "none",
            tiger: "none",
            tradingview: "none",
            stashaway: "none",
            tradeideas: "none",
            dbsvickers: "none",
        },
    },
    {
        label: "Shareable verdict links (socially provable theses)",
        values: {
            neural: "full",
            moomoo: "partial",
            tiger: "none",
            tradingview: "partial",
            stashaway: "none",
            tradeideas: "none",
            dbsvickers: "none",
        },
    },
    {
        label: "Signal-grade alerts without spammy promotions",
        values: {
            neural: "full",
            moomoo: "partial",
            tiger: "partial",
            tradingview: "full",
            stashaway: "none",
            tradeideas: "full",
            dbsvickers: "none",
        },
    },
    {
        label: "Web-first · runs anywhere · no install",
        values: {
            neural: "full",
            moomoo: "partial",
            tiger: "partial",
            tradingview: "full",
            stashaway: "full",
            tradeideas: "partial",
            dbsvickers: "partial",
        },
    },
    {
        label: "Starts at $0 · Pro $9/mo",
        values: {
            neural: "full",
            moomoo: "none",
            tiger: "none",
            tradingview: "partial",
            stashaway: "none",
            tradeideas: "none",
            dbsvickers: "partial",
        },
    },
];

function Cell({ v }) {
    if (v === "full") {
        return (
            <div className="flex justify-center items-center">
                <Check size={16} strokeWidth={1.8} style={{ color: "hsl(var(--buy))" }} />
            </div>
        );
    }
    if (v === "partial") {
        return (
            <div className="flex justify-center items-center">
                <div
                    style={{
                        width: 10,
                        height: 2,
                        background: "hsl(var(--hold))",
                    }}
                />
            </div>
        );
    }
    return (
        <div className="flex justify-center items-center">
            <X size={14} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))", opacity: 0.45 }} />
        </div>
    );
}

export default function WhyUsPage() {
    return (
        <AppShell>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-20" data-testid="why-us-page">
                {/* Hero */}
                <section className="relative">
                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                        <Sparkles size={11} className="inline mr-1" strokeWidth={1.5} /> Neural Stock Intelligence&trade;
                    </p>
                    <h1
                        className="font-serif mt-3 hero-number"
                        style={{ fontSize: "clamp(2.6rem, 6vw, 5rem)", lineHeight: 1.02, letterSpacing: "-0.025em" }}
                    >
                        Most investors lose money <br />
                        <em style={{ color: "hsl(var(--hold))" }}>not because they're wrong.</em>
                        <br />
                        <span style={{ color: "hsl(var(--text-secondary))" }}>Because they're guessing.</span>
                    </h1>
                    <p className="mt-6 max-w-2xl text-base md:text-lg" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}>
                        Every trade you make without full reasoning is a coin flip.
                        Neural is the AI analyst that reads the same balance sheets, charts, and macro signals
                        that institutional desks pay <span className="font-mono" style={{ color: "hsl(var(--text-primary))" }}>$2,400+/month</span>
                        {" "}to access — and hands you the verdict, the evidence, and the risks in under 30 seconds.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-4">
                        <Link
                            to="/dashboard"
                            className="btn-primary !px-8 !py-3"
                            data-testid="why-cta-dashboard"
                        >
                            <Zap size={14} strokeWidth={1.8} /> Analyze a stock now — free
                            <ArrowRight size={14} strokeWidth={1.8} />
                        </Link>
                        <Link
                            to="/pricing"
                            className="btn-ghost !px-6 !py-3"
                            data-testid="why-cta-pricing"
                        >
                            See pricing · Pro $9/mo
                        </Link>
                        <span
                            className="text-overline"
                            style={{ color: "hsl(var(--text-muted))", fontSize: "0.58rem" }}
                        >
                            No credit card required · cancel anytime
                        </span>
                    </div>
                </section>

                {/* What it is — 3 pillars */}
                <section className="mt-16 md:mt-24" data-testid="what-it-is">
                    <p className="text-overline">What it is</p>
                    <h2 className="font-serif mt-2" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em" }}>
                        An institutional analyst.<br />
                        <span style={{ color: "hsl(var(--text-muted))" }}>Compressed into a web app.</span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 mt-8">
                        {[
                            {
                                icon: Brain,
                                title: "AI-reasoned verdicts",
                                body: "Every BUY · SELL · HOLD comes with 150+ words of evidence: multiples, growth, technicals, and catalysts — cited with specific numbers, not vibes.",
                            },
                            {
                                icon: Telescope,
                                title: "Horizon-fit recommendations",
                                body: "Is this a 3-month trade or a 5-year hold? Neural scores every stock across short, medium, and long-term and tells you which profile fits best.",
                            },
                            {
                                icon: Eye,
                                title: "Public accuracy scorecard",
                                body: "Every verdict we issue is tracked and graded against the market. Full transparency — no cherry-picked screenshots, no survivor-bias marketing.",
                            },
                        ].map((b) => {
                            const Icon = b.icon;
                            return (
                                <div
                                    key={b.title}
                                    className="module p-6 md:p-8"
                                    style={{ background: "hsl(var(--surface))" }}
                                >
                                    <Icon size={22} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                                    <h3
                                        className="font-serif mt-4"
                                        style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}
                                    >
                                        {b.title}
                                    </h3>
                                    <p
                                        className="mt-3 text-sm leading-relaxed"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        {b.body}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Why we built it */}
                <section className="mt-20" data-testid="why-built">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12">
                        <div className="md:col-span-2">
                            <p className="text-overline">Why Neural exists</p>
                            <h2
                                className="font-serif mt-2"
                                style={{ fontSize: "clamp(2rem, 3.5vw, 2.8rem)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
                            >
                                Retail traders are <em style={{ color: "hsl(var(--sell))" }}>structurally</em> disadvantaged.
                            </h2>
                        </div>
                        <div className="md:col-span-3">
                            <p
                                className="text-base leading-relaxed"
                                style={{ color: "hsl(var(--text-secondary))" }}
                            >
                                Bloomberg terminals cost{" "}
                                <strong style={{ color: "hsl(var(--text-primary))" }}>$2,400 / month</strong>.
                                FactSet, $1,800. Institutional research desks employ entire floors of analysts.
                                The tools that generate <em>edge</em> have always been gated behind institutional
                                budgets — which is why{" "}
                                <strong style={{ color: "hsl(var(--sell))" }}>80% of retail traders underperform the S&P over 5 years</strong>{" "}
                                (Dalbar, 2023).
                            </p>
                            <p
                                className="text-base leading-relaxed mt-4"
                                style={{ color: "hsl(var(--text-secondary))" }}
                            >
                                We built Neural because AI — the same Claude Sonnet 4.5 model that
                                powers enterprise research assistants — can now synthesize fundamentals,
                                technicals, and macro in seconds. For{" "}
                                <strong className="font-mono" style={{ color: "hsl(var(--hold))" }}>$9/month</strong>.
                            </p>
                            <p
                                className="text-base leading-relaxed mt-4"
                                style={{ color: "hsl(var(--text-primary))" }}
                            >
                                The asymmetry is over. You just need to be on the right side of it.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Competitive matrix */}
                <section className="mt-20 md:mt-24" data-testid="competitive-matrix">
                    <p className="text-overline">How we compare</p>
                    <h2
                        className="font-serif mt-2"
                        style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
                    >
                        Everyone else built <em>tools</em>.<br />
                        <span style={{ color: "hsl(var(--hold))" }}>We built an analyst.</span>
                    </h2>
                    <p className="mt-4 max-w-3xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                        Brokers execute trades. Screeners filter lists. Robo-advisors rebalance index funds.
                        None of them <em>reason</em> with you. Compare what you're getting — row by row.
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
                                        const isUs = c.key === "neural";
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
                                                    {isUs && (
                                                        <Crown size={12} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                                                    )}
                                                    <span
                                                        className="font-serif"
                                                        style={{
                                                            fontSize: isUs ? "0.95rem" : "0.78rem",
                                                            color: isUs ? "hsl(var(--hold))" : "hsl(var(--text-primary))",
                                                            letterSpacing: "-0.005em",
                                                            lineHeight: 1.15,
                                                            fontWeight: isUs ? 600 : 400,
                                                        }}
                                                    >
                                                        {c.name}
                                                    </span>
                                                    <span
                                                        className="text-overline"
                                                        style={{
                                                            fontSize: "0.5rem",
                                                            color: "hsl(var(--text-muted))",
                                                        }}
                                                    >
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
                                            {feat.label}
                                        </td>
                                        {COMPETITORS.map((c) => (
                                            <td
                                                key={c.key}
                                                className="py-3 px-3"
                                                style={{
                                                    background: c.key === "neural" ? "hsla(38, 45%, 45%, 0.04)" : "transparent",
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

                {/* Cost of inaction */}
                <section className="mt-20 md:mt-24" data-testid="cost-inaction">
                    <div
                        className="module p-8 md:p-12"
                        style={{
                            background: "hsla(38, 45%, 45%, 0.04)",
                            border: "1px solid hsl(var(--hold))",
                        }}
                    >
                        <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                            <AlertTriangle size={11} className="inline mr-1" strokeWidth={1.5} /> The real cost
                        </p>
                        <h2
                            className="font-serif mt-2"
                            style={{ fontSize: "clamp(1.8rem, 3.2vw, 2.6rem)", letterSpacing: "-0.02em", lineHeight: 1.1 }}
                        >
                            One mis-timed trade costs more<br />
                            than <em>ten years</em> of Neural.
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
                            <div>
                                <p
                                    className="hero-number font-mono"
                                    style={{ fontSize: "2.8rem", color: "hsl(var(--sell))" }}
                                >
                                    $1,247
                                </p>
                                <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Average retail loss per wrong-sided position (FINRA, 2024)
                                </p>
                            </div>
                            <div>
                                <p
                                    className="hero-number font-mono"
                                    style={{ fontSize: "2.8rem", color: "hsl(var(--hold))" }}
                                >
                                    $108
                                </p>
                                <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Full year of Neural Pro ($9 × 12) — less than 9% of one bad trade
                                </p>
                            </div>
                            <div>
                                <p
                                    className="hero-number font-mono"
                                    style={{ fontSize: "2.8rem", color: "hsl(var(--buy))" }}
                                >
                                    30s
                                </p>
                                <p className="text-sm mt-1" style={{ color: "hsl(var(--text-secondary))" }}>
                                    From "is this a good idea?" to institutional-grade answer
                                </p>
                            </div>
                        </div>
                        <p
                            className="mt-8 text-base leading-relaxed"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            Every day you trade without <strong>full insight</strong>, you pay an invisible tax —
                            in overpaid entries, missed exits, and conviction you didn't actually have.
                            Neural doesn't guarantee profits. It guarantees you'll
                            <em style={{ color: "hsl(var(--hold))" }}> never be the last one to know </em>
                            why a stock is moving.
                        </p>
                    </div>
                </section>

                {/* Final CTA */}
                <section className="mt-20 md:mt-28 text-center" data-testid="final-cta">
                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                        <Compass size={11} className="inline mr-1" strokeWidth={1.5} /> Your next trade
                    </p>
                    <h2
                        className="font-serif mt-3"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", letterSpacing: "-0.025em", lineHeight: 1.02 }}
                    >
                        Stop guessing.<br />
                        <em style={{ color: "hsl(var(--buy))" }}>Start knowing.</em>
                    </h2>
                    <p className="mt-6 max-w-2xl mx-auto text-base md:text-lg" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}>
                        Free tier includes 3 watchlist positions and 1 full AI analysis per day.
                        No credit card. No broker lock-in. No noise.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            to="/dashboard"
                            className="btn-primary !px-10 !py-4"
                            style={{ fontSize: "1rem" }}
                            data-testid="final-cta-dashboard"
                        >
                            <TrendingUp size={16} strokeWidth={1.8} /> Run my first analysis
                            <ArrowRight size={16} strokeWidth={1.8} />
                        </Link>
                        <Link
                            to="/scorecard"
                            className="btn-ghost !px-6 !py-4"
                            style={{ fontSize: "0.9rem" }}
                            data-testid="final-cta-scorecard"
                        >
                            <BookOpen size={14} strokeWidth={1.5} /> See our AI track record
                        </Link>
                    </div>
                    <p
                        className="mt-10 text-overline max-w-3xl mx-auto leading-relaxed"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.58rem" }}
                    >
                        <Shield size={10} className="inline mr-1" strokeWidth={1.5} />
                        Neural Stock Intelligence&trade; is an AI-assisted research tool. Content is for educational and
                        informational purposes only and is not investment advice. Markets are volatile; past performance
                        does not guarantee future results. You decide, you own the outcome.
                    </p>
                </section>
            </div>
        </AppShell>
    );
}
