// NOTE: This file is intentionally long — it is the full in-app user manual.
// Do not split into sub-components without updating the TOC anchor logic.

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    AlertTriangle, Award, BarChart3, BellRing, BookOpen, Briefcase,
    Check, ChevronRight, Compass, GraduationCap, HelpCircle, History,
    Info, Layers, LineChart, Search, Settings as SettingsIcon, Sparkles,
    Eye, Telescope, UserCheck, X, TrendingUp, ShieldAlert, Lightbulb,
    Target, Zap, Clock, AlertCircle,
} from "lucide-react";

/* ─── tiny primitives ─────────────────────────────────────────────────────── */

function Callout({ tone = "info", title, children }) {
    const cfg = {
        info:  { icon: Info,         bg: "hsla(210,80%,50%,0.06)", border: "hsl(210,80%,55%)", text: "hsl(210,80%,65%)" },
        tip:   { icon: Lightbulb,    bg: "hsla(145,60%,40%,0.06)", border: "hsl(145,55%,45%)", text: "hsl(145,55%,55%)" },
        warn:  { icon: AlertTriangle, bg: "hsla(38,85%,50%,0.06)", border: "hsl(38,85%,55%)",  text: "hsl(38,85%,60%)"  },
        danger:{ icon: ShieldAlert,  bg: "hsla(0,70%,50%,0.06)",  border: "hsl(0,70%,55%)",   text: "hsl(0,70%,60%)"   },
    };
    const { icon: Icon, bg, border, text } = cfg[tone] || cfg.info;
    return (
        <div className="mt-5 p-4 text-sm leading-relaxed"
            style={{ background: bg, borderLeft: `3px solid ${border}`, color: "hsl(var(--text-secondary))" }}>
            <p className="font-semibold mb-1 flex items-center gap-2" style={{ color: text }}>
                <Icon size={13} strokeWidth={2} />{title}
            </p>
            {children}
        </div>
    );
}

function Step({ n, title, children }) {
    return (
        <div className="mt-5 flex gap-4">
            <span className="font-mono text-xs shrink-0 mt-0.5 w-6 h-6 flex items-center justify-center rounded-full"
                style={{ background: "hsl(var(--surface-elevated))", color: "hsl(var(--text-muted))", border: "1px solid hsl(var(--border-default))" }}>
                {n}
            </span>
            <div>
                <p className="font-semibold text-sm mb-1" style={{ color: "hsl(var(--text-primary))" }}>{title}</p>
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>{children}</p>
            </div>
        </div>
    );
}

function Section({ id, icon: Icon, title, kicker, children }) {
    return (
        <section id={id} className="scroll-mt-24 pt-10 border-t" style={{ borderColor: "hsl(var(--border-divider))" }}>
            <div className="flex items-center gap-2 mb-1">
                {Icon && <Icon size={14} strokeWidth={1.5} style={{ color: "hsl(var(--accent-primary))" }} />}
                <span className="font-mono text-[11px]" style={{ color: "hsl(var(--accent-primary))" }}>{kicker}</span>
            </div>
            <h2 className="font-serif mb-5" style={{ fontSize: "1.65rem", letterSpacing: "-0.01em" }}>{title}</h2>
            {children}
        </section>
    );
}

function ChapterHeader({ title, subtitle }) {
    return (
        <div className="pt-14 pb-2">
            <p className="text-overline" style={{ color: "hsl(var(--accent-primary))" }}>{title}</p>
            {subtitle && <p className="mt-1 text-sm" style={{ color: "hsl(var(--text-muted))" }}>{subtitle}</p>}
        </div>
    );
}

function DosDonts({ dos, donts }) {
    return (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 text-sm" style={{ background: "hsla(145,55%,40%,0.06)", border: "1px solid hsla(145,55%,45%,0.3)" }}>
                <p className="font-mono text-[11px] mb-3" style={{ color: "hsl(145,55%,55%)", letterSpacing: "0.08em" }}>DO</p>
                <ul className="space-y-2">
                    {dos.map((d, i) => (
                        <li key={i} className="flex gap-2" style={{ color: "hsl(var(--text-secondary))" }}>
                            <Check size={12} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: "hsl(145,55%,55%)" }} />
                            {d}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="p-4 text-sm" style={{ background: "hsla(0,70%,50%,0.06)", border: "1px solid hsla(0,70%,55%,0.3)" }}>
                <p className="font-mono text-[11px] mb-3" style={{ color: "hsl(0,70%,60%)", letterSpacing: "0.08em" }}>DON'T</p>
                <ul className="space-y-2">
                    {donts.map((d, i) => (
                        <li key={i} className="flex gap-2" style={{ color: "hsl(var(--text-secondary))" }}>
                            <X size={12} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: "hsl(0,70%,60%)" }} />
                            {d}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function WatchOut({ items }) {
    return (
        <div className="mt-5 space-y-3">
            {items.map((item, i) => (
                <div key={i} className="flex gap-3 p-3 text-sm" style={{ background: "hsla(38,85%,50%,0.05)", border: "1px solid hsla(38,85%,55%,0.2)" }}>
                    <AlertCircle size={13} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: "hsl(38,85%,60%)" }} />
                    <span style={{ color: "hsl(var(--text-secondary))" }}>{item}</span>
                </div>
            ))}
        </div>
    );
}

/* ─── TOC ────────────────────────────────────────────────────────────────── */

const TOC = [
    { part: "Part 1 · Understanding the App", sections: [
        ["welcome",       "1.1 · What this app does"],
        ["how-it-works",  "1.2 · How the AI works"],
        ["verdicts",      "1.3 · Reading verdicts correctly"],
        ["confidence",    "1.4 · The confidence score"],
        ["modes",         "1.5 · Three analysis modes"],
        ["glossary",      "1.6 · Glossary"],
    ]},
    { part: "Part 2 · Getting Started", sections: [
        ["signup",        "2.1 · Sign up & onboarding"],
        ["dashboard",     "2.2 · Dashboard tour"],
        ["first-analysis","2.3 · Your first analysis"],
        ["verdict-anatomy","2.4 · Anatomy of a verdict page"],
    ]},
    { part: "Part 3 · Daily Workflow", sections: [
        ["watchlist",     "3.1 · Watchlist & batch sweeps"],
        ["pattern-scan",  "3.2 · Pattern Scan"],
        ["alerts",        "3.3 · Alerts & Telegram"],
        ["dos-donts",     "3.4 · Do's, Don'ts & Watch-outs"],
    ]},
    { part: "Part 4 · Power Features", sections: [
        ["portfolio",     "4.1 · Portfolio P&L"],
        ["scorecard",     "4.2 · Score Card"],
        ["backtest",      "4.3 · Backtesting Lab"],
        ["idx",           "4.4 · IDX exclusives"],
    ]},
    { part: "Part 5 · Reference", sections: [
        ["plans",         "5.1 · Plans comparison"],
        ["settings",      "5.2 · Settings & account"],
        ["faq",           "5.3 · FAQ & troubleshooting"],
        ["disclaimer",    "5.4 · Important disclaimer"],
    ]},
];

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function UserManualPage() {
    const [activeId, setActiveId] = useState("welcome");
    const observerRef = useRef(null);

    useEffect(() => {
        const ids = TOC.flatMap(p => p.sections.map(s => s[0]));
        observerRef.current = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter(e => e.isIntersecting);
                if (visible.length) setActiveId(visible[0].target.id);
            },
            { rootMargin: "-20% 0px -70% 0px" }
        );
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) observerRef.current.observe(el);
        });
        return () => observerRef.current?.disconnect();
    }, []);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Sidebar TOC */}
            <aside className="hidden lg:block lg:col-span-3 sticky top-24 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
                {TOC.map(({ part, sections }) => (
                    <div key={part} className="mb-5">
                        <p className="font-mono text-[10px] mb-2" style={{ color: "hsl(var(--accent-primary))", letterSpacing: "0.08em" }}>{part}</p>
                        {sections.map(([id, label]) => (
                            <a key={id} href={`#${id}`}
                                className="block py-1 text-[12px] transition-colors"
                                style={{ color: activeId === id ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))", fontWeight: activeId === id ? 500 : 400 }}>
                                {label}
                            </a>
                        ))}
                    </div>
                ))}
            </aside>

            {/* Content */}
            <main className="lg:col-span-9 space-y-0">

                <div className="mb-8">
                    <p className="text-overline">Neural Stock Intelligence™</p>
                    <h1 className="font-serif mt-2" style={{ fontSize: "2.4rem", letterSpacing: "-0.02em" }}>User Manual</h1>
                    <p className="mt-3 text-sm leading-relaxed max-w-xl" style={{ color: "hsl(var(--text-secondary))" }}>
                        Complete guide to using the platform effectively — including what the AI actually does, how to read verdicts correctly, and what to watch out for.
                    </p>
                </div>

                {/* ══════════════════════════════════════════════
                    PART 1 — UNDERSTANDING THE APP
                ══════════════════════════════════════════════ */}
                <ChapterHeader title="Part 1 · Understanding the App" subtitle="What this tool is, how it thinks, and how to read it correctly." />

                <Section id="welcome" icon={Sparkles} kicker="1.1" title="What this app does for you">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Neural Stock Intelligence is an AI-powered research assistant. It reads price history, technical indicators, candlestick patterns, fundamentals, and (for IDX stocks) insider filing data — then produces a structured research summary with a directional bias (BUY / HOLD / SELL) and a confidence score.
                    </p>
                    <p className="text-sm leading-relaxed mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                        Think of it as a junior analyst that works 24/7 and never gets tired — but one whose output you must read critically, not blindly follow. The AI gives you a structured starting point. You still make the decision.
                    </p>
                    <Callout tone="danger" title="This is research, not advice">
                        Neural Stock Intelligence is an educational research tool. Nothing it produces constitutes financial advice, a buy or sell recommendation, or a guarantee of any outcome. You are solely responsible for your investment decisions.
                    </Callout>
                </Section>

                <Section id="how-it-works" icon={Layers} kicker="1.2" title="How the AI actually works">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        When you trigger an analysis, the backend runs three parallel data pipelines simultaneously, then feeds everything into a large language model:
                    </p>
                    <div className="mt-4 space-y-3">
                        {[
                            ["Technical pipeline", "Fetches up to 6 months of daily OHLCV price data. Computes RSI, MACD, Bollinger Bands, EMA crossovers, volume trends, and ATR. Identifies support/resistance levels and trend direction."],
                            ["Fundamental pipeline", "Pulls P/E, P/B, EPS, revenue growth, debt/equity, and analyst consensus from financial data providers. For IDX stocks, also fetches quarterly filing data."],
                            ["Candlestick pipeline", "Scans for 15 classic candlestick patterns (Hammer, Engulfing, Doji, Shooting Star, etc.) across daily and weekly timeframes simultaneously. Counts pattern quality and directional bias."],
                            ["Bandarmology (IDX only)", "Cross-references institutional investor net-buy/sell filing data from IDX disclosures. Detects persistent accumulation or distribution signals."],
                            ["LLM synthesis", "All outputs are assembled into a structured prompt and sent to DeepSeek's reasoning model. It weighs the evidence across all pillars, resolves contradictions, and produces the verdict JSON."],
                        ].map(([name, desc]) => (
                            <div key={name} className="flex gap-3 text-sm p-3" style={{ background: "hsl(var(--surface-elevated))", border: "1px solid hsl(var(--border-default))" }}>
                                <ChevronRight size={13} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: "hsl(var(--accent-primary))" }} />
                                <div>
                                    <span className="font-semibold" style={{ color: "hsl(var(--text-primary))" }}>{name} — </span>
                                    <span style={{ color: "hsl(var(--text-secondary))" }}>{desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <WatchOut items={[
                        "The LLM synthesises the inputs but does not have real-time market access — prices are fetched at analysis time and may be minutes behind live trading.",
                        "The model cannot predict future prices. It classifies the current weight of evidence as bullish, bearish, or neutral. These are not the same thing.",
                        "Fundamental data quality varies by market. US data from Yahoo Finance and Finnhub is generally reliable. IDX fundamental data can lag by one quarter.",
                    ]} />
                </Section>

                <Section id="verdicts" icon={Target} kicker="1.3" title="Reading verdicts correctly">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The verdict badge (BUY / HOLD / SELL) is an <strong>analytical bias classification</strong>, not a trade instruction. Here is precisely what each means:
                    </p>
                    <div className="mt-4 space-y-3">
                        {[
                            ["BUY", "hsl(var(--buy))", "The weight of evidence across technical, fundamental, and candlestick inputs is predominantly bullish. The model sees more upside factors than downside at this moment. Not a guarantee of price appreciation."],
                            ["HOLD", "hsl(var(--hold))", "Signals are mixed, insufficient, or contradictory. The model cannot form a strong directional conviction. This could mean a consolidation phase, or simply that the data does not support a clear read."],
                            ["SELL", "hsl(var(--sell))", "The weight of evidence is predominantly bearish. More downside factors than upside detected at analysis time. Not a guaranteed decline — can be overridden by market conditions the model cannot see."],
                        ].map(([verdict, color, desc]) => (
                            <div key={verdict} className="flex gap-3 p-3 text-sm" style={{ border: `1px solid ${color}22`, background: `${color}0a` }}>
                                <span className="font-mono text-xs font-bold shrink-0 px-2 py-0.5 self-start" style={{ color, border: `1px solid ${color}`, background: `${color}15` }}>{verdict}</span>
                                <span style={{ color: "hsl(var(--text-secondary))" }}>{desc}</span>
                            </div>
                        ))}
                    </div>
                    <DosDonts
                        dos={[
                            "Use the verdict as one input among several — check your own thesis against it",
                            "Pay attention to the reasoning paragraphs, not just the badge",
                            "Note the time horizon — a BUY may be for 2–4 weeks, not forever",
                            "Re-analyse after major news events that change the fundamentals",
                            "Use the Bull/Bear/Neutral scenario section to understand what could go wrong",
                        ]}
                        donts={[
                            "Do not buy or sell based solely on the verdict badge",
                            "Do not assume a BUY means the stock will go up — it means evidence leans bullish",
                            "Do not ignore a SELL verdict on a stock you love — it is telling you something",
                            "Do not expect every HOLD to resolve — some stocks genuinely have no edge",
                            "Do not compare verdicts across different analysis dates without re-analysing",
                        ]}
                    />
                </Section>

                <Section id="confidence" icon={Award} kicker="1.4" title="The confidence score — what it means and doesn't mean">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The confidence score (0–100) measures the <strong>model's classification strength</strong> — how aligned the input signals are with each other. It does NOT measure the probability that the price will move in the predicted direction.
                    </p>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-center">
                        {[
                            ["0–45", "Weak", "hsl(var(--text-muted))", "Signals contradict each other. Low-conviction read. Treat with scepticism."],
                            ["46–74", "Moderate", "hsl(var(--hold))", "Partial alignment. Some signals confirm, others diverge. Proceed with caution."],
                            ["75–100", "High", "hsl(var(--buy))", "Strong signal alignment across multiple pillars. This triggers Alerts (≥75)."],
                        ].map(([range, label, color, desc]) => (
                            <div key={range} className="p-3" style={{ border: `1px solid ${color}44`, background: `${color}08` }}>
                                <p className="font-mono text-lg font-bold" style={{ color }}>{range}</p>
                                <p className="font-semibold mt-1 mb-2" style={{ color }}>{label}</p>
                                <p style={{ color: "hsl(var(--text-secondary))" }}>{desc}</p>
                            </div>
                        ))}
                    </div>
                    <WatchOut items={[
                        "A 90% confidence BUY does not mean 90% chance of going up. It means the model found very aligned bullish evidence. The stock can still fall.",
                        "Low confidence (under 45) on a HOLD is actually informative — it means the model genuinely cannot read this stock right now. That indecision is a signal itself.",
                        "Hybrid mode typically produces higher confidence scores than Standard because it has more input pillars to draw from. Do not compare scores across modes directly.",
                    ]} />
                </Section>

                <Section id="modes" icon={Layers} kicker="1.5" title="Three analysis modes — when to use each">
                    <div className="mt-2 space-y-4">
                        {[
                            {
                                name: "Standard",
                                tag: "Fundamentals + Technicals",
                                color: "hsl(var(--text-muted))",
                                when: "Use for stocks where candlestick patterns are noisy or irrelevant — blue-chip long holds, IDX stocks with low liquidity, or when you want a purely quantitative read.",
                                strength: "Most grounded. Least influenced by short-term price noise.",
                                weakness: "Misses timing signals. May be slow to react to trend reversals already visible in the candlestick data.",
                            },
                            {
                                name: "Candlestick",
                                tag: "Price patterns only",
                                color: "hsl(var(--hold))",
                                when: "Use when you want a pure price-action read — swing trading setups, confirming entry timing, or when fundamentals are stale.",
                                strength: "Fast and timing-sensitive. Surfaces pattern-based entry setups that Standard mode ignores.",
                                weakness: "Ignores fundamentals entirely. A beautiful Bullish Engulfing on a company with deteriorating earnings is still dangerous.",
                            },
                            {
                                name: "Hybrid",
                                tag: "All three pillars",
                                color: "hsl(var(--buy))",
                                when: "Default choice for most situations. Use when you want the most complete picture before making a decision.",
                                strength: "Highest information density. Candlestick patterns can confirm or contradict the technical/fundamental read — that tension is valuable.",
                                weakness: "Takes longer. Confidence ceiling is ~70 without pattern confirmation, which can make Hybrid reads feel uncertain on stocks with no clear patterns.",
                            },
                        ].map(m => (
                            <div key={m.name} className="p-4 text-sm" style={{ border: `1px solid hsl(var(--border-default))`, background: "hsl(var(--surface-elevated))" }}>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="font-mono font-bold" style={{ color: m.color }}>{m.name}</span>
                                    <span className="font-mono text-[10px] px-2 py-0.5" style={{ background: "hsl(var(--surface))", color: "hsl(var(--text-muted))", border: "1px solid hsl(var(--border-default))" }}>{m.tag}</span>
                                </div>
                                <p><span className="font-semibold" style={{ color: "hsl(var(--text-primary))" }}>When to use: </span><span style={{ color: "hsl(var(--text-secondary))" }}>{m.when}</span></p>
                                <p className="mt-2"><span className="font-semibold" style={{ color: "hsl(145,55%,55%)" }}>Strength: </span><span style={{ color: "hsl(var(--text-secondary))" }}>{m.strength}</span></p>
                                <p className="mt-1"><span className="font-semibold" style={{ color: "hsl(38,85%,60%)" }}>Weakness: </span><span style={{ color: "hsl(var(--text-secondary))" }}>{m.weakness}</span></p>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="glossary" icon={BookOpen} kicker="1.6" title="Glossary — speak the language">
                    <div className="mt-2 space-y-2 text-sm">
                        {[
                            ["Ticker", "The stock's short code. AAPL = Apple. BBCA.JK = Bank Central Asia on IDX. Always use the exchange suffix for IDX stocks (.JK)."],
                            ["Verdict", "The AI's directional classification: BUY (bullish bias), HOLD (neutral/mixed), or SELL (bearish bias). Not a trade instruction."],
                            ["Confidence score", "0–100. How aligned the input signals are. Not a probability of price movement."],
                            ["RSI", "Relative Strength Index. Above 70 = potentially overbought. Below 30 = potentially oversold."],
                            ["MACD", "Moving Average Convergence/Divergence. A momentum indicator. Signal-line crossovers suggest trend shifts."],
                            ["Bollinger Bands", "Volatility bands around a moving average. Price near the upper band = extended. Near the lower = compressed."],
                            ["Candlestick pattern", "A price action formation formed by one or more trading sessions. Hammer, Doji, Engulfing are examples. Probabilistic, not deterministic."],
                            ["Bandarmology", "IDX-specific. Analysis of institutional (\"bandar\") net-buy/sell patterns from regulatory filings. Accumulation = institutions buying. Distribution = selling."],
                            ["Confluence", "When multiple independent signals point the same direction. High-confluence setups have higher probability than single-signal setups."],
                            ["Time horizon", "The period the verdict is calibrated for. Typically 2–4 weeks for Hybrid/Candlestick, longer for Standard."],
                            ["Intrinsic value", "A rough fundamental estimate of what the stock is worth based on earnings, growth, and discount rate. Anchor, not target price."],
                            ["Score Card", "Your personal track record. Measures how many of your past BUY/SELL verdicts were correct based on subsequent price movement."],
                        ].map(([term, def]) => (
                            <div key={term} className="grid grid-cols-12 gap-3 py-2" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                <span className="col-span-3 font-mono text-[11px] font-semibold self-start pt-0.5" style={{ color: "hsl(var(--text-primary))" }}>{term}</span>
                                <span className="col-span-9" style={{ color: "hsl(var(--text-secondary))" }}>{def}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ══════════════════════════════════════════════
                    PART 2 — GETTING STARTED
                ══════════════════════════════════════════════ */}
                <ChapterHeader title="Part 2 · Getting Started" subtitle="From zero to your first verdict in under five minutes." />

                <Section id="signup" icon={UserCheck} kicker="2.1" title="Sign up & onboarding">
                    <Step n={1} title="Create your account">
                        Go to <Link to="/signup" className="underline" style={{ color: "hsl(var(--text-primary))" }}>/signup</Link>. Enter your name, email, and a password (min 6 characters). Hit <strong>Create account</strong>. No credit card required. Free tier activates immediately.
                    </Step>
                    <Step n={2} title="Accept the disclaimer">
                        On first login you'll see the research disclaimer. Tick it to confirm you understand this is an educational tool, not financial advice. One-time only.
                    </Step>
                    <Step n={3} title="Complete the onboarding wizard">
                        Three quick questions: which markets you trade (US / IDX / both), your experience level, and starter watchlist picks. All three are changeable later in Settings.
                    </Step>
                    <Callout tone="info" title="Already have a verdict from the landing page?">
                        Your anonymous free analysis does not transfer to your account. But signing up immediately gives you 3 fresh analyses per day — run it again on the same ticker from your dashboard.
                    </Callout>
                </Section>

                <Section id="dashboard" icon={LineChart} kicker="2.2" title="Dashboard tour">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The dashboard is your daily home screen. Here's what each section does:
                    </p>
                    <div className="mt-4 space-y-3 text-sm">
                        {[
                            ["Quota strip", "Top of dashboard. Shows analyses used today / weekly cap / watchlist count. Resets at midnight UTC."],
                            ["Alerts module", "High-confidence verdicts (≥75%) that arrived since your last visit. These are the signals worth acting on first."],
                            ["Highest-conviction setups (IDX)", "Top IDX confluence setups from the last 7 days, ranked by quality score. First stop for IDX traders."],
                            ["Watchlist", "Your tracked tickers. Each row shows current price, change %, and the last verdict badge + confidence. Click ✦ to re-analyse."],
                            ["Today's market stats", "Average change across your watchlist, gainers/losers count, unread alerts."],
                        ].map(([name, desc]) => (
                            <div key={name} className="flex gap-3 p-3" style={{ border: "1px solid hsl(var(--border-default))", background: "hsl(var(--surface-elevated))" }}>
                                <span className="font-mono text-[11px] font-semibold shrink-0 w-44" style={{ color: "hsl(var(--text-primary))" }}>{name}</span>
                                <span style={{ color: "hsl(var(--text-secondary))" }}>{desc}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="first-analysis" icon={Sparkles} kicker="2.3" title="Run your first analysis">
                    <Step n={1} title="Add a ticker to your watchlist">
                        Click <strong>Add Stock</strong> on the dashboard. Type a ticker — AAPL for Apple, BBCA.JK for Bank Central Asia. The search will confirm the company name before you add it.
                    </Step>
                    <Step n={2} title="Choose a mode">
                        Start with <strong>Hybrid</strong> — it uses all three analysis pillars and gives the most complete picture. You can change the mode from the mode selector above the watchlist.
                    </Step>
                    <Step n={3} title="Tap the ✦ Analyze button on the ticker row">
                        The row enters a loading state. You'll see live phase labels as the analysis progresses: Fetching data → Technical scan → LLM synthesis → Done. Typically 15–45 seconds.
                    </Step>
                    <Step n={4} title="Read the verdict that lands">
                        The row now shows the verdict badge (BUY / HOLD / SELL), confidence %, and how long ago it was generated. Tap the arrow → to open the full report page.
                    </Step>
                    <Step n={5} title="Open the full report">
                        The report page has the executive summary, confidence breakdown, scenarios, technical panels, and action bar. Read at least the executive summary and the scenarios before making any decision.
                    </Step>
                    <Callout tone="warn" title="Waking up server...">
                        If the app is idle for a while, the first analysis may show "Waking up server…" for 10–15 seconds. This is normal — the backend spins down during inactivity to save costs. The second analysis will be fast.
                    </Callout>
                </Section>

                <Section id="verdict-anatomy" icon={Compass} kicker="2.4" title="Anatomy of a verdict page">
                    <div className="mt-2 space-y-4 text-sm">
                        {[
                            ["1 · Verdict ring", "The large circular badge at the top. Shows BUY / HOLD / SELL with the confidence score. The ring fill represents confidence level."],
                            ["2 · Executive summary", "The most important section. A 3–5 paragraph synthesis of what the AI found and why it landed on this verdict. Read this fully."],
                            ["3 · Confidence breakdown", "A bar chart showing how each pillar (technical, fundamental, candlestick) contributed to the overall confidence. Identifies which signals are driving the verdict."],
                            ["4 · Bull / Bear / Neutral scenarios", "Three explicit scenarios. Even on a high-confidence BUY, the Bear scenario tells you what conditions would make the verdict wrong. Always read this."],
                            ["5 · Technical panel", "RSI, MACD, Bollinger, volume, trend, support/resistance levels. Expandable."],
                            ["6 · Fundamental panel", "P/E, earnings, revenue growth, analyst consensus. Note the data freshness date — for IDX stocks this may be a quarter old."],
                            ["7 · Candlestick panel (Hybrid/Candle modes)", "Patterns detected, their timeframe (daily/weekly), and whether they confirmed or contradicted the technical read."],
                            ["8 · Random Forest opinion", "A machine-learning model trained on historical verdict outcomes gives its own probability estimate. Treat as a second opinion, not primary signal."],
                            ["9 · Intrinsic value anchor", "A rough DCF-style estimate. Shows current price vs estimated fair value. A stock trading significantly above this is pricing in optimistic assumptions."],
                            ["10 · Bandarmology card (IDX only)", "Institutional flow data. Persistent accumulation with high persistence score = smart money building a position. Reporting lag is 5–30 days."],
                            ["11 · Action bar", "Share (public URL) · Trade Slip PDF · Export full PDF · Re-analyse. Re-analyse refreshes with fresh data without consuming a watchlist slot."],
                        ].map(([step, desc]) => (
                            <div key={step} className="flex gap-3">
                                <span className="font-mono text-[11px] font-semibold shrink-0 pt-0.5" style={{ color: "hsl(var(--accent-primary))", minWidth: "11rem" }}>{step}</span>
                                <span style={{ color: "hsl(var(--text-secondary))" }}>{desc}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ══════════════════════════════════════════════
                    PART 3 — DAILY WORKFLOW
                ══════════════════════════════════════════════ */}
                <ChapterHeader title="Part 3 · Daily Workflow" subtitle="How to use the app effectively as part of your research routine." />

                <Section id="watchlist" icon={Eye} kicker="3.1" title="Watchlist & batch sweeps">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Your watchlist is a <strong>research shortlist</strong>, not a portfolio tracker. Add stocks you are actively researching or considering. Remove them when they are no longer relevant.
                    </p>
                    <Step n={1} title="Keep it focused">
                        A watchlist of 5–10 stocks you genuinely follow is more useful than 25 stocks you added once and forgot. Verdict signals age — a verdict from 2 weeks ago on a stock you haven't re-analysed is stale.
                    </Step>
                    <Step n={2} title="Re-analyse before acting">
                        Always re-analyse on the day you are considering acting. Market conditions change. A BUY from last week may be a HOLD today after an earnings miss.
                    </Step>
                    <Step n={3} title="Use Top 3 / Bottom 3 sweep (Pro+)">
                        The batch sweep re-analyses your three highest and three lowest performers in one tap. Run it at the start of each trading day to refresh your read without spending all your daily quota.
                    </Step>
                    <Callout tone="warn" title="Watchlist ≠ auto-analyse">
                        Adding a stock to your watchlist does not trigger automatic analysis. You must manually trigger each analysis. Prices on the watchlist row are live, but the verdict badge is from your last manual analysis.
                    </Callout>
                </Section>

                <Section id="pattern-scan" icon={Search} kicker="3.2" title="Pattern Scan — find setups across your watchlist">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Pattern Scan runs a fast candlestick screen across all tickers in your watchlist simultaneously. It does not run a full AI analysis — it detects pattern formations and flags tickers worth looking at more closely.
                    </p>
                    <Step n={1} title="Run the scan">
                        From the dashboard, tap <strong>Pattern Scan</strong>. Takes 10–20 seconds depending on watchlist size.
                    </Step>
                    <Step n={2} title="Filter by pattern type or direction">
                        Use the filter chips to narrow to bullish-only patterns, or specific patterns like Hammer or Engulfing. Don't try to read every result — focus on the highest-quality matches (Strong / Excellent tier).
                    </Step>
                    <Step n={3} title="Use Pattern Scan as a triage tool">
                        When a ticker flags with a strong pattern, <strong>then</strong> run a full Hybrid analysis on it. The scan surface candidates. The full analysis gives you conviction.
                    </Step>
                    <DosDonts
                        dos={[
                            "Use Pattern Scan first thing each morning to spot overnight formations",
                            "Pair pattern hits with Hybrid analysis before acting",
                            "Prioritise tickers where the pattern direction matches the existing trend",
                            "Look for multiple pattern types on the same ticker — confluence is stronger",
                        ]}
                        donts={[
                            "Don't trade based on Pattern Scan results alone — they are screening signals",
                            "Don't ignore 'Weak' quality patterns — they are there for awareness, not action",
                            "Don't assume weekly patterns are more reliable than daily — both can fail",
                            "Don't run Pattern Scan and then not act on the results — it wastes the signal window",
                        ]}
                    />
                </Section>

                <Section id="alerts" icon={BellRing} kicker="3.3" title="Alerts & Telegram">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        An alert fires automatically when any analysis on your watchlist produces a verdict with confidence ≥ 75%. These are the system's highest-conviction signals. They are worth stopping what you are doing to review.
                    </p>
                    <Step n={1} title="Connect Telegram (one-time setup)">
                        Go to Settings → Telegram. Start a chat with the bot and send the /start command. The bot will confirm your link. You will now receive push notifications for every high-confidence verdict.
                    </Step>
                    <Step n={2} title="Set quiet hours">
                        In Settings → Alerts, configure Quiet Hours so you do not get woken up at 3am by a US pre-market alert.
                    </Step>
                    <Step n={3} title="Review alerts in /alerts">
                        The Alerts page shows a history of all high-confidence verdicts with the price at alert time. This is your signal log.
                    </Step>
                    <WatchOut items={[
                        "A high-confidence alert (≥75%) is still not a trade instruction. It means the evidence was strongly aligned at analysis time. Review the full report before acting.",
                        "Alerts only fire for tickers in your watchlist. If a stock is not in your watchlist, you will not receive alerts for it even if you analyse it.",
                        "Alert prices are the price at analysis time, not real-time. By the time you see a Telegram alert, the price may have moved.",
                    ]} />
                </Section>

                <Section id="dos-donts" icon={ShieldAlert} kicker="3.4" title="Master Do's, Don'ts & Watch-outs">
                    <p className="text-sm leading-relaxed mb-4" style={{ color: "hsl(var(--text-secondary))" }}>
                        The most common mistakes users make — and how to avoid them.
                    </p>

                    <p className="font-semibold text-sm mt-6 mb-2" style={{ color: "hsl(var(--text-primary))" }}>Using verdicts correctly</p>
                    <DosDonts
                        dos={[
                            "Read the full executive summary, not just the badge",
                            "Always check the Bear scenario — it tells you when you are wrong",
                            "Re-analyse on the day you plan to act",
                            "Use verdicts to confirm or challenge your own thesis",
                            "Track your own accuracy via the Score Card",
                        ]}
                        donts={[
                            "Buy or sell based solely on the BUY / SELL badge",
                            "Assume high confidence = guaranteed outcome",
                            "Compare verdicts from different analysis dates without re-running",
                            "Ignore a SELL verdict on a stock you are emotionally attached to",
                            "Use a single analysis to justify a large position",
                        ]}
                    />

                    <p className="font-semibold text-sm mt-6 mb-2" style={{ color: "hsl(var(--text-primary))" }}>Managing your daily quota</p>
                    <DosDonts
                        dos={[
                            "Use batch sweep (Pro+) at start of day to refresh top/bottom movers",
                            "Prioritise re-analysing stocks you are considering acting on today",
                            "Save quota for stocks where a decision is imminent",
                            "Use Pattern Scan (no quota) to triage before deciding which tickers to analyse",
                        ]}
                        donts={[
                            "Re-analyse the same stock multiple times hoping for a different verdict",
                            "Analyse stocks you have no intention of trading just to fill the quota",
                            "Run analyses late at night when IDX markets are closed — data will be stale",
                        ]}
                    />

                    <p className="font-semibold text-sm mt-6 mb-2" style={{ color: "hsl(var(--text-primary))" }}>IDX-specific watch-outs</p>
                    <WatchOut items={[
                        "Bandarmology data lags 5–30 days behind actual transactions. A 'persistent accumulation' signal means institutions were buying in that period — not necessarily right now.",
                        "IDX fundamental data may be one quarter stale. Always check the 'data as of' date in the fundamental panel before relying on earnings or revenue figures.",
                        "Low-liquidity IDX stocks (thin trading volume) produce noisy candlestick signals. The model may flag patterns that are artefacts of low volume, not genuine price action.",
                        "The IDX market opens 09:00–16:00 WIB (Jakarta time). Analyses run outside market hours use the last closing price — not a live quote.",
                        "GOTO.JK and other recent IDX IPOs may have limited history. The model needs at least 15 trading days of data to produce a reliable technical read.",
                    ]} />

                    <p className="font-semibold text-sm mt-6 mb-2" style={{ color: "hsl(var(--text-primary))" }}>US stock watch-outs</p>
                    <WatchOut items={[
                        "US pre-market and after-hours moves are not captured. Analyses run before market open use the previous day's close.",
                        "Earnings announcements can invalidate a verdict within hours. Never rely on a pre-earnings analysis after earnings have been released — re-analyse.",
                        "Highly speculative or meme stocks (thin fundamentals, high volatility) produce low-confidence reads because the model cannot find signal in the noise. That is the correct output.",
                        "ADRs and foreign stocks listed on US exchanges may have limited fundamental data — the model will note this in the executive summary.",
                    ]} />

                    <p className="font-semibold text-sm mt-6 mb-2" style={{ color: "hsl(var(--text-primary))" }}>Things that look like bugs but aren't</p>
                    <WatchOut items={[
                        "'Waking up server…' on first analysis — the backend sleeps after inactivity. Normal. Takes 10–15 seconds then works fine.",
                        "First analysis fails, second attempt works — same reason as above, or a transient yfinance data issue. The app auto-retries once.",
                        "HOLD at 42% confidence — this is valid output. It means the model found no clear edge. Do not force a read that isn't there.",
                        "Verdict didn't change after re-analysis — if the underlying data has not changed significantly, the verdict should not change. Consistency is correct behaviour.",
                        "IDX top picks showing 'Fetching data…' for a long time — Bandarmology and IDX data fetches are slower than US data. Wait up to 60 seconds on first load.",
                    ]} />
                </Section>

                {/* ══════════════════════════════════════════════
                    PART 4 — POWER FEATURES
                ══════════════════════════════════════════════ */}
                <ChapterHeader title="Part 4 · Power Features" subtitle="Modules for tracking positions and stress-testing the system." />

                <Section id="portfolio" icon={Briefcase} kicker="4.1" title="Portfolio P&L">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Portfolio P&L lets you track real positions against live prices and see how Neural's verdicts align with your actual holdings. It is not connected to any brokerage — all entries are manual.
                    </p>
                    <Step n={1} title="Add a position">
                        Tap <strong>Add Position</strong>, enter the ticker, number of shares, and your average cost. The portfolio calculates unrealised gain/loss automatically from the live price.
                    </Step>
                    <Step n={2} title="Add multiple lots if you DCA">
                        If you have bought the same stock at different prices (dollar-cost averaging), add each lot separately. The portfolio blends them into a weighted average cost.
                    </Step>
                    <Step n={3} title="Check verdict alignment">
                        Each portfolio row shows the current Neural verdict for that position. A SELL verdict on a position you are holding is a prompt to re-examine — not necessarily to sell, but to re-examine.
                    </Step>
                    <DosDonts
                        dos={[
                            "Use Portfolio P&L to spot when Neural's verdict diverges from a position you are holding",
                            "Re-analyse any portfolio position showing a SELL or low-confidence HOLD",
                            "Track your cost basis accurately — the P&L is only useful if the entry price is right",
                        ]}
                        donts={[
                            "Don't use Portfolio P&L as a replacement for your brokerage platform",
                            "Don't add positions for stocks you are just watching — use the watchlist for that",
                            "Don't ignore a persistent SELL verdict on a losing position — that is confirmation bias territory",
                        ]}
                    />
                </Section>

                <Section id="scorecard" icon={Award} kicker="4.2" title="Score Card — your personal track record">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The Score Card measures how accurate your past verdicts were. A verdict is marked as a "Hit" if a BUY produced ≥5% gain or a SELL produced ≥5% decline within the time horizon. HOLDs are measured for staying within a ±5% range.
                    </p>
                    <p className="text-sm leading-relaxed mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                        This is your most honest feedback loop. If your hit rate is below 50% on BUY signals, something is wrong — either your stock selection or the market conditions are defeating the model's inputs.
                    </p>
                    <Callout tone="tip" title="Use the Score Card as a calibration tool">
                        If your BUY hit rate is high but SELL hit rate is low, you are better at spotting strength than weakness — adjust your strategy accordingly. If all your high-confidence verdicts are hitting but low-confidence ones are not, that is the model telling you something about its own reliability threshold.
                    </Callout>
                    <WatchOut items={[
                        "Score Card results are beta — they measure current price vs entry price, not time-horizon-end price. A future version will use exact horizon-end prices. Take the numbers as directional, not definitive.",
                        "Verdicts younger than 7 days are marked 'Pending' and excluded from accuracy calculations — the time horizon has not elapsed yet.",
                        "A high hit rate does not mean you are making money — it measures directional accuracy, not position sizing or timing of exits.",
                    ]} />
                </Section>

                <Section id="backtest" icon={History} kicker="4.3" title="Backtesting Lab">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The Backtesting Lab runs Neural's analysis stack against historical data to show how the model's signals have performed in the past. It is a transparency and calibration tool — not a guarantee of future performance.
                    </p>
                    <Step n={1} title="Pick a strategy and ticker">
                        Select a ticker and a backtest window (3 months, 6 months, 1 year). The system re-runs the model on historical data points at weekly intervals.
                    </Step>
                    <Step n={2} title="Read the cumulative P&L chart">
                        The chart shows hypothetical returns if you had followed every BUY signal and exited on every SELL signal. Compare against the SPY (S&P 500) or IDX benchmark line.
                    </Step>
                    <Step n={3} title="Look at the IDX Signal Quality panel">
                        For IDX stocks, this panel shows the quality distribution of historical signals — what percentage were high-confluence vs weak, and how they performed.
                    </Step>
                    <WatchOut items={[
                        "Backtesting is inherently backward-looking. Past performance is not indicative of future results — this is not a cliché, it is a mathematical fact about non-stationary markets.",
                        "The backtest assumes perfect execution at signal price. In reality, slippage, liquidity constraints, and bid-ask spread reduce actual returns.",
                        "Stocks with limited history (recent IPOs) will have shorter backtest windows — do not draw conclusions from fewer than 20 signal events.",
                    ]} />
                </Section>

                <Section id="idx" icon={Telescope} kicker="4.4" title="IDX exclusives — Bandarmology & Top Picks">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        IDX (Indonesia Stock Exchange) stocks get two additional analysis layers not available for US stocks:
                    </p>
                    <div className="mt-4 space-y-4 text-sm">
                        <div className="p-4" style={{ border: "1px solid hsl(var(--border-default))", background: "hsl(var(--surface-elevated))" }}>
                            <p className="font-semibold mb-2" style={{ color: "hsl(var(--text-primary))" }}>Bandarmology</p>
                            <p style={{ color: "hsl(var(--text-secondary))" }}>
                                Cross-references institutional investor net-buy/sell data from IDX regulatory filings. The model detects "persistent accumulation" (institutions consistently buying across multiple reporting periods) or "persistent distribution" (consistently selling). This is the closest thing to seeing smart-money positioning available in public data.
                            </p>
                        </div>
                        <div className="p-4" style={{ border: "1px solid hsl(var(--border-default))", background: "hsl(var(--surface-elevated))" }}>
                            <p className="font-semibold mb-2" style={{ color: "hsl(var(--text-primary))" }}>Top IDX Confluences</p>
                            <p style={{ color: "hsl(var(--text-secondary))" }}>
                                The dashboard highlights the highest-conviction IDX setups from the last 7 days, ranked by a composite quality score. Each entry shows the directional bias, quality tier, insider filing age, and price at analysis. Use this as your IDX morning scan.
                            </p>
                        </div>
                    </div>
                    <DosDonts
                        dos={[
                            "Weight Bandarmology most heavily when persistence_label is 'persistent_accumulation' AND persistence_consistent=true",
                            "Cross-reference Bandarmology signals with the technical verdict — alignment between smart-money buying and a bullish technical read is a high-quality setup",
                            "Check the filing age — signals under 15 days are more actionable than signals from 30 days ago",
                        ]}
                        donts={[
                            "Don't trade on Bandarmology alone — it is a confirmatory signal, not a primary one",
                            "Don't ignore the volume gate flag — if volume_gate_tripped=true, the signal is unreliable",
                            "Don't assume institutional accumulation means the price will rise immediately — smart money positions can take weeks or months to play out",
                        ]}
                    />
                    <Callout tone="warn" title="Reporting lag is real">
                        IDX insider filings lag the actual transaction by 5–30 days. When you see a Bandarmology signal, the institutional activity it describes happened in the past, not today. Use it as background context, not a timing trigger.
                    </Callout>
                </Section>

                {/* ══════════════════════════════════════════════
                    PART 5 — REFERENCE
                ══════════════════════════════════════════════ */}
                <ChapterHeader title="Part 5 · Reference" subtitle="Plans, settings, FAQ, and the legal bits." />

                <Section id="plans" icon={BarChart3} kicker="5.1" title="Guest · Free · Pro · Elite · Week Pass">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        You can try one analysis without creating an account. Signing up unlocks your full daily quota, watchlist, and all features. Higher tiers buy you{" "}
                        <em>more of it</em> — bigger watchlist, more analyses per day, batch sweeps.
                        The numbers below always reflect what the backend actually enforces.
                    </p>
                    <div className="mt-5 overflow-x-auto" data-testid="manual-plans-table">
                        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid hsl(var(--border-default))" }}>
                                    {["Feature","Guest","Free","Week Pass","Pro","Elite"].map(h => (
                                        <th key={h} className="text-left p-2 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody style={{ color: "hsl(var(--text-secondary))" }}>
                                {[
                                    ["Account required",          "No",      "✓",    "✓",    "✓",    "✓"],
                                    ["Analyses / day",            "1 *",     "3",    "10",   "15",   "50"],
                                    ["Verdict detail",            "Preview", "Full", "Full", "Full", "Full"],
                                    ["Watchlist",                 "—",       "5",    "10",   "25",   "500"],
                                    ["Three analysis modes",      "—",       "✓",    "✓",    "✓",    "✓"],
                                    ["Telegram alerts",           "—",       "✓",    "✓",    "✓",    "✓"],
                                    ["Pattern Scan",              "—",       "—",    "—",    "✓",    "✓"],
                                    ["Top 3 / Bottom 3 sweep",   "—",       "—",    "—",    "✓",    "✓"],
                                    ["RF Auto-Scan",              "—",       "—",    "—",    "✓",    "✓"],
                                    ["PDF export (full report)",  "—",       "✓",    "✓",    "✓",    "✓"],
                                    ["Trade Slip PDF",            "—",       "✓",    "✓",    "✓",    "✓"],
                                    ["Share verdict (public URL)","—",       "✓",    "✓",    "✓",    "✓"],
                                    ["Backtesting Lab",           "—",       "—",    "✓",    "✓",    "✓"],
                                    ["Portfolio P&L",             "—",       "✓",    "✓",    "✓",    "✓"],
                                    ["Score Card",                "—",       "✓",    "✓",    "✓",    "✓"],
                                ].map(([feat, g, fr, w, p, e]) => (
                                    <tr key={feat} style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                        <td className="p-2">{feat}</td>
                                        <td className="p-2 font-mono text-[12px]" style={{ color: g === "—" ? "hsl(var(--text-muted))" : undefined }}>{g}</td>
                                        <td className="p-2 font-mono text-[12px]">{fr}</td>
                                        <td className="p-2 font-mono text-[12px]">{w}</td>
                                        <td className="p-2 font-mono text-[12px]">{p}</td>
                                        <td className="p-2 font-mono text-[12px]">{e}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="mt-3 font-mono text-[10px]" style={{ color: "hsl(var(--text-muted))", letterSpacing: "0.05em" }}>
                            * Guest: 1 free analysis per IP per 24h, no account needed. Result is a preview — verdict and confidence score only. Sign up for the full report.
                        </p>
                    </div>
                    <Callout tone="info" title="Week Pass — the no-commitment power-up">
                        Need a full week of paid-tier power without a monthly commitment?
                        Buy a one-time <strong>Week Pass</strong> ($4.99, valid 7 days) — 10 analyses
                        per day, 10-stock watchlist, PDF export, Backtesting access, and share verdicts.
                    </Callout>
                </Section>

                <Section id="settings" icon={SettingsIcon} kicker="5.2" title="Settings & account">
                    <div className="mt-2 space-y-2 text-sm">
                        {[
                            ["Profile", "Update your display name and email. Change your password."],
                            ["Markets", "Set which markets you trade (US / IDX / both). Affects dashboard feed prioritisation."],
                            ["Experience level", "Beginner / Intermediate / Advanced. Affects default mode pre-selection and tooltip verbosity."],
                            ["Analysis mode default", "Set the mode that pre-selects when you open the watchlist. Default is Hybrid."],
                            ["Telegram alerts", "Link your Telegram account. Set quiet hours and which alert types you want."],
                            ["Subscription", "View current plan, billing cycle, and next renewal date. Cancel or upgrade from here."],
                            ["Data & privacy", "Delete your account and all associated data permanently. This cannot be undone."],
                        ].map(([setting, desc]) => (
                            <div key={setting} className="grid grid-cols-12 gap-3 py-2" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                <span className="col-span-3 font-mono text-[11px] font-semibold self-start pt-0.5" style={{ color: "hsl(var(--text-primary))" }}>{setting}</span>
                                <span className="col-span-9" style={{ color: "hsl(var(--text-secondary))" }}>{desc}</span>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="faq" icon={HelpCircle} kicker="5.3" title="FAQ & troubleshooting">
                    <div className="mt-2 space-y-5 text-sm">
                        {[
                            ["Why did my analysis fail on the first attempt but work on the second?",
                             "The backend server sleeps after inactivity (Railway cold-start). The first request wakes it up, which takes 10–15 seconds. The app auto-retries once. If it still fails on retry, there may be a data issue — try again in a minute."],
                            ["Why does HOLD at 42% confidence look different from HOLD at 68%?",
                             "42% means weak/contradictory signals — the model found no meaningful edge. 68% means the model sees a balanced situation with roughly equal bullish and bearish factors. Both are HOLD but for different reasons. Read the executive summary."],
                            ["The verdict hasn't changed after re-analysis — is that a bug?",
                             "No. If the underlying data has not changed significantly since your last analysis, the verdict should be stable. Consistency is correct behaviour. A verdict that flips between BUY and SELL on consecutive analyses would be a worse product."],
                            ["Why is the IDX price showing in USD?",
                             "This was a bug that has been fixed — IDX tickers now display in Rp (Rupiah). If you still see USD, refresh the page. Prices are always in the stock's native currency."],
                            ["I got a BUY and the stock went down — is the AI broken?",
                             "No. A BUY verdict means the evidence at analysis time leaned bullish. Markets can move for reasons the model cannot see — macro events, news breaks, insider activity post-filing. The AI classifies patterns, it does not predict the future."],
                            ["How fresh is the data?",
                             "Price data is fetched live at analysis time (minutes behind live trading). Fundamental data is updated periodically — for IDX stocks it may be one quarter old. Bandarmology data lags 5–30 days behind actual transactions. Check the 'data as of' dates in the fundamental panel."],
                            ["Can I use this for crypto?",
                             "No. The platform is designed exclusively for equities (stocks). Crypto assets are not supported."],
                            ["Why is my Score Card hit rate low?",
                             "Either the model is misreading the stocks you are selecting, or you are selecting stocks in conditions where the signals are unreliable (e.g., earnings-driven moves, macro-driven markets). Try filtering to only high-confidence verdicts (≥75%) and see if that cohort performs better."],
                            ["I cancelled my Pro subscription — why am I still on Free immediately?",
                             "Cancellation takes effect at the end of your current billing period, not immediately. You keep Pro access until the period ends. Your subscription_cancels_at date is shown in Settings → Subscription."],
                            ["The 'Waking up server' message has been showing for over 2 minutes.",
                             "Something went wrong beyond the normal cold-start delay. Refresh the page and try again. If it persists, the backend may be restarting after a deploy — wait 2–3 minutes."],
                        ].map(([q, a]) => (
                            <div key={q}>
                                <p className="font-semibold mb-1" style={{ color: "hsl(var(--text-primary))" }}>Q: {q}</p>
                                <p style={{ color: "hsl(var(--text-secondary))" }}>A: {a}</p>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="disclaimer" icon={ShieldAlert} kicker="5.4" title="Important — Not financial advice">
                    <Callout tone="danger" title="Please read this carefully">
                        <p className="mt-2">Neural Stock Intelligence™ is an <strong>educational research tool</strong>. It is not a licensed financial advisor, broker, or investment service. Nothing produced by this platform — including all AI-generated verdicts, confidence scores, price targets, scenarios, or recommendations — constitutes financial advice, investment advice, or a recommendation to buy, sell, or hold any security.</p>
                        <p className="mt-3">All investment decisions are your own. You are solely responsible for any trades you make and their outcomes. Past accuracy of verdicts does not guarantee future accuracy. Markets are inherently unpredictable and all investments carry risk, including the risk of total loss.</p>
                        <p className="mt-3">The AI model has inherent limitations: it cannot access real-time news, cannot predict earnings surprises, cannot account for sudden macroeconomic shifts, and can produce incorrect outputs. Always conduct your own research and consult a qualified financial professional before making significant investment decisions.</p>
                        <p className="mt-3 font-semibold">By using this platform you confirm that you have read, understood, and accepted these terms.</p>
                    </Callout>
                </Section>

                <div className="pt-12 pb-6 text-center">
                    <p className="font-mono text-[10px]" style={{ color: "hsl(var(--text-muted))", letterSpacing: "0.08em" }}>
                        NEURAL STOCK INTELLIGENCE™ · NEULAB INC. · NOT FINANCIAL ADVICE · LAST UPDATED JUNE 2026
                    </p>
                </div>

            </main>
        </div>
    );
}
