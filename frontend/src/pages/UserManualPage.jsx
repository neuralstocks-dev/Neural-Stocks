/**
 * UserManualPage — beginner-friendly, professional walkthrough.
 *
 * Audience: someone new to stock-market analysis who opens Neural Stock
 * Intelligence™ for the first time. Goal: read this once and confidently
 * navigate every feature.
 *
 * Structure: 5 parts, 19 sections, organised from foundational concepts
 * to power features. Every section has a clear objective, plain-English
 * prose, and direct links to the screens being described. Sections in
 * Parts 1-2 require zero prior knowledge.
 */
import React from "react";
import { Link } from "react-router-dom";
import RightRailTOC from "@/components/RightRailTOC";
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
    BookOpen,
    Compass,
    UserCheck,
    Telescope,
    Settings as SettingsIcon,
    HelpCircle,
    History,
    Globe2,
    GraduationCap,
    Search,
    BarChart3,
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

// Part divider — visually separates the 5 major parts of the manual.
function PartDivider({ n, title, subtitle, readMins }) {
    return (
        <div className="mt-12 mb-6" data-testid={`manual-part-${n}`}>
            <p
                className="text-overline"
                style={{ color: "hsl(var(--buy))", fontSize: "0.62rem" }}
            >
                Part {n} · {readMins} min read
            </p>
            <h2
                className="font-serif mt-2"
                style={{
                    fontSize: "clamp(1.5rem, 2.6vw, 1.9rem)",
                    letterSpacing: "-0.015em",
                    color: "hsl(var(--text-primary))",
                }}
            >
                {title}
            </h2>
            <p
                className="mt-1 text-sm max-w-2xl"
                style={{ color: "hsl(var(--text-muted))" }}
            >
                {subtitle}
            </p>
            <hr
                className="mt-4"
                style={{ borderColor: "hsl(var(--buy) / 0.3)", borderTopWidth: 2, width: 48 }}
            />
        </div>
    );
}

function GlossaryRow({ term, plain, techAnchor, anchorId }) {
    return (
        <div
            id={anchorId}
            className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 sm:gap-4 py-3 scroll-mt-24"
            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
            data-testid={`manual-glossary-row-${anchorId?.replace(/^glossary-/, "") || ""}`}
        >
            <p
                className="font-mono text-[12px]"
                style={{ color: "hsl(var(--text-primary))", fontWeight: 500 }}
            >
                {term}
            </p>
            <div>
                <p className="text-sm" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.6 }}>
                    {plain}
                </p>
                {techAnchor && (
                    <Link
                        to={`/technical#${techAnchor}`}
                        className="inline-flex items-center gap-1 mt-1.5 font-mono text-[11px] link-underline"
                        style={{ color: "hsl(var(--hold))" }}
                        data-testid={`manual-glossary-deepdive-${anchorId?.replace(/^glossary-/, "") || ""}`}
                    >
                        Deep dive — methodology <span aria-hidden>→</span>
                    </Link>
                )}
            </div>
        </div>
    );
}

function FAQItem({ q, children }) {
    return (
        <details
            className="group py-3"
            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
            data-testid="manual-faq-item"
        >
            <summary
                className="cursor-pointer text-sm font-medium flex items-start gap-2 list-none"
                style={{ color: "hsl(var(--text-primary))" }}
            >
                <span
                    className="text-[10px] font-mono mt-1.5 transition-transform group-open:rotate-90"
                    style={{ color: "hsl(var(--hold))" }}
                >
                    ▶
                </span>
                <span className="flex-1">{q}</span>
            </summary>
            <div
                className="text-sm mt-2 ml-5 leading-relaxed"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                {children}
            </div>
        </details>
    );
}

// ---------- TOC structure (also drives the page render order via SECTIONS) ----------
const TOC = [
    {
        part: 1,
        title: "Get oriented",
        subtitle: "If you've never analysed a stock before — start here. No jargon, no assumptions.",
        readMins: 5,
        sections: [
            ["welcome", "1.1 · Welcome"],
            ["primer", "1.2 · Stock-market primer"],
            ["glossary", "1.3 · Glossary — speak the language"],
        ],
    },
    {
        part: 2,
        title: "Getting started",
        subtitle: "From sign-up to your first verdict in under five minutes.",
        readMins: 4,
        sections: [
            ["signup", "2.1 · Sign up &amp; onboarding"],
            ["dashboard", "2.2 · The Dashboard tour"],
            ["first-analysis", "2.3 · Run your first analysis"],
            ["verdict-anatomy", "2.4 · Read the verdict page"],
        ],
    },
    {
        part: 3,
        title: "Daily workflow",
        subtitle: "The four screens you'll use every time you research a stock.",
        readMins: 8,
        sections: [
            ["modes", "3.1 · Three analysis modes"],
            ["watchlist", "3.2 · Watchlist &amp; batch sweeps"],
            ["pattern-scan", "3.3 · Pattern Scan"],
            ["alerts", "3.4 · Alerts &amp; Telegram"],
        ],
    },
    {
        part: 4,
        title: "Power features",
        subtitle: "Modules for tracking real positions and stress-testing the system.",
        readMins: 6,
        sections: [
            ["portfolio", "4.1 · Portfolio P&amp;L"],
            ["scorecard", "4.2 · Score Card"],
            ["backtest", "4.3 · Backtesting Lab"],
            ["idx", "4.4 · IDX exclusives — Bandarmology &amp; Top Picks"],
        ],
    },
    {
        part: 5,
        title: "Reference",
        subtitle: "Plans, settings, FAQ, and the legal bits.",
        readMins: 5,
        sections: [
            ["plans", "5.1 · Free · Pro · Elite · Week Pass"],
            ["settings", "5.2 · Settings &amp; account"],
            ["faq", "5.3 · FAQ &amp; troubleshooting"],
            ["disclaimer", "5.4 · Important disclaimer"],
        ],
    },
];

// Flat list of all section ids in scroll order — used by the TOC search & breadcrumb logic.
const ALL_SECTION_IDS = TOC.flatMap((p) => p.sections.map(([id]) => id));

// Build the right-rail TOC config from the same TOC source-of-truth, so the
// inline TOC and the floating rail TOC can never drift out of sync. Strips
// the leading "1.1 · " numbering from rail labels (the numbering is already
// implicit from the group header) so the rail stays compact.
const RAIL_SECTIONS = TOC.map((p) => ({
    group: `Part ${p.part} · ${p.title}`,
    items: p.sections.map(([id, label]) => ({
        id,
        // Strip "1.1 · " or similar number prefix; also decode the few HTML entities
        // (&amp;) used in the inline TOC labels.
        label: label
            .replace(/^\d+\.\d+\s+·\s+/, "")
            .replace(/&amp;/g, "&"),
    })),
}));

// ---------- Page ----------

export default function UserManualPage() {
    return (
        <>
            <RightRailTOC
                sections={RAIL_SECTIONS}
                label="On this page"
                testid="manual-rail-toc"
                width={220}
            />
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-12 md:py-16">
                {/* Hero */}
                <header className="mb-10" data-testid="manual-hero">
                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                        User Manual · v2 · Updated Feb 2026
                    </p>
                    <h1
                        className="font-serif mt-3"
                        style={{
                            fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
                            letterSpacing: "-0.025em",
                            lineHeight: 1.05,
                        }}
                    >
                        How to actually <em style={{ color: "hsl(var(--buy))" }}>use</em> Neural Stock Intelligence™.
                    </h1>
                    <p
                        className="mt-5 text-base md:text-lg max-w-2xl"
                        style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}
                    >
                        A complete, beginner-first walkthrough — five parts, nineteen sections,
                        roughly 25 minutes end-to-end. Every section has a clear objective and
                        direct links to the screens it describes. No prior trading experience
                        assumed.
                    </p>
                    <div
                        className="mt-6 inline-flex items-center gap-2 text-[12px] font-mono"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        <BookOpen size={14} strokeWidth={1.5} /> {ALL_SECTION_IDS.length} sections ·
                        <Globe2 size={14} strokeWidth={1.5} /> US + IDX coverage ·
                        <GraduationCap size={14} strokeWidth={1.5} /> No prior experience needed
                    </div>
                </header>

                {/* Quick-jump TOC — five-part hierarchy */}
                <nav
                    className="module p-5 mb-10"
                    aria-label="Manual table of contents"
                    data-testid="manual-toc"
                >
                    <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}>
                        On this page
                    </p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                        {TOC.map((p) => (
                            <div key={p.part} data-testid={`toc-part-${p.part}`}>
                                <p
                                    className="text-overline mb-2"
                                    style={{ color: "hsl(var(--buy))", fontSize: "0.58rem" }}
                                >
                                    Part {p.part} — {p.title} · {p.readMins} min
                                </p>
                                <ul className="space-y-1.5">
                                    {p.sections.map(([id, label]) => (
                                        <li key={id}>
                                            <a
                                                href={`#${id}`}
                                                className="font-mono text-[12px] link-underline"
                                                style={{ color: "hsl(var(--text-secondary))" }}
                                                data-testid={`toc-${id}`}
                                                dangerouslySetInnerHTML={{ __html: label }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </nav>

                {/* ============================================================ */}
                {/*                       PART 1 — GET ORIENTED                  */}
                {/* ============================================================ */}
                <PartDivider
                    n={1}
                    title="Get oriented"
                    subtitle="If you've never analysed a stock before, start here. No jargon, no assumptions."
                    readMins={5}
                />

                <Section id="welcome" icon={Sparkles} kicker="1.1" title="Welcome — what this app does for you">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Neural Stock Intelligence™ gives you a <strong>second opinion on any stock</strong>,
                        written by an AI that explains its reasoning. You give it a ticker (e.g.{" "}
                        <code>AAPL</code> for Apple, or <code>BBCA.JK</code> for Indonesia's Bank Central
                        Asia), and within roughly 45 seconds it produces a{" "}
                        <strong style={{ color: "hsl(var(--buy))" }}>BUY</strong>,{" "}
                        <strong style={{ color: "hsl(var(--hold))" }}>HOLD</strong>, or{" "}
                        <strong style={{ color: "hsl(var(--sell))" }}>SELL</strong> verdict together
                        with a confidence score (0–100%) and a paragraph-by-paragraph explanation of
                        the actual reasons behind it.
                    </p>
                    <p className="text-sm mt-3 leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Everything on this platform is built around <em>explainability</em>. You'll
                        never see a number without being able to drill into how it was computed,
                        which means you can argue with the model when you disagree — and that's
                        exactly the point.
                    </p>
                    <Callout tone="info" title="Research tool, not a robo-broker">
                        Neural Stock Intelligence™ does not place trades. It surfaces the reasoning, you make the
                        decision. Final orders happen at your broker, on your timeline, under your own
                        responsibility.
                    </Callout>
                </Section>

                <Section id="primer" icon={GraduationCap} kicker="1.2" title="Stock-market primer (60-second crash course)">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Skip this section if you already trade. If you don't, here's the entire mental
                        model in five bullets:
                    </p>
                    <ul className="mt-4 space-y-2.5 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <li>
                            <strong>A stock</strong> is a tiny piece of ownership in a company. When the
                            company does well and people want to own it, the price goes up. When sentiment
                            sours, the price falls.
                        </li>
                        <li>
                            <strong>A ticker</strong> is the short code for a stock. <code>AAPL</code> is
                            Apple, <code>NVDA</code> is Nvidia. Indonesian tickers append <code>.JK</code>{" "}
                            for the Jakarta exchange — <code>BBCA.JK</code>, <code>TLKM.JK</code>.
                        </li>
                        <li>
                            <strong>BUY / HOLD / SELL</strong> is research-speak for "the evidence leans
                            up", "the evidence is mixed", or "the evidence leans down". Neural Stock Intelligence™
                            picks one of the three based on a stack of technical, fundamental, and
                            sentiment signals.
                        </li>
                        <li>
                            <strong>Confidence (0–100%)</strong> is how strongly the model believes its
                            own call. 82% confident BUY = strong conviction. 53% confident HOLD = "we
                            genuinely don't know, take it as a coin-flip".
                        </li>
                        <li>
                            <strong>Swing / position trading</strong> is what this app is built for —
                            holding stocks for weeks to months. We don't do day-trading; the data we
                            ingest is daily-cadence, not tick-level.
                        </li>
                    </ul>
                    <Callout tone="tip" title="Mental model that helps">
                        Think of every Neural verdict as a <em>research analyst's note</em>, not a trade
                        signal. The reasoning matters more than the colour of the ring — that's where
                        you decide whether to agree.
                    </Callout>
                </Section>

                <Section id="glossary" icon={BookOpen} kicker="1.3" title="Glossary — speak the language">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Throughout the verdict pages and elsewhere, you'll see these terms. This
                        glossary is the quick plain-English reference. Each row links forward to{" "}
                        <Link to="/technical" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>the Technical page</Link>{" "}
                        where the full methodology lives. Bookmark this section if you want a
                        cheat-sheet, click <strong>Deep dive →</strong> on any row when you want
                        the maths.
                    </p>
                    <div className="mt-5" data-testid="manual-glossary">
                        <GlossaryRow
                            anchorId="glossary-rsi"
                            term="RSI"
                            techAnchor="tech-pipeline-section"
                            plain="Relative Strength Index. A 0–100 momentum gauge. Above 70 = stock is overheated, below 30 = stock is oversold. Useful for timing reversals."
                        />
                        <GlossaryRow
                            anchorId="glossary-macd"
                            term="MACD"
                            techAnchor="tech-pipeline-section"
                            plain="Moving Average Convergence Divergence. A trend-and-momentum indicator built from two moving averages. Positive crossovers = bullish, negative = bearish."
                        />
                        <GlossaryRow
                            anchorId="glossary-sma-ema"
                            term="SMA / EMA"
                            techAnchor="tech-pipeline-section"
                            plain="Simple / Exponential Moving Average. The smoothed price trend over N days (we use 20 and 50). Stock above its SMA-50 is broadly in an uptrend; below = downtrend."
                        />
                        <GlossaryRow
                            anchorId="glossary-candlestick"
                            term="Candlestick"
                            techAnchor="tech-pipeline-section"
                            plain="A daily price candle showing open, high, low, close. Patterns of consecutive candles (Hammer, Engulfing, Morning Star, Doji) signal potential reversals or continuations."
                        />
                        <GlossaryRow
                            anchorId="glossary-confluence"
                            term="Confluence"
                            techAnchor="confidence"
                            plain="When multiple independent signals point the same direction. A bullish candlestick on top of strong RSI on top of insider accumulation = high-confluence BUY setup."
                        />
                        <GlossaryRow
                            anchorId="glossary-random-forest"
                            term="Random Forest (RF)"
                            techAnchor="random-forest"
                            plain="A statistical classifier we run as a second opinion alongside Claude. RF says BUY/SELL with its own probability — disagreements with the AI calibrate the displayed confidence downward."
                        />
                        <GlossaryRow
                            anchorId="glossary-intrinsic-value"
                            term="Intrinsic value"
                            techAnchor="intrinsic-anchor"
                            plain="What a stock is worth based on fundamentals (earnings, book value, return on equity), regardless of today's price. We compute Graham Number for asset-heavy sectors and Residual Income Model for service / intangible-heavy ones."
                        />
                        <GlossaryRow
                            anchorId="glossary-bandarmology"
                            term="Bandarmology"
                            techAnchor="bandarmology"
                            plain="Indonesian-market term for tracking insider flow. We surface director / commissioner / major-shareholder buying and selling on every .JK ticker, with 30-day and 90-day persistence windows."
                        />
                        <GlossaryRow
                            anchorId="glossary-verdict-ring"
                            term="Verdict ring"
                            techAnchor="confidence"
                            plain="The big colour-coded circle on the analysis page. Green = BUY, amber = HOLD, red = SELL. The percentage inside is the model's confidence in its own call."
                        />
                        <GlossaryRow
                            anchorId="glossary-confidence-calibration"
                            term="Confidence calibration"
                            techAnchor="confidence"
                            plain="The displayed confidence is post-processed by two rules: capped at 65 within 7 days of earnings, and reduced when RF disagrees with Claude's direction. Both adjustments are shown transparently."
                        />
                        <GlossaryRow
                            anchorId="glossary-pattern-scan"
                            term="Pattern Scan"
                            techAnchor="tech-pipeline-section"
                            plain="A batch sweep of your watchlist that detects 15 candlestick patterns on daily and weekly timeframes. Returns confidence-scored alerts when reversal/continuation patterns fire."
                        />
                    </div>
                </Section>

                {/* ============================================================ */}
                {/*                    PART 2 — GETTING STARTED                  */}
                {/* ============================================================ */}
                <PartDivider
                    n={2}
                    title="Getting started"
                    subtitle="From sign-up to your first verdict in under five minutes."
                    readMins={4}
                />

                <Section id="signup" icon={UserCheck} kicker="2.1" title="Sign up & onboarding">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Two ways to start an account:
                    </p>
                    <Step n={1} title="Continue with Google">
                        Fastest path — one tap, no password to remember. We use Emergent's managed
                        Google OAuth, so we never see your Google credentials. Returns you straight
                        to the dashboard.
                    </Step>
                    <Step n={2} title="Email + password">
                        If you prefer not to use Google, fill in your email and a password. Confirm
                        the disclaimer checkbox and you're in. Free tier is the default.
                    </Step>
                    <p className="text-sm mt-5 leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        After your first sign-in, the <strong>Onboarding Wizard</strong> walks you
                        through three quick questions:
                    </p>
                    <ul className="mt-3 space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <li>· <strong>Markets you trade</strong> — US, IDX, or both. We optimise the home feed accordingly.</li>
                        <li>· <strong>Experience level</strong> — beginner / intermediate / advanced. Drives default tooltips and analysis-mode pre-selection.</li>
                        <li>· <strong>Pre-fill your watchlist</strong> — pick from popular tickers (AAPL, NVDA, BBCA.JK…) so your dashboard isn't empty on day one.</li>
                    </ul>
                    <Callout tone="tip" title="You can change every wizard answer later">
                        All three settings live in <Link to="/settings" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Settings → Preferences</Link>{" "}
                        and the watchlist is editable from the dashboard at any time.
                    </Callout>
                </Section>

                <Section id="dashboard" icon={LineChart} kicker="2.2" title="The Dashboard tour">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The <Link to="/dashboard" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Dashboard</Link>{" "}
                        is your daily home. From top to bottom:
                    </p>
                    <ul className="mt-4 space-y-3 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <li>
                            <strong>Search bar.</strong> Type any ticker (e.g. <code>MSFT</code> or{" "}
                            <code>BBRI.JK</code>) and hit <strong>Analyze</strong>. Auto-complete
                            kicks in after 2 characters.
                        </li>
                        <li>
                            <strong>Mode pills (Std · Candle · Hybrid).</strong> Selects how the AI
                            reasons — see Section 3.1 for what each mode means. Beginners: leave on
                            Hybrid.
                        </li>
                        <li>
                            <strong>Watchlist.</strong> Each saved ticker shows its latest verdict,
                            current price, % change today, and a sparkles button (✨) to re-analyse
                            that single row. Drag to reorder, swipe to delete on mobile.
                        </li>
                        <li>
                            <strong>Top 3 / Bottom 3 sweep buttons.</strong> Pro and Elite only —
                            instantly analyses the strongest and weakest candidates in your watchlist
                            so you don't have to click each one.
                        </li>
                        <li>
                            <strong>Auto-Scan banner.</strong> When a watchlist sweep flags a
                            high-conviction shift on one of your stocks, an amber banner appears
                            here. Tap it to jump to the verdict.
                        </li>
                        <li>
                            <strong>Recent signals feed.</strong> Verdicts you and other users
                            recently generated. Click any to read the full analysis.
                        </li>
                        <li>
                            <strong>Trending on Neural.</strong> The most-analysed tickers across the
                            platform in the last 7 days. Useful when you don't know what to research.
                        </li>
                    </ul>
                </Section>

                <Section id="first-analysis" icon={Sparkles} kicker="2.3" title="Run your first analysis">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        An "analysis" is a single AI verdict on one stock. Your first one should
                        take less than two minutes including reading the result.
                    </p>
                    <Step n={1} title="Type a ticker — e.g. AAPL">
                        Familiar US names work well as a first analysis: <code>AAPL</code>,{" "}
                        <code>MSFT</code>, <code>NVDA</code>, <code>TSLA</code>. For Indonesian
                        users, <code>BBCA.JK</code> or <code>TLKM.JK</code> are good starters
                        because they have rich Bandarmology data.
                    </Step>
                    <Step n={2} title="Leave the mode on Hybrid (default)">
                        Hybrid balances AI reasoning with candlestick pattern checks — the most
                        well-rounded read. You can experiment with Standard or Candlestick later.
                    </Step>
                    <Step n={3} title="Tap ANALYZE">
                        A spinner appears and a phase stepper shows progress: <em>Fetching data →
                        Computing technicals → Scanning patterns → LLM verdict → RF score →
                        Calibrating</em>. Total wall-clock is usually 30–90 seconds.
                    </Step>
                    <Step n={4} title="Read the verdict that lands">
                        You'll automatically be taken to the verdict page. Don't panic at the
                        amount of detail — Section 2.4 walks you through what every section means.
                    </Step>
                    <Callout tone="warn" title="Free tier — 1 analysis per day">
                        Your first verdict consumes your daily Free quota. If you want to keep
                        researching, you'll see a friendly upgrade hint pointing at the Week Pass
                        ($9 for 7 days, 10 verdicts/day) or Pro plan.
                    </Callout>
                </Section>

                <Section id="verdict-anatomy" icon={Compass} kicker="2.4" title="Read the verdict page (anatomy)">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Top of the page → bottom. Read in this order on your first few verdicts.
                    </p>
                    <Step n={1} title="The verdict ring">
                        Big colour-coded circle. Green = BUY, amber = HOLD, red = SELL. The number
                        inside is <em>confidence</em>, not a probability of profit. A "BUY at 78%"
                        means the model is fairly sure of the BUY call given today's data — not that
                        the stock has 78% odds of going up.
                    </Step>
                    <Step n={2} title="Executive summary">
                        Two-paragraph plain-English explanation. Mentions the key drivers (e.g.
                        "earnings beat last quarter", "RSI at 64", "bullish engulfing on the daily
                        chart") and the main risks. <em>This is the most important block on the
                        page.</em> If the reasoning doesn't convince you, the verdict shouldn't either.
                    </Step>
                    <Step n={3} title="Confidence breakdown">
                        Below the ring you'll see chips like "Earnings gate: −10" or "RF disagrees:
                        −5". These are calibration adjustments — the raw model said one thing, the
                        guardrails dialled it down for transparency. Tap any chip for a tooltip
                        explaining the rule.
                    </Step>
                    <Step n={4} title="Alternative scenarios (Bull / Bear / Neutral)">
                        Three boxes showing the optimistic, pessimistic, and neutral paths the same
                        data could support. Use these to pressure-test your own thesis from
                        multiple angles.
                    </Step>
                    <Step n={5} title="Technical, fundamental, sentiment panels">
                        Each independently scored. Click any header to see the underlying numbers
                        (RSI value, P/E ratio, news headlines tagged with sentiment).
                    </Step>
                    <Step n={6} title="Pattern Scan card">
                        Lists candlestick patterns detected on this ticker (Hammer, Doji, Three
                        White Soldiers, etc.) with their conviction scores. Most patterns have a
                        small "What does this mean?" link that opens a glossary modal.
                    </Step>
                    <Step n={7} title="Random-Forest opinion">
                        Independent statistical model showing P(up) and P(down). When RF disagrees
                        with Claude, the badge turns amber and the calibration chip in step 3 fires.
                    </Step>
                    <Step n={8} title="Intrinsic-value anchor">
                        Graham Number or Residual Income Model estimate (depending on sector). Tells
                        you whether today's price sits above or below the model's "fair value".
                    </Step>
                    <Step n={9} title="Bandarmology (IDX only)">
                        For .JK tickers — director / commissioner / major-shareholder buying and
                        selling, with 30-day and 90-day persistence labels. Companion-tools card
                        below points to broker-flow apps for the intraday picture we don't capture.
                    </Step>
                    <Step n={10} title="Action bar — Share · Trade Slip · Export PDF · Re-analyze">
                        <strong>Share</strong> generates a public URL anyone can open without
                        logging in. <strong>Trade Slip</strong> is a one-page PDF you can print or
                        screenshot for your records. <strong>Export PDF</strong> is the full report
                        (Pro+). <strong>Re-analyze</strong> burns one quota slot to refresh the
                        verdict with the latest data.
                    </Step>
                </Section>

                {/* ============================================================ */}
                {/*                     PART 3 — DAILY WORKFLOW                  */}
                {/* ============================================================ */}
                <PartDivider
                    n={3}
                    title="Daily workflow"
                    subtitle="The four screens you'll use every time you research a stock."
                    readMins={8}
                />

                <Section id="modes" icon={Layers} kicker="3.1" title="Three analysis modes — Std · Candle · Hybrid">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Above the analyse button is a 3-pill switcher. All three modes are
                        free — they differ in <em>how</em> the AI reasons:
                    </p>
                    <ul className="mt-4 space-y-3 text-sm">
                        <li>
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Std (Standard) — </strong>
                            Classic equity research. The AI weighs fundamentals (earnings, P/E, ROE),
                            technical indicators (RSI, MACD, moving averages), and momentum to deliver
                            its verdict. Best for <em>longer-horizon</em> reads (4-8+ weeks).
                        </li>
                        <li>
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Candle (Candlestick) — </strong>
                            Pure pattern strategy. The AI focuses on candlestick patterns (Hammer,
                            Engulfing, Doji, Three Soldiers, Morning Star, etc.) on daily and weekly
                            charts. Best for <em>timing entries and reversals</em> (1-3 weeks).
                        </li>
                        <li>
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Hybrid — </strong>
                            Recommended default. The AI does the Standard reasoning first and then
                            uses candlestick patterns as confirmation or rejection. Most balanced
                            view — and the mode we use for the published Scorecard.
                        </li>
                    </ul>
                    <Callout tone="tip" title="Beginner pick">
                        Leave it on <strong>Hybrid</strong> until you've run a dozen analyses and
                        feel like comparing modes on the same ticker. Most users never switch.
                    </Callout>
                </Section>

                <Section id="watchlist" icon={Eye} kicker="3.2" title="Watchlist & batch sweeps">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The watchlist is the list of tickers you care about — a passive list, not
                        active research. Adding a stock here does <em>not</em> auto-run an analysis.
                    </p>
                    <Callout tone="warn" title="Watchlist ≠ Auto-analyze">
                        Adding to watchlist saves the ticker. To get a fresh verdict you must tap
                        the sparkles (✨) on the row, OR run a Top 3 / Bottom 3 batch sweep, OR
                        enable Auto-Scan in Settings (Pro+) which runs a daily background scan and
                        pushes alerts when something flips.
                    </Callout>
                    <Step n={1} title="Add stocks via the search box or analysis page">
                        Tap <strong>+ Add to watchlist</strong> on any verdict, or type a ticker on
                        the dashboard and tap the star (★). Limits: Free 5, Pro 25, Elite unlimited.
                    </Step>
                    <Step n={2} title="Re-analyse a single row">
                        Tap the sparkles icon (✨) next to any row. The button shows a phase
                        stepper while the verdict is being computed. If it fails, the row turns red
                        with a "Tap to retry" pill.
                    </Step>
                    <Step n={3} title="Top 3 / Bottom 3 sweep (Pro+)">
                        Instantly analyses the 3 most-loved and 3 most-shorted candidates in your
                        watchlist. The dashboard updates rows in parallel — you'll see all 6
                        verdicts within ~3 minutes.
                    </Step>
                    <Step n={4} title="Drag to reorder · swipe to delete">
                        Mobile users: long-press and drag any row to reorder. Swipe left to reveal
                        a delete action. Desktop has explicit ↑↓ arrows on hover.
                    </Step>
                </Section>

                <Section id="pattern-scan" icon={Search} kicker="3.3" title="Pattern Scan — find setups across your watchlist">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Pattern Scan is a batch detector for 15 candlestick patterns across every
                        stock in your watchlist on both daily and weekly timeframes. It runs in
                        seconds (no LLM call) and flags everything actionable in one pass.
                    </p>
                    <Step n={1} title="Run the scan">
                        On the dashboard, tap <strong>Pattern Scan</strong>. A progress bar shows
                        each ticker being checked. Total runtime: ~5 seconds for 25 tickers.
                    </Step>
                    <Step n={2} title="Filter the results">
                        Toggle between <strong>Bullish only</strong>, <strong>Bearish only</strong>,
                        and <strong>All</strong>. Sort by conviction score (highest first by default).
                    </Step>
                    <Step n={3} title="Tap a result to drill into the verdict">
                        Each detected pattern links to that ticker's full analysis page with the
                        pattern highlighted in the Candlestick panel.
                    </Step>
                    <Callout tone="tip" title="Pair with Hybrid mode">
                        When Pattern Scan flags a setup AND a Hybrid-mode analysis on that ticker
                        agrees — that's a high-conviction "double confirmation" setup. We render a
                        chip on the verdict page when it happens.
                    </Callout>
                </Section>

                <Section id="alerts" icon={BellRing} kicker="3.4" title="Alerts & Telegram">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Neural Stock Intelligence™ pushes notifications the moment a high-conviction verdict
                        fires on one of your watchlist stocks — delivered straight to{" "}
                        <strong>@neulab_bot</strong> on Telegram. No phone number, no SMS fees.
                    </p>
                    <Callout tone="warn" title="Confidence threshold: 75% and above">
                        Alerts only fire when the AI's confidence is at least <strong>75%</strong>{" "}
                        in either direction (BUY or SELL). Lower-conviction reads — including most
                        HOLDs — are filtered so your phone doesn't buzz with noise. Threshold is
                        configurable in Settings.
                    </Callout>
                    <Step n={1} title="Link your Telegram (one-time setup)">
                        Open <Link to="/settings" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Settings</Link>{" "}
                        → tap <strong>Link Telegram</strong> → you'll get a 6-digit code → paste it
                        into <strong>@neulab_bot</strong> on Telegram. The bot replies confirming
                        the link.
                    </Step>
                    <Step n={2} title="Pick which channels you want">
                        In Settings → "FILTER WHAT REACHES YOUR TELEGRAM": toggle channels
                        (AI Verdicts, Pattern Scans, RF Auto-Scan), pick the analysis modes you
                        trust, and choose delivery rhythm (<strong>realtime</strong>,{" "}
                        <strong>daily digest</strong>, or <strong>weekly digest</strong>) per
                        channel.
                    </Step>
                    <Step n={3} title="Set Quiet Hours">
                        Quiet Hours queue any incoming alerts during your "do not disturb" window
                        and deliver them all at once when the window closes. Pick your timezone
                        (Tokyo, Jakarta, NY, etc.) and the start/end hours.
                    </Step>
                    <Step n={4} title="Review history in /alerts">
                        The <Link to="/alerts" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Alerts inbox</Link>{" "}
                        is your complete notification history — including ones filtered out of
                        Telegram. Star, archive, mark as taken, and review past signals here.
                    </Step>
                </Section>

                {/* ============================================================ */}
                {/*                     PART 4 — POWER FEATURES                  */}
                {/* ============================================================ */}
                <PartDivider
                    n={4}
                    title="Power features"
                    subtitle="Modules for tracking real positions and stress-testing the system."
                    readMins={6}
                />

                <Section id="portfolio" icon={Briefcase} kicker="4.1" title="Portfolio P&L">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The <Link to="/portfolio" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Portfolio</Link>{" "}
                        page tracks money you've actually invested. It's separate from the
                        watchlist (which is just a list of stocks you're <em>watching</em>). Use
                        Portfolio to know your real P&amp;L and link each position to its latest
                        verdict.
                    </p>
                    <Step n={1} title="Add a position">
                        Tap <strong>+ Add</strong>, enter the ticker, the number of shares you
                        bought, your average buy price, and the buy date. Neural fetches today's
                        price and calculates your gain or loss live.
                    </Step>
                    <Step n={2} title="Add multiple lots if you DCA">
                        Bought the same stock at three different prices? Add three lots — Neural
                        averages them. Each lot keeps its own buy date so cost basis stays
                        accurate.
                    </Step>
                    <Step n={3} title="Tap any row for the AI verdict">
                        Each portfolio row links straight to the analysis — useful when one of
                        your holdings is down and you want to know whether the AI says hold or cut
                        losses.
                    </Step>
                    <Step n={4} title="Read the aggregate">
                        Top of the page: total invested, current value, absolute P&amp;L, %
                        return, and best/worst performer. Plus a sparkline showing portfolio value
                        over the last 90 days.
                    </Step>
                </Section>

                <Section id="scorecard" icon={Award} kicker="4.2" title="The Score Card">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The <Link to="/scorecard" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Score Card</Link>{" "}
                        shows a single composite score (0–100) for your most-recently analysed stock,
                        with a transparent breakdown of every factor that pushed the number up or
                        down — momentum, value, sentiment, insider flow, technical confluence.
                    </p>
                    <p className="text-sm mt-3 leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Below the breakdown is the <strong>Top 10 Trending IDX</strong> ranking —
                        live composite scores for the ten most-active Indonesian equities, refreshed
                        every 30 minutes. Tap any name and the full AI verdict runs automatically.
                    </p>
                    <Callout tone="tip" title="Use the Score Card for shortlists, not for buys">
                        High composite score = "this is interesting, dig deeper". It is NOT a buy
                        signal. Always read the underlying verdict before sizing any position.
                    </Callout>
                </Section>

                <Section id="backtest" icon={History} kicker="4.3" title="Backtesting Lab — does Neural's stack actually work?">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The <Link to="/backtest" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Backtesting Lab</Link>{" "}
                        replays our verdicts against the last 12 months of price action so you can
                        see how the system actually performs — hit-rate, cumulative P&amp;L,
                        drawdown, average hold-time. Transparency is the whole point: we show our
                        homework.
                    </p>
                    <Step n={1} title="Pick a strategy">
                        Three preset strategies: <strong>RF Top-N</strong> (rank by RF score, hold
                        the top N), <strong>Verdict-aligned</strong> (only act when LLM and RF
                        agree), <strong>Naive buy-and-hold benchmark</strong>.
                    </Step>
                    <Step n={2} title="Read the cumulative P&L chart">
                        Strategy line vs benchmark line. The shaded area is drawdown depth — small
                        is good. We display realistic slippage assumptions, not idealised fills.
                    </Step>
                    <Step n={3} title="Drill into the IDX Signal-Quality panel">
                        Indonesian users only — scores how often Bandarmology persistence aligned
                        with the verdict actually outperformed the baseline. This is the most
                        honest view of whether our IDX-specific signals add value.
                    </Step>
                </Section>

                <Section id="idx" icon={Telescope} kicker="4.4" title="IDX exclusives — Bandarmology & Top Picks">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Two Indonesia-only modules that no other AI stock platform exposes today.
                    </p>
                    <ul className="mt-4 space-y-3 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <li>
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Bandarmology card.</strong>{" "}
                            Live insider-flow signal computed from official IDX/KSEI filings — directors,
                            commissioners, and major shareholders. Shows accumulation ratio, smart-money
                            ratio, foreign net flow, and our four derived signals (volume gate, 30d/90d
                            persistence, normalised impact tier). Appears on every <code>.JK</code> verdict.
                        </li>
                        <li>
                            <strong style={{ color: "hsl(var(--text-primary))" }}>Top IDX Picks scanner.</strong>{" "}
                            Multi-factor ranking of the most-active Indonesian equities, refreshed every 30
                            minutes. Composite score blends momentum, fundamentals, sentiment, and Bandarmology.
                            Tap any name to run the full verdict.
                        </li>
                    </ul>
                    <Callout tone="warn" title="Reporting lag is real">
                        IDX/KSEI insider filings arrive T+5 to T+30 trading days after the actual transaction.
                        Bandarmology is a confirmatory signal, NOT a timing signal. For real-time tape, pair
                        with Stockbit, RTI Business, or Ajaib (we list ten companion tools on every IDX
                        verdict).
                    </Callout>
                </Section>

                {/* ============================================================ */}
                {/*                       PART 5 — REFERENCE                     */}
                {/* ============================================================ */}
                <PartDivider
                    n={5}
                    title="Reference"
                    subtitle="Plans, settings, FAQ, and the legal bits."
                    readMins={5}
                />

                <Section id="plans" icon={BarChart3} kicker="5.1" title="Free · Pro · Elite · Week Pass">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        All tiers get the full AI verdict, all 3 analysis modes, Telegram alerts,
                        and the published Score Card. Higher tiers buy you <em>more of it</em> —
                        bigger watchlist, more analyses per day, batch sweeps, PDF export. The
                        numbers below always reflect what the backend actually enforces.
                    </p>
                    <div
                        className="mt-5 overflow-x-auto"
                        data-testid="manual-plans-table"
                    >
                        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid hsl(var(--border-default))" }}>
                                    <th className="text-left p-2 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>Feature</th>
                                    <th className="text-left p-2 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>Free</th>
                                    <th className="text-left p-2 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>Week Pass</th>
                                    <th className="text-left p-2 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>Pro</th>
                                    <th className="text-left p-2 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>Elite</th>
                                </tr>
                            </thead>
                            <tbody style={{ color: "hsl(var(--text-secondary))" }}>
                                {[
                                    ["Analyses / day", "1", "10", "20", "Unlimited"],
                                    ["Watchlist size", "5", "10", "25", "Unlimited"],
                                    ["Three analysis modes", "✓", "✓", "✓", "✓"],
                                    ["Telegram alerts", "✓", "✓", "✓", "✓"],
                                    ["Pattern Scan", "—", "✓", "✓", "✓"],
                                    ["Top 3 / Bottom 3 sweep", "—", "✓", "✓", "✓"],
                                    ["RF Auto-Scan", "—", "—", "✓", "✓"],
                                    ["PDF export (full report)", "—", "✓", "✓", "✓"],
                                    ["Trade Slip PDF", "✓", "✓", "✓", "✓"],
                                    ["Share verdict (public URL)", "✓", "✓", "✓", "✓"],
                                    ["Backtesting Lab", "—", "✓", "✓", "✓"],
                                    ["Portfolio P&L", "✓", "✓", "✓", "✓"],
                                ].map(([feat, f, w, p, e]) => (
                                    <tr key={feat} style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                        <td className="p-2">{feat}</td>
                                        <td className="p-2 font-mono text-[12px]">{f}</td>
                                        <td className="p-2 font-mono text-[12px]">{w}</td>
                                        <td className="p-2 font-mono text-[12px]">{p}</td>
                                        <td className="p-2 font-mono text-[12px]">{e}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Callout tone="info" title="Week Pass — the no-commitment power-up">
                        Need a full week of paid-tier power without committing to a monthly?
                        Buy a one-time <strong>Week Pass</strong> ($9, valid 7 days) — 10 analyses
                        per day, 10 watchlist tickers, PDF export, Backtesting access, share
                        verdicts.
                    </Callout>
                    <p className="text-sm mt-4" style={{ color: "hsl(var(--text-muted))" }}>
                        Always-current pricing &amp; full feature comparison:{" "}
                        <Link to="/pricing" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>/pricing</Link>.
                    </p>
                </Section>

                <Section id="settings" icon={SettingsIcon} kicker="5.2" title="Settings & account">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Open <Link to="/settings" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>Settings</Link>{" "}
                        from the avatar in the top-right of any page. The screen is grouped into
                        seven panels:
                    </p>
                    <ul className="mt-4 space-y-2.5 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <li>· <strong>Profile</strong> — display name, email, password reset, account deletion.</li>
                        <li>· <strong>Preferences</strong> — markets you trade, default analysis mode, theme (dark/light).</li>
                        <li>· <strong>Telegram</strong> — link/unlink the bot, run a test alert, manage which channels reach your phone.</li>
                        <li>· <strong>Quiet Hours</strong> — start/end times + timezone, queues alerts during DND.</li>
                        <li>· <strong>RF Auto-Scan</strong> — Pro+ — runs a daily background sweep and pushes alerts on flips.</li>
                        <li>· <strong>Subscription</strong> — current plan, billing date, Manage / Cancel via PayPal.</li>
                        <li>· <strong>Privacy</strong> — export your data, delete your account, opt-out flags.</li>
                    </ul>
                </Section>

                <Section id="faq" icon={HelpCircle} kicker="5.3" title="FAQ & troubleshooting">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        The most common questions and quick fixes. Tap any question to expand.
                    </p>
                    <div className="mt-4">
                        <FAQItem q="My analysis is stuck on 'LLM verdict' for 60+ seconds — what's happening?">
                            Anthropic's Claude API occasionally has slow responses. Our backend retries
                            transient errors automatically up to 2 times. If a verdict still hasn't landed
                            after 240 seconds, the row will turn red with a "Tap to retry" pill — that's
                            your cue. The retry doesn't consume an extra quota slot.
                        </FAQItem>
                        <FAQItem q="I added a stock to watchlist but it shows no verdict — why?">
                            Watchlist is a list, not an auto-analyser. Tap the sparkles (✨) on the row to
                            run the first verdict. After that, the row caches the result so you can re-open
                            it without re-paying a quota slot.
                        </FAQItem>
                        <FAQItem q="My Telegram alerts stopped arriving">
                            Three checks: (1) confirm <strong>@neulab_bot</strong> is still in your chat
                            list and hasn't been blocked; (2) Settings → Telegram → tap{" "}
                            <strong>Send test</strong> — if that doesn't arrive, re-link the bot;
                            (3) check that the verdict in question crossed the 75% confidence threshold —
                            HOLDs and low-conviction signals are filtered by design.
                        </FAQItem>
                        <FAQItem q="I'm on Free and the daily quota error message appears — what now?">
                            Free is 1 analysis per day. Three options: (1) wait for the daily reset
                            (midnight UTC), (2) buy a one-time Week Pass ($9 / 7 days, 10 analyses/day),
                            (3) upgrade to Pro for unlimited daily flow. Past verdicts you've already run
                            stay readable forever — only NEW analyses count against the quota.
                        </FAQItem>
                        <FAQItem q="The IDX ticker I want shows 'no data' — why?">
                            Coverage gaps usually mean (a) the ticker is delisted/suspended, (b) it's
                            outside our RapidAPI provider's coverage list, or (c) we hit our 1,000-req
                            monthly quota and fell back to yfinance which doesn't cover that name. Try
                            again next month, or reach out via support and we'll look into adding it.
                        </FAQItem>
                        <FAQItem q="Can I export my watchlist or portfolio?">
                            CSV import/export is on the roadmap (P2 in our public backlog). Today, the
                            cleanest workaround is to copy the watchlist URL — it's deterministic and you
                            can share or save it. We'll surface a proper export button when CSV ships.
                        </FAQItem>
                        <FAQItem q="The verdict says BUY but I disagree with the reasoning. Should I trust it?">
                            <em>Trust your reasoning, not the colour of the ring.</em> Neural is a research
                            tool — when the explanation doesn't convince you, the verdict shouldn't either.
                            Disagreement is a feature, not a bug. Re-read the Honest Limits section on{" "}
                            <Link to="/technical#honest-limits" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>/technical</Link>{" "}
                            for everything the system can't do.
                        </FAQItem>
                        <FAQItem q="How do I cancel my Pro / Elite subscription?">
                            Settings → Subscription → tap <strong>Manage on PayPal</strong>. PayPal handles
                            the cancellation and we get a webhook within minutes. Your Pro features stay
                            active until the end of the current billing period — no proration on cancellation.
                        </FAQItem>
                        <FAQItem q="Where do I report a bug or request a feature?">
                            Open Settings → Profile → <strong>Contact support</strong>. Bugs typically get
                            replied within 24 hours; feature requests are triaged into the public backlog
                            on <Link to="/why" className="link-underline" style={{ color: "hsl(var(--text-primary))" }}>/why</Link>.
                        </FAQItem>
                    </div>
                </Section>

                <Section
                    id="disclaimer"
                    icon={AlertTriangle}
                    kicker="5.4"
                    title="Important — Not financial advice"
                >
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        Neural Stock Intelligence™ is an <strong>AI-powered research and education tool</strong>.
                        The verdicts, scores, alerts, patterns, and PDFs we generate are{" "}
                        <strong>not financial advice</strong>, and NeuLab Inc. is not a registered
                        investment adviser in any jurisdiction. Markets are unpredictable; AI models —
                        including ours — can be wrong.
                    </p>
                    <p className="text-sm leading-relaxed mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                        Always do your own research before placing any trade. Never invest more than
                        you can afford to lose. Confidence percentages describe the strength of the
                        model's classification given the inputs — they are not forecasts of price
                        movement and not personalised advice. If you are unsure, consult a licensed
                        financial professional in your jurisdiction.
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
                        The fastest way to learn Neural Stock Intelligence™ is to type a ticker and
                        watch what happens.
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
