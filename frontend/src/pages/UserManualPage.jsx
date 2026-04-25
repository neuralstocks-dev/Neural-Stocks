/**
 * UserManualPage — beginner-friendly walkthrough.
 *
 * Audience: someone who is new to stock analysis, opens Neulab for the
 * first time, and wants to know "what do I click first?". Every section
 * is a numbered step with plain-English explanations, no jargon, and a
 * direct link to the screen they should open next.
 *
 * Sections kept short on purpose — the goal is "I read this once and now
 * I know how to use the app", not a 50-page reference doc.
 */
import React from "react";
import { Link } from "react-router-dom";
import {
    LineChart,
    Sparkles,
    Eye,
    BellRing,
    Briefcase,
    Award,
    Layers,
    Bot,
    AlertTriangle,
    Info,
    ArrowRight,
    Check,
} from "lucide-react";

// ---------- Section building blocks ----------

function StepNumber({ n }) {
    return (
        <span
            className="inline-flex items-center justify-center font-mono text-xs"
            style={{
                width: 28,
                height: 28,
                border: "1px solid hsl(var(--hold))",
                color: "hsl(var(--hold))",
                borderRadius: 999,
                flexShrink: 0,
            }}
            data-testid={`step-${n}`}
        >
            {n}
        </span>
    );
}

function Step({ n, title, children }) {
    return (
        <div className="flex items-start gap-4 mt-6">
            <StepNumber n={n} />
            <div className="min-w-0 flex-1">
                <h4 className="font-serif text-base" style={{ letterSpacing: "-0.005em" }}>
                    {title}
                </h4>
                <div
                    className="text-sm mt-2 leading-relaxed"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

function Callout({ tone = "info", title, children }) {
    const color =
        tone === "warn" ? "hsl(var(--sell))" : tone === "tip" ? "hsl(var(--buy))" : "hsl(var(--hold))";
    const Icon = tone === "warn" ? AlertTriangle : tone === "tip" ? Check : Info;
    return (
        <div
            className="mt-5 p-4"
            style={{
                border: `1px solid ${color}`,
                borderLeftWidth: 4,
                background: "hsl(var(--surface-elevated))",
                borderRadius: 2,
            }}
        >
            <p
                className="text-overline flex items-center gap-2"
                style={{ color, fontSize: "0.6rem" }}
            >
                <Icon size={12} strokeWidth={2} /> {title}
            </p>
            <div
                className="text-sm mt-2 leading-relaxed"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {children}
            </div>
        </div>
    );
}

function Section({ id, icon: Icon, title, kicker, children }) {
    return (
        <section
            id={id}
            className="module p-6 md:p-8 mb-6"
            data-testid={`manual-section-${id}`}
            style={{ scrollMarginTop: 96 }}
        >
            <div className="flex items-start gap-3">
                <Icon size={22} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                <div>
                    <p
                        className="text-overline"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}
                    >
                        {kicker}
                    </p>
                    <h2
                        className="font-serif"
                        style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)", letterSpacing: "-0.015em" }}
                    >
                        {title}
                    </h2>
                </div>
            </div>
            <div className="mt-4">{children}</div>
        </section>
    );
}

// ---------- Page ----------

export default function UserManualPage() {
    return (
        <>
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-16">
            {/* Hero */}
            <header className="mb-10" data-testid="manual-hero">
                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                    User Manual · v1
                </p>
                <h1
                    className="font-serif mt-3"
                    style={{
                        fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
                        letterSpacing: "-0.025em",
                        lineHeight: 1.05,
                    }}
                >
                    How to actually <em style={{ color: "hsl(var(--buy))" }}>use</em> Neulab.
                </h1>
                <p
                    className="mt-5 text-base md:text-lg max-w-2xl"
                    style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}
                >
                    A friendly, step-by-step walkthrough for first-time users — no trading
                    jargon, no walls of text. Read it once and you'll know exactly what
                    every button does and when to tap it.
                </p>
            </header>

            {/* Quick-jump TOC */}
            <nav
                className="module p-5 mb-8"
                aria-label="Manual table of contents"
                data-testid="manual-toc"
            >
                <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}>
                    Jump to
                </p>
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {[
                        ["intro", "1. What is Neulab"],
                        ["dashboard", "2. The Dashboard"],
                        ["analyze", "3. Running an Analysis"],
                        ["watchlist", "4. Your Watchlist"],
                        ["alerts", "5. Alerts & Telegram"],
                        ["modes", "6. Three Analysis Modes"],
                        ["portfolio", "7. Portfolio P&L"],
                        ["scorecard", "8. The Score Card"],
                        ["limits", "9. Free vs Pro vs Elite"],
                        ["disclaimer", "10. Important disclaimer"],
                    ].map(([id, label]) => (
                        <li key={id}>
                            <a
                                href={`#${id}`}
                                className="font-mono link-underline"
                                style={{ color: "hsl(var(--text-secondary))" }}
                                data-testid={`toc-${id}`}
                            >
                                {label}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 1. What is Neulab */}
            <Section id="intro" icon={Sparkles} kicker="Step 1" title="What is Neulab?">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    Neulab gives you a <strong>second opinion on any stock</strong>, written by an AI
                    that explains its reasoning. You give it a ticker (e.g. <code>AAPL</code> for Apple,
                    or <code>BBCA.JK</code> for Indonesian giant Bank Central Asia), and it produces a{" "}
                    <strong style={{ color: "hsl(var(--buy))" }}>BUY</strong>,{" "}
                    <strong style={{ color: "hsl(var(--hold))" }}>HOLD</strong>, or{" "}
                    <strong style={{ color: "hsl(var(--sell))" }}>SELL</strong> verdict together with a{" "}
                    confidence score from 0–100% and the actual reasons behind it.
                </p>
                <Callout tone="info" title="Neulab is a research tool, not a robo-broker">
                    Neulab does not place trades for you. It helps you decide. Final decisions —
                    and any orders you place at your broker — are 100% yours.
                </Callout>
            </Section>

            {/* 2. Dashboard */}
            <Section id="dashboard" icon={LineChart} kicker="Step 2" title="The Dashboard">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    The <Link to="/dashboard" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Dashboard</Link>{" "}
                    is your home base. Top of the page has a search box where you type a ticker;
                    below it is your <strong>watchlist</strong> (the stocks you saved); below that is
                    a <strong>signal feed</strong> showing recent verdicts you and other users have
                    generated.
                </p>
                <Step n={1} title="Type a ticker into the search box">
                    Examples: <code>AAPL</code>, <code>NVDA</code>, <code>TSLA</code>,{" "}
                    <code>BBCA.JK</code>, <code>BBRI.JK</code>. Indonesian tickers always end with{" "}
                    <code>.JK</code>.
                </Step>
                <Step n={2} title="Pick an Analysis Mode">
                    Three pills sit above the search box: <strong>Std</strong>, <strong>Candle</strong>,
                    and <strong>Hybrid</strong>. If you're a beginner, leave it on{" "}
                    <strong>Hybrid</strong> — it gives the most balanced read. (Section 6 explains the
                    differences.)
                </Step>
                <Step n={3} title="Hit ANALYZE">
                    A small spinning circle appears, the verdict usually arrives in 20–60 seconds
                    depending on how many other people are using the model right now.
                </Step>
            </Section>

            {/* 3. Analyze */}
            <Section id="analyze" icon={Sparkles} kicker="Step 3" title="Running an Analysis">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    An "analysis" is one full AI verdict on one stock. When the verdict arrives, you'll
                    see a big colour-coded ring (green = BUY, amber = HOLD, red = SELL) plus a
                    confidence percentage and a written explanation.
                </p>
                <Step n={1} title="Read the verdict ring first">
                    The colour and the percentage tell you the direction and the AI's confidence.
                    A <strong>BUY at 82%</strong> means the model thinks the stock is likely to go up
                    and is fairly sure. A <strong>HOLD at 55%</strong> means the model is genuinely
                    unsure — perfectly fine, that's signal too.
                </Step>
                <Step n={2} title="Read the reasoning">
                    Below the ring, the AI explains its verdict in plain English. It will mention
                    things like recent earnings, technical patterns, momentum, candlestick formations,
                    and risks. <em>This is the most important part</em> — Neulab is built so you can{" "}
                    interrogate the reasoning, not just trust a number.
                </Step>
                <Step n={3} title="Check the modules below">
                    Scroll down for: <strong>Pattern Scan</strong> (bullish/bearish candlestick
                    patterns detected), <strong>Random-Forest second opinion</strong> (a separate ML
                    model that votes BUY/SELL/HOLD on its own), <strong>Risk factors</strong>,{" "}
                    <strong>Bandarmology</strong> for IDX stocks (institutional flow), and a{" "}
                    <strong>Score Card</strong> breakdown.
                </Step>
                <Callout tone="tip" title="Save the verdict for later">
                    Tap <strong>Share</strong> to get a public URL anyone can open without logging in.
                    Tap <strong>PDF</strong> on Pro/Elite to download the full report.
                </Callout>
            </Section>

            {/* 4. Watchlist */}
            <Section id="watchlist" icon={Eye} kicker="Step 4" title="Your Watchlist">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    Your watchlist is the list of stocks you care about. Tap the{" "}
                    <strong>+ Add to watchlist</strong> button on any analysis, or type a ticker on
                    the dashboard and tap <strong>★</strong> next to it.
                </p>
                <Callout tone="warn" title="Important — the watchlist does NOT auto-update">
                    Adding a stock to your watchlist does <strong>not</strong> automatically run an
                    analysis. The watchlist is just a list. You still need to tap the{" "}
                    <strong>Analyze</strong> (✨) button next to each row when you want a fresh
                    verdict — or use <strong>Top 3 / Bottom 3</strong> for a quick batch sweep.
                </Callout>
                <Step n={1} title="Add stocks you're tracking">
                    Free tier holds up to <strong>5</strong> tickers, Pro holds <strong>25</strong>,
                    Elite is effectively unlimited.
                </Step>
                <Step n={2} title="Tap Analyze (✨) on any row">
                    Each row has a sparkles icon — that runs a fresh verdict for just that ticker.
                    A spinner appears immediately, and the row updates with the new verdict when it
                    finishes.
                </Step>
                <Step n={3} title="Use Top 3 / Bottom 3 for a quick sweep">
                    These buttons scan your entire watchlist and analyse the 3 most-loved and
                    3 most-shorted candidates so you don't have to click each one. Pro and Elite
                    only.
                </Step>
            </Section>

            {/* 5. Alerts */}
            <Section id="alerts" icon={BellRing} kicker="Step 5" title="Alerts & Telegram">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    Neulab can push notifications to you the moment a high-conviction verdict fires
                    on one of your watchlist stocks — delivered straight to{" "}
                    <strong>@neulab_bot</strong> on Telegram. No phone number, no SMS fees.
                </p>
                <Callout tone="warn" title="Confidence threshold: 75% and above">
                    Alerts only fire when the AI's confidence is{" "}
                    <strong>at least 75%</strong> in either direction (BUY or SELL). Anything below
                    that — including most HOLDs — is filtered out so your phone doesn't buzz with
                    low-conviction noise. You can customize this further in Settings.
                </Callout>
                <Step n={1} title="Link your Telegram in Settings">
                    Go to <Link to="/settings" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Settings</Link>{" "}
                    → tap <strong>Link Telegram</strong> → it gives you a 6-character code → paste it
                    into <strong>@neulab_bot</strong> on Telegram. One-time setup.
                </Step>
                <Step n={2} title="Pick which alerts you want">
                    In Settings → "FILTER WHAT REACHES YOUR TELEGRAM": toggle channels (AI Verdicts,
                    Pattern Scans, RF Auto-Scan), pick the analysis modes you trust, and choose the
                    delivery rhythm (<strong>realtime</strong>, <strong>daily digest</strong>, or{" "}
                    <strong>weekly digest</strong>) per channel.
                </Step>
                <Step n={3} title="Set Quiet Hours so you can sleep">
                    Quiet Hours queue any incoming alerts during your "do not disturb" window and
                    deliver them all at once when the window closes. Tokyo, Jakarta, NY — set your
                    timezone and the start/end hours.
                </Step>
                <Step n={4} title="Read everything in /alerts">
                    The <Link to="/alerts" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Alerts inbox</Link>{" "}
                    is your complete notification history — even ones that didn't make it through
                    the Telegram filters. Star, archive, and review past signals here.
                </Step>
            </Section>

            {/* 6. Modes */}
            <Section id="modes" icon={Layers} kicker="Step 6" title="Three Analysis Modes">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    Above the analyse button is a 3-pill switcher. All three are free. They differ
                    in <em>how</em> the AI reasons:
                </p>
                <ul className="mt-4 space-y-3">
                    <li className="text-sm">
                        <strong style={{ color: "hsl(var(--text-primary))" }}>Std (Standard) — </strong>
                        Classic. The AI weighs fundamentals (earnings, P/E, ROE), technical indicators
                        (RSI, MACD, moving averages), and momentum to deliver its verdict. Best for{" "}
                        <em>longer-horizon</em> reads.
                    </li>
                    <li className="text-sm">
                        <strong style={{ color: "hsl(var(--text-primary))" }}>Candle (Candlestick) — </strong>
                        Pure pattern strategy. The AI focuses entirely on candlestick patterns
                        (Hammer, Engulfing, Doji, Three Soldiers, etc.) on daily and weekly charts.
                        Best for <em>timing entries and reversals</em>.
                    </li>
                    <li className="text-sm">
                        <strong style={{ color: "hsl(var(--text-primary))" }}>Hybrid — </strong>
                        Recommended. The AI does the Standard reasoning first and then uses
                        candlestick patterns as confirmation or rejection. This is the most balanced
                        view and the default for most users.
                    </li>
                </ul>
                <Callout tone="tip" title="Beginner pick">
                    If you're new and unsure which to use, just leave it on <strong>Hybrid</strong>.
                </Callout>
            </Section>

            {/* 7. Portfolio */}
            <Section id="portfolio" icon={Briefcase} kicker="Step 7" title="Portfolio P&amp;L">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    The{" "}
                    <Link
                        to="/portfolio"
                        className="link-underline"
                        style={{ color: "hsl(var(--text-primary))" }}
                    >
                        Portfolio
                    </Link>{" "}
                    page tracks money you actually invested. It's separate from the watchlist (which
                    is just stocks you're <em>watching</em>). Use Portfolio to know your real P&amp;L.
                </p>
                <Step n={1} title="Add a position">
                    Tap <strong>+ Add</strong>, enter the ticker, the number of shares you bought,
                    your average buy price, and the buy date. Neulab fetches today's price and
                    calculates your gain or loss live.
                </Step>
                <Step n={2} title="Add multiple lots if you DCA">
                    Bought the same stock at three different prices? Add three lots — Neulab
                    averages them. Each lot keeps its own buy date so cost basis stays accurate.
                </Step>
                <Step n={3} title="Tap any row for the AI verdict">
                    Each portfolio row links straight to the analysis — useful when one of your
                    holdings is down and you want to know if the AI says hold or cut losses.
                </Step>
            </Section>

            {/* 8. Scorecard */}
            <Section id="scorecard" icon={Award} kicker="Step 8" title="The Score Card">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    The{" "}
                    <Link
                        to="/scorecard"
                        className="link-underline"
                        style={{ color: "hsl(var(--text-primary))" }}
                    >
                        Score Card
                    </Link>{" "}
                    shows a single composite score (0–100) for your most-recently analysed stock.
                    Think of it as a quick-glance "is this stock attractive right now?" number with
                    a transparent breakdown of every factor that pushed it up or down.
                </p>
                <p
                    className="text-sm mt-3 leading-relaxed"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    Bottom of the page lists the top 10 trending Indonesian (IDX) equities with
                    their composite score, refreshed every 30 minutes. Tap any name and the full AI
                    verdict runs automatically.
                </p>
            </Section>

            {/* 9. Limits */}
            <Section id="limits" icon={Bot} kicker="Step 9" title="Free vs Pro vs Elite">
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    All tiers get the full AI verdict, all 3 analysis modes, and Telegram alerts.
                    Higher tiers buy you <em>more of it</em> — bigger watchlist, more analyses per
                    day, batch sweeps, PDF export. Compare side-by-side on the{" "}
                    <Link
                        to="/pricing"
                        className="link-underline"
                        style={{ color: "hsl(var(--text-primary))" }}
                    >
                        Pricing page
                    </Link>
                    . The numbers there always reflect what the backend actually enforces.
                </p>
                <Callout tone="info" title="Day Pass for one big research session">
                    Need a few hours of unlimited-feeling power without committing to a monthly?
                    Buy a one-time <strong>Day Pass</strong> — 10 analyses, 10 watchlist tickers,
                    PDF export, all valid for 24 hours.
                </Callout>
            </Section>

            {/* 10. Disclaimer */}
            <Section
                id="disclaimer"
                icon={AlertTriangle}
                kicker="Step 10"
                title="Important — Not financial advice"
            >
                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    Neulab is an <strong>AI-powered research and education tool</strong>. The
                    verdicts, scores, alerts, and patterns shown are <strong>not financial advice</strong>{" "}
                    and Neulab is not a registered investment adviser. Markets are unpredictable; AI
                    models, including ours, can be wrong.
                </p>
                <p className="text-sm leading-relaxed mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                    Always do your own research. Never invest more than you can afford to lose. If you
                    are unsure, consult a licensed financial professional in your jurisdiction.
                </p>
            </Section>

            {/* CTA */}
            <section className="text-center mt-16" data-testid="manual-final-cta">
                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                    You're ready
                </p>
                <h2
                    className="font-serif mt-3"
                    style={{
                        fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.05,
                    }}
                >
                    Run your first verdict.
                </h2>
                <p
                    className="mt-4 max-w-xl mx-auto text-sm"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    The fastest way to learn Neulab is to type a ticker and watch what happens.
                </p>
                <Link
                    to="/dashboard"
                    className="btn-primary mt-6 inline-flex"
                    data-testid="manual-cta-dashboard"
                >
                    Open Dashboard <ArrowRight size={16} strokeWidth={1.8} />
                </Link>
            </section>
            </div>
        </>
    );
}
