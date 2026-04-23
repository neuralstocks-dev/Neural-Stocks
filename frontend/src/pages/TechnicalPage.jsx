/**
 * Technical — honest deep-dive of the analysis stack.
 *
 * This page is deliberately NOT marketing. It explains exactly what Neulab
 * uses (and what it does NOT use) so users understand the mechanics behind
 * every verdict, price target, and confidence score.
 */
import React from "react";
import AppShell from "@/components/AppShell";
import {
    Cpu,
    Layers,
    Gauge,
    LineChart,
    Newspaper,
    AlertTriangle,
    BookOpen,
    Database,
    ShieldCheck,
    GitBranch,
    Sparkles,
    Check,
    X,
    Braces,
} from "lucide-react";

export default function TechnicalPage() {
    return (
        <AppShell>
            <div className="max-w-[1200px] mx-auto px-5 md:px-8 pt-10 pb-20" data-testid="technical-page">
                {/* Hero */}
                <section>
                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                        <Cpu size={12} className="inline mr-2" strokeWidth={1.5} />
                        Engineering transparency
                    </p>
                    <h1
                        className="font-serif mt-3"
                        style={{
                            fontSize: "clamp(2.4rem, 5vw, 4.2rem)",
                            letterSpacing: "-0.02em",
                            lineHeight: 1.02,
                        }}
                    >
                        How the analysis<br />
                        <em style={{ color: "hsl(var(--hold))" }}>actually works.</em>
                    </h1>
                    <p
                        className="mt-6 max-w-3xl text-base leading-relaxed"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        Every Neulab verdict is the output of a deterministic data pipeline feeding a
                        large-language-model reasoning step. No black-box neural network predicts
                        price direction. No trained classifier gives you a "73% probability of going up."
                        Each decision is fully auditable — the same inputs produce the same verdict,
                        and the verdict always shows its work.
                    </p>
                </section>

                {/* Myth-buster */}
                <section
                    className="module mt-12 grid grid-cols-1 md:grid-cols-2 gap-0"
                    data-testid="tech-mythbuster"
                    style={{ overflow: "hidden" }}
                >
                    <div
                        className="p-6 md:p-8"
                        style={{
                            background: "hsla(0,55%,55%,0.04)",
                            borderRight: "1px solid hsl(var(--border-divider))",
                        }}
                    >
                        <p className="text-overline mb-3" style={{ color: "hsl(var(--sell))" }}>
                            <X size={12} className="inline mr-1" strokeWidth={1.5} />
                            We do NOT use
                        </p>
                        <ul className="space-y-3 text-sm">
                            <MythLi>SVM (Support Vector Machines)</MythLi>
                            <MythLi>Random Forest classifiers</MythLi>
                            <MythLi>CNN (Convolutional Neural Networks) on chart images</MythLi>
                            <MythLi>LSTM / Transformer price-forecasting models</MythLi>
                            <MythLi>FinBERT or any fine-tuned sentiment classifier</MythLi>
                            <MythLi>Proprietary "alpha" datasets or insider order flow</MythLi>
                            <MythLi>Backtested win-rate claims we can't prove</MythLi>
                        </ul>
                    </div>
                    <div className="p-6 md:p-8" style={{ background: "hsla(142,55%,45%,0.04)" }}>
                        <p className="text-overline mb-3" style={{ color: "hsl(var(--buy))" }}>
                            <Check size={12} className="inline mr-1" strokeWidth={1.5} />
                            We DO use
                        </p>
                        <ul className="space-y-3 text-sm">
                            <MythLi positive>Claude Sonnet 4.5 (Anthropic LLM) for verdict reasoning</MythLi>
                            <MythLi positive>Deterministic technical indicators (RSI, SMA, EMA, MACD)</MythLi>
                            <MythLi positive>Rule-based 15-pattern candlestick detector</MythLi>
                            <MythLi positive>Transparent keyword sentiment heuristic (EN + Bahasa)</MythLi>
                            <MythLi positive>Multi-source data (yfinance, Finnhub, IDX RSS)</MythLi>
                            <MythLi positive>Explainable confidence scoring with visible reasoning</MythLi>
                        </ul>
                    </div>
                </section>

                <p
                    className="mt-6 max-w-3xl text-sm leading-relaxed"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    Why this choice? <strong style={{ color: "hsl(var(--text-primary))" }}>Transparency</strong>.
                    A trained ML model gives you a probability and hides its reasoning. An LLM reasoning layer
                    weighs the same indicators you'd weigh yourself and explains every weighting in plain English —
                    with per-signal citations. Every technical fact used to support a verdict is computed from
                    public market data with formulas you can replicate in Excel.
                </p>

                {/* The pipeline */}
                <SectionHeader
                    icon={GitBranch}
                    overline="Pipeline"
                    title="The seven-stage analysis pipeline."
                    subtitle="What happens in the 15 seconds between you clicking Analyze and the verdict appearing."
                />

                <ol className="mt-8 space-y-1" data-testid="tech-pipeline">
                    <StageRow
                        n="01"
                        title="Data acquisition"
                        body="For US stocks: Finnhub.io live quote (primary) + yfinance OHLC history + fundamentals. For IDX (.JK) stocks: yfinance only. 6 months daily + 2 years weekly candles pulled every run. 10-second timeout with retry fallback. Finnhub results are cached 5 minutes, yfinance per-request."
                    />
                    <StageRow
                        n="02"
                        title="Technical indicator computation"
                        body="RSI (14-period Wilder's smoothing), SMA-20 and SMA-50 (simple moving averages), EMA (exponential moving average), MACD (12-26-9 standard), volume ratios. All formulas deterministic — identical inputs always produce identical outputs. No smoothing randomness, no seed dependence."
                    />
                    <StageRow
                        n="03"
                        title="Candlestick pattern scan"
                        body="15 patterns detected via rule-based geometric constraints (body-to-shadow ratios, close position within range, multi-candle sequence matches). Runs on both daily and weekly timeframes independently. Each detection is either present or absent — no ML confidence score per pattern."
                    />
                    <StageRow
                        n="04"
                        title="Market context enrichment"
                        body="For US: Finnhub returns up to 7 days of company news, analyst consensus (strong buy / buy / hold / sell / strong sell counts), and next earnings calendar entry. For IDX: RSS scraper over CNBC Indonesia Market + Detik Finance filters by ticker code or alias. Sentiment classified per headline."
                    />
                    <StageRow
                        n="05"
                        title="Sentiment heuristic"
                        body={
                            <>
                                Transparent keyword classifier. ~135 English positive/negative terms
                                (surge, plunge, beats, downgrade, lawsuit, record…) + ~80 Bahasa Indonesia
                                terms (melonjak, anjlok, cuan, rugi, digugat…). Each headline exposes its
                                trigger words via the tooltip so users see <em>why</em> it was classified
                                positive or negative. Aggregate score = (positive − negative) / total,
                                clipped to [−1, +1].
                            </>
                        }
                    />
                    <StageRow
                        n="06"
                        title="LLM reasoning (the verdict)"
                        body={
                            <>
                                A structured prompt is built containing all signals from stages 01-05 plus
                                plan-specific mode (Standard / Candlestick / Hybrid). Claude Sonnet 4.5
                                reasons over the bundle and returns a strict JSON response:
                                recommendation (BUY/SELL/HOLD), confidence_score (0–100),
                                price_target (floating point in quote currency), stop_loss, executive_summary
                                (2–4 sentence verdict), reasoning (bullet-level rationale), plus
                                risk_factors and short/medium/long-term outlooks.
                            </>
                        }
                    />
                    <StageRow
                        n="07"
                        title="Verdict persistence and alerting"
                        body="Verdict stored in MongoDB with full signal provenance (indicators, patterns, news payload, raw LLM response) for audit. If confidence ≥ 75 and recommendation is BUY/SELL, a Telegram alert is dispatched to users who've linked @neulab_bot."
                    />
                </ol>

                {/* Confidence score */}
                <SectionHeader
                    icon={Gauge}
                    overline="Confidence"
                    title="What the confidence % actually means."
                    subtitle="It is not a probability. It is an explicit signal-agreement score produced by Claude."
                />

                <div className="mt-8 module p-6 md:p-10" data-testid="tech-confidence">
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-primary))" }}>
                        The LLM prompt instructs Claude to set <code>confidence_score</code> on a 0–100 scale
                        based on the agreement between four input families. When every family leans the same
                        way (bullish or bearish), confidence sits above 75. When signals contradict, it drops
                        toward 40–60. When the price action is genuinely directionless, it falls below 40
                        and the recommendation defaults to HOLD.
                    </p>

                    <div
                        className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-0"
                        style={{ border: "1px solid hsl(var(--border-default))" }}
                    >
                        <FamilyCell
                            label="Trend signals"
                            items={["Price vs SMA-20 / SMA-50", "MACD crossover direction", "RSI zone (oversold / neutral / overbought)"]}
                        />
                        <FamilyCell
                            label="Pattern signals"
                            items={["Daily candlestick patterns", "Weekly candlestick patterns", "Reversal vs continuation classification"]}
                        />
                        <FamilyCell
                            label="Fundamentals"
                            items={["Trailing P/E vs sector norm", "Revenue / earnings growth trend", "Profit margin, ROE, dividend yield"]}
                        />
                        <FamilyCell
                            label="Context"
                            items={["7-day news sentiment score", "Wall Street analyst consensus label", "Proximity to next earnings date"]}
                            last
                        />
                    </div>

                    <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                        How scores map to action
                    </h4>
                    <div className="space-y-2" data-testid="confidence-bands">
                        <ConfidenceBand pct="85–100" label="Very strong" color="hsl(var(--buy))" body="All four families agree. Telegram alert fires for BUY/SELL. This is rare — expect 10-15% of verdicts in this band." />
                        <ConfidenceBand pct="75–84" label="Strong" color="hsl(var(--buy))" body="Three families agree with the fourth neutral. Telegram alert fires. Typical band for actionable verdicts." />
                        <ConfidenceBand pct="60–74" label="Moderate" color="hsl(var(--hold))" body="Mixed but leaning. No alert. Treat as directional hint, not a trigger. Do your own confirmation." />
                        <ConfidenceBand pct="40–59" label="Weak" color="hsl(var(--hold))" body="Contradictory signals. Verdict usually defaults to HOLD. Avoid taking conviction positions." />
                        <ConfidenceBand pct="0–39" label="Avoid" color="hsl(var(--sell))" body="No coherent thesis. Likely noise — skip the ticker or wait for the next earnings cycle." />
                    </div>

                    <p
                        className="mt-6 text-xs font-mono leading-relaxed"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        Because confidence is LLM-produced rather than extracted from a model probability,
                        it's best understood as <strong style={{ color: "hsl(var(--text-primary))" }}>internal consistency of the thesis</strong> — not a statistical probability of the price moving in the predicted direction.
                    </p>
                </div>

                {/* Indicator formulas */}
                <SectionHeader
                    icon={LineChart}
                    overline="Formulas"
                    title="Every indicator, replicable in Excel."
                    subtitle="No proprietary tweaks. All computations follow the published reference formulas."
                />

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4" data-testid="tech-formulas">
                    <FormulaCard
                        name="RSI (Relative Strength Index, 14-period)"
                        formula={`avg_gain = Wilder_MA(max(close[t] − close[t−1], 0), 14)
avg_loss = Wilder_MA(max(close[t−1] − close[t], 0), 14)
RS = avg_gain / avg_loss
RSI = 100 − 100 / (1 + RS)`}
                        note="Wilder smoothing (not simple MA). RSI < 30 = oversold bias; RSI > 70 = overbought bias. Input to trend-family score."
                    />
                    <FormulaCard
                        name="SMA (Simple Moving Average, 20 / 50)"
                        formula={`SMA_n(t) = (1/n) × Σ close[t−i]  for i in [0, n−1]`}
                        note="Price above SMA-20 → short-term uptrend. Price above SMA-50 → medium-term uptrend. Bullish cross (SMA-20 crossing above SMA-50) is a trend signal."
                    />
                    <FormulaCard
                        name="MACD (12-26-9)"
                        formula={`MACD_line  = EMA_12(close) − EMA_26(close)
signal     = EMA_9(MACD_line)
histogram  = MACD_line − signal`}
                        note="MACD histogram flipping sign = trend momentum change. Expanding histogram = accelerating trend."
                    />
                    <FormulaCard
                        name="Volume ratio"
                        formula={`vol_ratio = volume[t] / SMA_20(volume)`}
                        note="Context multiplier — patterns / breakouts on vol_ratio > 1.5 are weighted higher in the LLM prompt as 'high-conviction'."
                    />
                </div>

                {/* Candlestick patterns */}
                <SectionHeader
                    icon={Layers}
                    overline="Pattern engine"
                    title="The 15 candlestick patterns, detected deterministically."
                    subtitle="Each pattern is a geometric rule over 1-5 consecutive candles. No ML, no training data."
                />

                <div className="mt-8 module p-6 md:p-8" data-testid="tech-patterns">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <PatternRow name="Hammer" bias="bullish" body="Small body near top, long lower shadow ≥ 2× body. Reversal signal at support." />
                        <PatternRow name="Inverted Hammer" bias="bullish" body="Small body near bottom, long upper shadow. Potential reversal after downtrend." />
                        <PatternRow name="Bullish Engulfing" bias="bullish" body="Down candle followed by up candle whose body fully engulfs the prior body." />
                        <PatternRow name="Piercing Line" bias="bullish" body="Down candle followed by up candle that opens below and closes above midpoint." />
                        <PatternRow name="Morning Star" bias="bullish" body="Three-candle: down → small body → strong up. Major reversal." />
                        <PatternRow name="Three White Soldiers" bias="bullish" body="Three consecutive up candles, each opening within prior body, closing higher." />
                        <PatternRow name="Bullish Doji Star" bias="bullish" body="Down candle followed by doji (open≈close) at lower low. Indecision = exhaustion." />
                        <PatternRow name="Hanging Man" bias="bearish" body="Hammer shape in uptrend — warns of reversal." />
                        <PatternRow name="Shooting Star" bias="bearish" body="Small body at bottom of candle, long upper shadow ≥ 2× body, in uptrend." />
                        <PatternRow name="Bearish Engulfing" bias="bearish" body="Up candle followed by down candle whose body fully engulfs the prior body." />
                        <PatternRow name="Dark Cloud Cover" bias="bearish" body="Up candle followed by down candle that opens above and closes below midpoint." />
                        <PatternRow name="Evening Star" bias="bearish" body="Three-candle: up → small body → strong down. Major reversal." />
                        <PatternRow name="Three Black Crows" bias="bearish" body="Three consecutive down candles, each opening within prior body, closing lower." />
                        <PatternRow name="Bearish Doji Star" bias="bearish" body="Up candle followed by doji at higher high — momentum exhaustion." />
                        <PatternRow name="Doji" bias="neutral" body="Open ≈ close within small range. Indecision, context-dependent." />
                    </div>
                    <p
                        className="text-xs font-mono mt-6 pt-5"
                        style={{ color: "hsl(var(--text-muted))", borderTop: "1px solid hsl(var(--border-divider))" }}
                    >
                        All detections run on both <strong style={{ color: "hsl(var(--text-primary))" }}>daily</strong> and <strong style={{ color: "hsl(var(--text-primary))" }}>weekly</strong> timeframes.
                        Weekly-only patterns get higher weight in the LLM prompt. Pattern overlap with a supporting technical signal (RSI extreme, volume spike) is flagged as high-conviction.
                    </p>
                </div>

                {/* Analysis modes */}
                <SectionHeader
                    icon={Braces}
                    overline="Analysis modes"
                    title="Three reasoning modes, one engine."
                    subtitle="Same data, different weightings — mode selects which signals the LLM emphasizes."
                />

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4" data-testid="tech-modes">
                    <ModeCard
                        name="Standard"
                        emphasis="Fundamentals + technicals"
                        body="Balanced baseline. Candlestick patterns present in prompt but treated as context, not primary triggers. Best for long-term positioning."
                    />
                    <ModeCard
                        name="Candlestick"
                        emphasis="Pattern-first"
                        body="Candlestick patterns drive the verdict. Technicals and fundamentals act as confirmation or rejection signals. Best for swing/short-term timing."
                    />
                    <ModeCard
                        name="Hybrid"
                        emphasis="AI + Candlestick"
                        body="LLM is explicitly told to weigh patterns as primary, then require technical and fundamental confirmation before upgrading confidence. Highest-conviction mode — recommended default."
                    />
                </div>

                {/* Data sources */}
                <SectionHeader
                    icon={Database}
                    overline="Data sources"
                    title="Where every number comes from."
                    subtitle="Zero hidden pipes. Every data point on the verdict page is attributable to one of these."
                />

                <div className="mt-8 overflow-x-auto" data-testid="tech-data-sources">
                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <Th>Signal</Th>
                                <Th>Source</Th>
                                <Th>Coverage</Th>
                                <Th>Refresh / cache</Th>
                            </tr>
                        </thead>
                        <tbody>
                            <Tr s="Live quote" src="Finnhub.io" cov="US markets" cache="5-min cache" />
                            <Tr s="Live quote (fallback)" src="Yahoo Finance (yfinance)" cov="Global, incl. IDX" cache="Per request" />
                            <Tr s="OHLC history" src="Yahoo Finance" cov="Global, 2+ years" cache="Per request" />
                            <Tr s="Fundamentals (P/E, margin, ROE)" src="Yahoo Finance" cov="Global" cache="Per request" />
                            <Tr s="Company news (US)" src="Finnhub.io" cov="US · 7-day window" cache="5-min cache" />
                            <Tr s="Company news (IDX)" src="CNBC Indonesia + Detik Finance RSS" cov="Indonesia · 7-day window" cache="10-min cache" />
                            <Tr s="Analyst consensus" src="Finnhub.io" cov="US only (free tier)" cache="1-hr cache" />
                            <Tr s="Next earnings" src="Finnhub.io" cov="US only (free tier)" cache="1-hr cache" />
                            <Tr s="Candlestick patterns" src="Neulab in-house engine" cov="Any ticker with OHLC" cache="Computed per analysis" />
                            <Tr s="Verdict + reasoning" src="Anthropic Claude Sonnet 4.5" cov="All tickers" cache="Persisted in MongoDB" />
                        </tbody>
                    </table>
                </div>

                {/* Features */}
                <SectionHeader
                    icon={Sparkles}
                    overline="Product details"
                    title="Feature-level technical specs."
                    subtitle="One-liners for each product surface, so you know exactly what's running."
                />

                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4" data-testid="tech-features">
                    <FeatureSpec
                        title="Watchlist Pattern Scan"
                        body="Detects all 15 candlestick patterns across every ticker in your watchlist, concurrently (async gather). Flags signal strength as strong/confirmation/rejection per ticker. Results stored for 24 h to deduplicate Telegram alerts."
                    />
                    <FeatureSpec
                        title="Portfolio P&L"
                        body="Unrealized P&L computed live: (current_price − avg_cost) × shares. Supports partial-lot averaging on new purchases. P&L tag (BUY/SELL/HOLD) inherits from the most recent AI verdict for the ticker."
                    />
                    <FeatureSpec
                        title="PDF Export (ReportLab)"
                        body="Server-side ReportLab renderer with embedded fonts. Includes: header with quote snapshot, verdict + confidence + targets, technicals table, candlestick findings, market context (headlines / analyst / earnings), reasoning narrative, risk factors, and data-sources footer."
                    />
                    <FeatureSpec
                        title="Public share verdicts"
                        body="One-way share URL with the verdict (no auth required for viewers). Share count rate-limited per tier (Free 5/day, Pro 50/day, Elite unlimited). Viewers see a neutralized version — no plan info, no account data."
                    />
                    <FeatureSpec
                        title="Telegram alerts"
                        body="Bot @neulab_bot. Chat ID linked via 8-digit code. Alerts dispatched async on verdict creation or Pattern Scan completion when confidence ≥ 75 AND rec ∈ {BUY, SELL}. Rate-limited per chat to avoid spam."
                    />
                    <FeatureSpec
                        title="Scorecard accuracy"
                        body="Retrospective comparison: for every past verdict, measures price movement 7/30/90 days later against the recommendation. Displayed as hit-rate %. Currently descriptive, not used to influence future verdicts — no reinforcement loop."
                    />
                </div>

                {/* Limitations */}
                <SectionHeader
                    icon={AlertTriangle}
                    overline="Honest limits"
                    title="What this system cannot do."
                    subtitle="Disclosure beats discovery."
                />

                <div
                    className="mt-8 module p-6 md:p-8"
                    data-testid="tech-limits"
                    style={{
                        background: "hsla(0,55%,55%,0.04)",
                        borderColor: "hsl(var(--sell))",
                    }}
                >
                    <ul className="space-y-4 text-sm leading-relaxed">
                        <LimitLi>
                            <strong>Not a price predictor.</strong> The LLM reasons about direction bias, not specific future prices.
                            The price_target is an anchor based on technical levels (support / resistance / SMA
                            confluence), not a forecast.
                        </LimitLi>
                        <LimitLi>
                            <strong>Sentiment is heuristic.</strong> The keyword classifier catches obvious
                            bullish / bearish language but misses sarcasm, negation ("not bad"), and nuanced
                            forward guidance. The "Why this sentiment?" tooltip shows every trigger word so you
                            can judge reliability per article.
                        </LimitLi>
                        <LimitLi>
                            <strong>IDX has no analyst or earnings data.</strong> Finnhub's free tier doesn't
                            cover Indonesia. IDX verdicts rely purely on yfinance fundamentals + technicals +
                            local RSS news. The relevant panels on the report page hide gracefully.
                        </LimitLi>
                        <LimitLi>
                            <strong>No intraday.</strong> Daily candles only. This is a swing / position tool,
                            not day trading. Verdicts don't re-run automatically — you click Re-analyze to refresh.
                        </LimitLi>
                        <LimitLi>
                            <strong>Claude is not infallible.</strong> LLM reasoning can still miss context, especially
                            around sector-specific regulatory events or macro shifts that happen faster than news feeds
                            catch up. Always use Neulab alongside your own judgment, not instead of it.
                        </LimitLi>
                        <LimitLi>
                            <strong>Not financial advice.</strong> The platform is educational and informational.
                            Trade at your own risk, size positions responsibly, never deploy capital you can't
                            afford to lose.
                        </LimitLi>
                    </ul>
                </div>

                {/* Stack footer */}
                <SectionHeader
                    icon={BookOpen}
                    overline="Stack"
                    title="The full technical stack."
                    subtitle="For the curious — what ships in production."
                />

                <div className="mt-6 module p-6 md:p-8 font-mono text-xs leading-relaxed" data-testid="tech-stack">
                    <pre
                        className="whitespace-pre-wrap"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >{`Frontend         React 18 + TailwindCSS + shadcn/ui · Recharts for price charts
Backend          FastAPI (Python 3.11) · Uvicorn · async httpx for outbound I/O
Database         MongoDB (Motor async driver)
Auth             JWT (email/password) + Emergent Google OAuth
LLM              Anthropic Claude Sonnet 4.5 via Emergent LLM key
Market data      yfinance (public) + Finnhub.io (REST)
IDX news         CNBC Indonesia + Detik Finance RSS scraper
PDF              ReportLab (server-side, zero client dependencies)
Payments         PayPal REST v1 (Subscriptions) + v2 (Orders for Day Pass)
Email            Resend (receipts, password reset)
Alerts           Telegram Bot API (@neulab_bot)
Hosting          Kubernetes container on Emergent · Supervisord-managed services
Observability    Structured logs to /var/log/supervisor · per-request correlation IDs`}
                    </pre>
                </div>

                <p
                    className="text-overline mt-10 max-w-3xl leading-relaxed"
                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.62rem" }}
                >
                    <ShieldCheck size={10} className="inline mr-1" strokeWidth={1.5} />
                    Last updated April 2026. This page is versioned with the product — any future switch to
                    trained ML (e.g., FinBERT for sentiment) will be disclosed here with a dated changelog entry.
                </p>
            </div>
        </AppShell>
    );
}

/* ---------- Building blocks ---------- */

function SectionHeader({ icon: Icon, overline, title, subtitle }) {
    return (
        <div className="mt-16">
            <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                <Icon size={12} className="inline mr-2" strokeWidth={1.5} />
                {overline}
            </p>
            <h2
                className="font-serif mt-3"
                style={{
                    fontSize: "clamp(1.6rem, 3vw, 2.4rem)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.1,
                }}
            >
                {title}
            </h2>
            {subtitle && (
                <p className="mt-3 max-w-2xl text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                    {subtitle}
                </p>
            )}
        </div>
    );
}

function MythLi({ children, positive = false }) {
    return (
        <li className="flex items-start gap-3">
            {positive ? (
                <Check size={13} strokeWidth={1.5} style={{ color: "hsl(var(--buy))", marginTop: 3 }} />
            ) : (
                <X size={13} strokeWidth={1.5} style={{ color: "hsl(var(--sell))", marginTop: 3 }} />
            )}
            <span>{children}</span>
        </li>
    );
}

function StageRow({ n, title, body }) {
    return (
        <li
            className="module grid grid-cols-12 gap-4 p-5 md:p-6 items-start"
            data-testid={`pipeline-stage-${n}`}
        >
            <div className="col-span-12 md:col-span-1">
                <span className="font-mono text-overline" style={{ color: "hsl(var(--hold))", fontSize: "0.7rem" }}>
                    {n}
                </span>
            </div>
            <div className="col-span-12 md:col-span-3">
                <h3 className="font-serif text-lg" style={{ letterSpacing: "-0.005em" }}>
                    {title}
                </h3>
            </div>
            <p className="col-span-12 md:col-span-8 text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                {body}
            </p>
        </li>
    );
}

function FamilyCell({ label, items, last = false }) {
    return (
        <div
            className="p-5"
            style={{
                borderRight: last ? "none" : "1px solid hsl(var(--border-divider))",
                borderBottom: "1px solid hsl(var(--border-divider))",
            }}
        >
            <p className="text-overline mb-3" style={{ fontSize: "0.58rem" }}>{label}</p>
            <ul className="space-y-1.5 text-[12px]" style={{ color: "hsl(var(--text-secondary))" }}>
                {items.map((it, i) => (
                    <li key={i} className="flex items-start gap-2">
                        <span style={{ color: "hsl(var(--hold))" }}>·</span>
                        <span>{it}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ConfidenceBand({ pct, label, color, body }) {
    return (
        <div
            className="grid grid-cols-12 gap-3 py-3"
            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
        >
            <div className="col-span-3 md:col-span-2 font-mono" style={{ color }}>
                {pct}
            </div>
            <div className="col-span-9 md:col-span-2">
                <span className="font-mono text-overline" style={{ color, fontSize: "0.6rem" }}>
                    {label}
                </span>
            </div>
            <div className="col-span-12 md:col-span-8 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                {body}
            </div>
        </div>
    );
}

function FormulaCard({ name, formula, note }) {
    return (
        <div className="module p-5 md:p-6">
            <p className="text-overline" style={{ fontSize: "0.6rem" }}>{name}</p>
            <pre
                className="mt-3 font-mono text-[11px] whitespace-pre-wrap leading-relaxed p-3"
                style={{
                    background: "hsl(var(--surface-elevated))",
                    color: "hsl(var(--text-primary))",
                    border: "1px solid hsl(var(--border-divider))",
                }}
            >
                {formula}
            </pre>
            <p className="text-[12px] mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                {note}
            </p>
        </div>
    );
}

function PatternRow({ name, bias, body }) {
    const color = bias === "bullish" ? "hsl(var(--buy))" : bias === "bearish" ? "hsl(var(--sell))" : "hsl(var(--hold))";
    return (
        <div className="py-2" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
            <div className="flex items-baseline justify-between gap-2">
                <span style={{ color: "hsl(var(--text-primary))" }}>{name}</span>
                <span className="font-mono text-overline" style={{ color, fontSize: "0.56rem" }}>
                    {bias.toUpperCase()}
                </span>
            </div>
            <p className="text-[12px] mt-1" style={{ color: "hsl(var(--text-muted))" }}>
                {body}
            </p>
        </div>
    );
}

function ModeCard({ name, emphasis, body }) {
    return (
        <div className="module p-6 flex flex-col">
            <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>{name}</p>
            <h3 className="font-serif mt-2" style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
                {emphasis}
            </h3>
            <p className="text-sm mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                {body}
            </p>
        </div>
    );
}

function Th({ children }) {
    return (
        <th
            className="text-left text-overline py-3 px-4"
            style={{
                background: "hsl(var(--surface-elevated))",
                fontSize: "0.56rem",
                borderBottom: "1px solid hsl(var(--border-default))",
            }}
        >
            {children}
        </th>
    );
}

function Tr({ s, src, cov, cache }) {
    return (
        <tr style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
            <td className="py-3 px-4" style={{ color: "hsl(var(--text-primary))" }}>{s}</td>
            <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>{src}</td>
            <td className="py-3 px-4 text-xs" style={{ color: "hsl(var(--text-secondary))" }}>{cov}</td>
            <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>{cache}</td>
        </tr>
    );
}

function FeatureSpec({ title, body }) {
    return (
        <div className="module p-5 md:p-6">
            <p className="text-overline mb-2" style={{ fontSize: "0.6rem" }}>
                <Newspaper size={10} className="inline mr-1" strokeWidth={1.5} />
                {title}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                {body}
            </p>
        </div>
    );
}

function LimitLi({ children }) {
    return (
        <li className="flex items-start gap-3">
            <AlertTriangle
                size={14}
                strokeWidth={1.5}
                style={{ color: "hsl(var(--sell))", marginTop: 3, flexShrink: 0 }}
            />
            <span>{children}</span>
        </li>
    );
}
