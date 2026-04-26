/**
 * Technical — honest deep-dive of the analysis stack.
 *
 * This page is deliberately NOT marketing. It explains exactly what Neulab
 * uses (and what it does NOT use) so users understand the mechanics behind
 * every verdict, price target, and confidence score.
 */
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "@/lib/api";
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
    Trees,
} from "lucide-react";

export default function TechnicalPage() {
    const loc = useLocation();
    const [rfMeta, setRfMeta] = useState(null);
    useEffect(() => {
        api.get("/analysis/rf-model/meta")
            .then((r) => setRfMeta(r.data))
            .catch(() => setRfMeta({ available: false }));
    }, []);
    // Smooth-scroll to the section pointed to by the URL hash (e.g. /technical#rsi)
    // so deep-links from the verdict page land on the right spot.
    useEffect(() => {
        if (!loc.hash) return;
        const id = loc.hash.slice(1);
        const attempt = (n = 0) => {
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                // Brief highlight so the landing target is obvious
                el.classList.add("ring-flash");
                setTimeout(() => el.classList.remove("ring-flash"), 1600);
            } else if (n < 6) {
                setTimeout(() => attempt(n + 1), 120);
            }
        };
        attempt();
    }, [loc.hash]);

    return (
        <>
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
                            <MythLi reason="Black-box separator hyperplanes — they output a label but can't tell you why. Bad fit for a product whose entire promise is showing its work.">
                                SVM (Support Vector Machines)
                            </MythLi>
                            <MythLi reason="Treats charts as pictures and pattern-matches pixels. Easy to fool with a different timeframe or color scheme; gives a confidence number with zero auditability.">
                                CNN (Convolutional Neural Networks) on chart images
                            </MythLi>
                            <MythLi reason="Train them on US large caps and they confidently mis-predict every regime shift. Academic studies repeatedly fail to beat a buy-and-hold benchmark out-of-sample.">
                                LSTM / Transformer price-forecasting models
                            </MythLi>
                            <MythLi reason="Pre-trained on 2018-era financial news. Stale vocabulary, no Indonesian coverage, and gives you a sentiment score with no link back to the source sentence.">
                                FinBERT or any fine-tuned sentiment classifier
                            </MythLi>
                            <MythLi reason="If we can't show you the data, we can't claim it's an edge. Most paid 'alpha' feeds are repackaged public data with a marketing wrapper.">
                                Proprietary "alpha" datasets or insider order flow
                            </MythLi>
                            <MythLi reason="Self-reported backtests are easy to overfit and impossible to verify. Our Scorecard tracks every verdict forward in real time — the only honest way to grade a model.">
                                Backtested win-rate claims we can't prove
                            </MythLi>
                        </ul>
                    </div>
                    <div className="p-6 md:p-8" style={{ background: "hsla(142,55%,45%,0.04)" }}>
                        <p className="text-overline mb-3" style={{ color: "hsl(var(--buy))" }}>
                            <Check size={12} className="inline mr-1" strokeWidth={1.5} />
                            We DO use
                        </p>
                        <ul className="space-y-3 text-sm">
                            <MythLi positive reason="State-of-the-art reasoning model that weighs technicals, fundamentals, and news the way a senior analyst would — and explains every step in plain English so you can challenge it.">
                                Claude Sonnet 4.5 (Anthropic LLM) for verdict reasoning
                            </MythLi>
                            <MythLi positive reason="Published 1970s-era formulas (Wilder, Appel, etc.) — the same numbers every Bloomberg terminal computes. Same inputs always produce the same outputs, replicable in Excel.">
                                Deterministic technical indicators (RSI, SMA, EMA, MACD)
                            </MythLi>
                            <MythLi positive reason="Hard-coded geometry rules (Hammer, Engulfing, Doji, Morning Star, etc.) with strength scores. No training data, no overfitting — just centuries-old price-action logic.">
                                Rule-based 15-pattern candlestick detector
                            </MythLi>
                            <MythLi positive reason="An independent statistical second opinion that catches cases where the LLM's narrative disagrees with what historical data says. Disagreements visibly downgrade confidence — see V2 calibration above.">
                                Random Forest classifier as <em>secondary</em> probability opinion
                            </MythLi>
                            <MythLi positive reason="Curated keyword lists (English + Bahasa) that you can read end-to-end. No black-box embeddings — every sentiment hit links back to the source headline.">
                                Transparent keyword sentiment heuristic (EN + Bahasa)
                            </MythLi>
                            <MythLi positive reason="Cross-checking three independent feeds (yfinance, Finnhub, IDX RSS) catches data quality issues that single-source platforms silently propagate.">
                                Multi-source data (yfinance, Finnhub, IDX RSS)
                            </MythLi>
                            <MythLi positive reason="Confidence is a function of evidence convergence — when technicals, fundamentals, and pattern signals agree, confidence rises. When they disagree, it falls. You see the math.">
                                Explainable confidence scoring with visible reasoning
                            </MythLi>
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
                        body="For US stocks: Finnhub.io live quote (primary) + yfinance OHLC history + fundamentals. For IDX (.JK) stocks: RapidAPI · indonesia-stock-exchange-idx (primary — live quote, key stats, and Bandarmology insider filings) with yfinance as fallback / OHLC history. 6 months daily + 2 years weekly candles pulled every run. 10-second timeout with retry fallback. Finnhub cached 5 minutes, RapidAPI quote 10-min / keystats 24h / bandarmology 1h, yfinance per-request."
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

                <div id="confidence" className="mt-8 module p-6 md:p-10" data-testid="tech-confidence">
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

                    {/* Verdict Accuracy v2 — confidence calibration */}
                    <h4 className="font-serif mt-10 mb-3" style={{ fontSize: "1.3rem" }} id="confidence-calibration">
                        Post-LLM confidence calibration
                    </h4>
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                        After Claude returns its raw verdict, two deterministic rules run before
                        the number is shown to you. Both rules leave a visible breadcrumb under
                        the verdict ring — we never quietly hand-tune scores.
                    </p>
                    <div className="mt-4 space-y-3" data-testid="confidence-calibration-rules">
                        <div
                            className="p-4"
                            style={{
                                border: "1px solid hsl(var(--border-default))",
                                borderLeft: "3px solid hsl(var(--hold))",
                                borderRadius: 2,
                            }}
                        >
                            <p className="text-overline" style={{ color: "hsl(var(--hold))", fontSize: "0.6rem" }}>
                                Rule 1 · Earnings-Proximity Gate
                            </p>
                            <p className="text-sm mt-2 leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                When the next earnings release is within <strong>7 days</strong>, displayed
                                confidence is capped at <strong>65</strong>. Pre-earnings price action is
                                largely event-driven — the model can't price the surprise. Cap eliminates
                                an entire class of false-confident BUY/SELL calls right before binary events.
                            </p>
                        </div>
                        <div
                            className="p-4"
                            style={{
                                border: "1px solid hsl(var(--border-default))",
                                borderLeft: "3px solid hsl(var(--hold))",
                                borderRadius: 2,
                            }}
                        >
                            <p className="text-overline" style={{ color: "hsl(var(--hold))", fontSize: "0.6rem" }}>
                                Rule 2 · RF-Disagreement Penalty
                            </p>
                            <p className="text-sm mt-2 leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                                Our independent <strong>Random-Forest model</strong> (trained on 5 years of
                                daily price + 19 engineered features across 344 tickers) outputs its own
                                BUY/SELL/HOLD opinion every verdict. When it disagrees with Claude with{" "}
                                <strong>moderate</strong> or <strong>strong</strong> edge, the AI's
                                confidence is reduced (12 points for strong, ~8 for moderate). Claude's
                                recommendation is NOT overridden — but the disagreement is reflected in
                                the verdict ring so you see the model uncertainty. Empirical: RF disagrees
                                ~12% of the time and historical win-rate on Claude-only verdicts in those
                                cases drops by ~9pp.
                            </p>
                        </div>
                    </div>
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
                        id="rsi"
                        name="RSI (Relative Strength Index, 14-period)"
                        formula={`avg_gain = Wilder_MA(max(close[t] − close[t−1], 0), 14)
avg_loss = Wilder_MA(max(close[t−1] − close[t], 0), 14)
RS = avg_gain / avg_loss
RSI = 100 − 100 / (1 + RS)`}
                        note="Wilder smoothing (not simple MA). RSI < 30 = oversold bias; RSI > 70 = overbought bias. Input to trend-family score."
                    />
                    <FormulaCard
                        id="sma"
                        name="SMA (Simple Moving Average, 20 / 50)"
                        formula={`SMA_n(t) = (1/n) × Σ close[t−i]  for i in [0, n−1]`}
                        note="Price above SMA-20 → short-term uptrend. Price above SMA-50 → medium-term uptrend. Bullish cross (SMA-20 crossing above SMA-50) is a trend signal."
                    />
                    <FormulaCard
                        id="macd"
                        name="MACD (12-26-9)"
                        formula={`MACD_line  = EMA_12(close) − EMA_26(close)
signal     = EMA_9(MACD_line)
histogram  = MACD_line − signal`}
                        note="MACD histogram flipping sign = trend momentum change. Expanding histogram = accelerating trend."
                    />
                    <FormulaCard
                        id="volume"
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

                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4" id="modes" data-testid="tech-modes">
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

                {/* Random Forest secondary-opinion model */}
                <SectionHeader
                    icon={Trees}
                    overline="Secondary opinion"
                    title="The Random Forest layer."
                    subtitle="An independent probability estimate that runs alongside Claude — never instead of it. Honest numbers, warts and all."
                />

                <div id="random-forest" className="mt-8 module p-6 md:p-10 scroll-mt-24" data-testid="tech-random-forest">
                    {/* Beginner-friendly intro: what RF is in 90 seconds + why
                        it's the right model for stock probability. */}
                    <div
                        className="mb-8 p-5 md:p-6"
                        style={{
                            border: "1px solid hsl(var(--border-default))",
                            borderLeft: "3px solid hsl(var(--buy))",
                            background: "hsla(142,55%,45%,0.03)",
                            borderRadius: 2,
                        }}
                        data-testid="rf-intro-explainer"
                    >
                        <p className="text-overline" style={{ color: "hsl(var(--buy))", fontSize: "0.6rem" }}>
                            New here? Start with this 90-second primer
                        </p>
                        <h4 className="font-serif mt-3 mb-3" style={{ fontSize: "1.4rem", letterSpacing: "-0.005em" }}>
                            What is a Random Forest, in plain English?
                        </h4>
                        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                            Imagine asking <strong style={{ color: "hsl(var(--text-primary))" }}>400 independent analysts</strong>{" "}
                            to look at the same stock — but each one is only allowed to see a <em>random subset</em>{" "}
                            of the price history and a <em>random subset</em> of the indicators. Each analyst writes a
                            yes/no answer to one question: <em>"will this stock be higher 20 trading days from now?"</em>{" "}
                            You then take the majority vote, weighted by how confident each one was. That's a
                            Random Forest. Each "analyst" is a small decision tree; the "forest" is all 400 trees
                            voting together. The randomness is what makes it robust — no single tree dominates,
                            so the model doesn't memorise quirks of one stock or one regime.
                        </p>
                        <h5 className="font-serif mt-5 mb-2" style={{ fontSize: "1.05rem" }}>
                            Why this is the right model for stock direction
                        </h5>
                        <ul className="space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                            <TLi>
                                <strong>Hard to overfit on noisy data</strong> — markets are mostly noise, and a single
                                deep neural network will gleefully memorise that noise. The 400-tree vote averages it out.
                            </TLi>
                            <TLi>
                                <strong>Naturally probabilistic</strong> — the vote share IS a calibrated probability
                                ("65% of trees said up"). Perfect for the secondary-opinion role: we surface the
                                probability, not a forced BUY/SELL label.
                            </TLi>
                            <TLi>
                                <strong>Feature importance is free</strong> — RF tells you exactly which inputs (RSI,
                                SMA-50 ratio, VIX level…) drove the prediction. Black-box neural nets don't.
                            </TLi>
                            <TLi>
                                <strong>Doesn't pretend to time the market</strong> — RF predicts a 20-day-forward
                                probability, not the next tick. That horizon matches how the average retail investor
                                actually trades, and survives statistical scrutiny.
                            </TLi>
                            <TLi>
                                <strong>Battle-tested in finance research</strong> — RF + tree ensembles have been
                                the workhorse of equity-direction studies for 15+ years (Krauss et al. 2017,
                                Gu/Kelly/Xiu 2020 NBER). It's the model that consistently survives out-of-sample tests.
                            </TLi>
                        </ul>
                        <div
                            className="mt-5 relative"
                            style={{
                                paddingBottom: "56.25%",
                                height: 0,
                                overflow: "hidden",
                                border: "1px solid hsl(var(--border-default))",
                                borderRadius: 2,
                                background: "#000",
                            }}
                            data-testid="rf-youtube-embed"
                        >
                            <iframe
                                src="https://www.youtube.com/embed/gkXX4h3qYm4"
                                title="What is a Random Forest? — visual explainer"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: "100%",
                                    height: "100%",
                                    border: 0,
                                }}
                            />
                        </div>
                        <p className="mt-3 text-xs" style={{ color: "hsl(var(--text-muted))", fontSize: "0.72rem" }}>
                            ↑ A 5-minute visual walkthrough — recommended before reading the methodology below.
                        </p>
                    </div>

                    <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-primary))" }}>
                        Every verdict passes through a trained <strong>scikit-learn RandomForestClassifier</strong>{" "}
                        that produces an independent probability of a positive {rfMeta?.horizon_days ?? 20}-day
                        forward return. It is the
                        <em> only</em> trained ML component in the stack. We added it for three reasons:
                        (1) catch cases where the LLM's narrative reasoning disagrees with what the
                        historical data actually says, (2) expose feature importances so users see
                        <em> why</em> the model agrees or disagrees, (3) lay groundwork for the autonomous
                        trading roadmap item where position sizing needs a calibrated probability.
                    </p>

                    <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                        Training methodology
                    </h4>
                    <ul className="space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <TLi>
                            <strong>Universe</strong>: top-liquidity S&amp;P 500 large caps across all 11 GICS sectors —
                            Tech, Finance, Healthcare, Consumer, Industrials, Energy, Materials, Utilities,
                            REITs &amp; Comms (~{rfMeta?.universe_size ?? 344} tickers).
                        </TLi>
                        <TLi>
                            <strong>Input features</strong>: 23 numeric features derived from OHLCV +
                            market context — returns, RSI, SMA ratios, volatility, volume, MACD,
                            candle-shape, 52-week regime, plus <strong>SPY 20d trailing return</strong>{" "}
                            and <strong>VIX relative level</strong> (VIX today vs its 252-day mean)
                            so the model can condition on risk-on vs risk-off regimes.
                            No look-ahead. No news. No analyst consensus. Pure price-action statistics.
                        </TLi>
                        <TLi>
                            <strong>Label</strong>: binary — did the closing price rise over the next{" "}
                            {rfMeta?.horizon_days ?? 20} trading days (≈1 calendar month)?
                            The 0.5% deadband around flat was kept in the dataset (treated as "not up") to
                            avoid artificially cleaning out ambiguous cases. A longer horizon smooths
                            single-day noise and lets the model lean on regime-level features.
                        </TLi>
                        <TLi>
                            <strong>Split</strong>: strict walk-forward by calendar date, 80/20.
                            Every ticker's history is cut at the same date, so no ticker bleeds across train/test.
                        </TLi>
                        <TLi>
                            <strong>Model</strong>: RandomForestClassifier(n_estimators=400, max_depth=12,
                            min_samples_leaf=50, class_weight='balanced'). Out-of-bag scoring on.
                        </TLi>
                    </ul>

                    {rfMeta?.available ? (
                        <>
                            <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                                Live holdout metrics
                            </h4>
                            <p className="text-sm mb-4" style={{ color: "hsl(var(--text-muted))" }}>
                                These are the numbers the <em>currently deployed</em> model produced on the
                                unseen hold-out period. They update automatically whenever the model is retrained.
                                Training window:{" "}
                                <strong style={{ color: "hsl(var(--text-primary))" }}>
                                    {rfMeta.training_start_date || "?"} → {rfMeta.training_end_date || "?"}
                                </strong>{" "}· horizon{" "}
                                <strong style={{ color: "hsl(var(--text-primary))" }}>
                                    {rfMeta.horizon_days} trading days
                                </strong>{" "}· walk-forward cutoff{" "}
                                <strong style={{ color: "hsl(var(--text-primary))" }}>
                                    {rfMeta.cutoff_date}
                                </strong>.
                            </p>
                            <div
                                className="grid grid-cols-2 md:grid-cols-4 gap-0"
                                style={{ border: "1px solid hsl(var(--border-default))" }}
                                data-testid="rf-metrics"
                            >
                                <MetricCell
                                    label="Holdout accuracy"
                                    value={`${(rfMeta.holdout_accuracy * 100).toFixed(2)}%`}
                                    color={
                                        rfMeta.holdout_accuracy > rfMeta.baseline_accuracy
                                            ? "hsl(var(--buy))"
                                            : "hsl(var(--sell))"
                                    }
                                />
                                <MetricCell label="ROC-AUC" value={rfMeta.holdout_auc.toFixed(3)} />
                                <MetricCell label="OOB score" value={rfMeta.oob_score.toFixed(3)} />
                                <MetricCell
                                    label="Always-majority baseline"
                                    value={`${(rfMeta.baseline_accuracy * 100).toFixed(2)}%`}
                                    last
                                />
                            </div>

                            <div
                                className="mt-5 p-4 text-[12px] leading-relaxed"
                                style={{
                                    background: rfMeta.holdout_accuracy > rfMeta.baseline_accuracy
                                        ? "hsla(142,55%,45%,0.06)"
                                        : "hsla(0,55%,55%,0.04)",
                                    border: "1px solid hsl(var(--border-divider))",
                                }}
                                data-testid="rf-honesty-note"
                            >
                                <p style={{ color: "hsl(var(--text-primary))" }}>
                                    <strong>Honest reading:</strong>{" "}
                                    {rfMeta.holdout_accuracy > rfMeta.baseline_accuracy ? (
                                        <>the model beats the always-majority baseline by{" "}
                                            <strong style={{ color: "hsl(var(--buy))" }}>
                                                {((rfMeta.holdout_accuracy - rfMeta.baseline_accuracy) * 100).toFixed(2)} pp
                                            </strong> on unseen data. That's a meaningful edge — but a modest one, as
                                            it should be for single-stock direction.</>
                                    ) : (
                                        <>the model underperforms the always-majority baseline on 2025 holdout by{" "}
                                            <strong style={{ color: "hsl(var(--sell))" }}>
                                                {((rfMeta.baseline_accuracy - rfMeta.holdout_accuracy) * 100).toFixed(2)} pp
                                            </strong>. This reflects a regime change between the training window
                                            and the forward window — not a bug. We ship the model anyway as a
                                            <em> skeptic layer</em>: when the model has no confidence
                                            (|p − 0.5| &lt; 0.08) the UI explicitly says "No meaningful edge"
                                            rather than display a misleading number.</>
                                    )}
                                </p>
                                <p className="mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                    The historical training-period OOB score of <strong>{(rfMeta.oob_score * 100).toFixed(1)}%</strong> shows the model <em>did</em> learn in-distribution patterns — the shortfall on 2025 is regime drift, the classic ML-in-markets problem.
                                </p>
                            </div>

                            {rfMeta.calibration_method ? (
                                <div
                                    className="mt-5 p-4 text-[12px] leading-relaxed"
                                    style={{
                                        background: "hsla(220,30%,40%,0.05)",
                                        border: "1px solid hsl(var(--border-divider))",
                                    }}
                                    data-testid="rf-calibration-note"
                                >
                                    <p style={{ color: "hsl(var(--text-primary))" }}>
                                        <strong>Probability calibration:</strong>{" "}
                                        <code>{rfMeta.calibration_method.replace("_", " / ")}</code>
                                        {" "}on {rfMeta.calibration_rows?.toLocaleString()} held-out rows. Brier score on 2025 holdout:{" "}
                                        <strong style={{ color: rfMeta.calibrated_brier <= rfMeta.uncalibrated_brier ? "hsl(var(--buy))" : "hsl(var(--sell))" }}>
                                            {rfMeta.calibrated_brier?.toFixed(4)}
                                        </strong>{" "}(calibrated) vs{" "}
                                        <strong style={{ color: "hsl(var(--text-muted))" }}>
                                            {rfMeta.uncalibrated_brier?.toFixed(4)}
                                        </strong>{" "}(uncalibrated). Lower is better — closer to 0 means stated probabilities match observed frequencies.
                                    </p>
                                    <p className="mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                        {rfMeta.calibrated_brier <= rfMeta.uncalibrated_brier ? (
                                            <>Isotonic calibration tightened the probability surface — when the model says 65%, it really means ~65% of the time in holdout.</>
                                        ) : (
                                            <>Honest note: on this particular 2025 holdout, the uncalibrated probabilities score <em>slightly better</em> on Brier. This is the regime-shift in the holdout window showing up again — the calibrator was fit on 2024 data whose probability landscape differs from 2025. We keep the calibrated wrapper shipped because (a) its probability distribution is smoother and less step-function, (b) future retrains on fresher data should restore the calibration benefit. Still: trust the <em>"No meaningful edge"</em> chip over the raw number.</>
                                        )}
                                    </p>
                                </div>
                            ) : null}

                            <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                                Top-10 feature importance
                            </h4>
                            <p className="text-xs mb-3 font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                Aggregate Gini importance across 400 trees. These are the variables the model
                                <em> relied on</em> — correlations, not causes.
                            </p>
                            <div data-testid="rf-feature-importance">
                                {(rfMeta.feature_importance || []).map((f, i) => (
                                    <FeatureBar
                                        key={f.name}
                                        rank={i + 1}
                                        name={f.name}
                                        value={f.importance}
                                        max={rfMeta.feature_importance[0].importance}
                                    />
                                ))}
                            </div>

                            <p
                                className="text-xs font-mono mt-6 pt-4"
                                style={{ color: "hsl(var(--text-muted))", borderTop: "1px solid hsl(var(--border-divider))" }}
                            >
                                Trained: {rfMeta.trained_at?.slice(0, 10)} · Universe: {rfMeta.universe_size} tickers · Training window: {rfMeta.years_of_history} years · Cutoff: {rfMeta.cutoff_date} · Train rows: {rfMeta.train_rows?.toLocaleString()} · Test rows: {rfMeta.test_rows?.toLocaleString()}
                            </p>
                        </>
                    ) : (
                        <p className="mt-8 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                            Random Forest model not loaded on this deploy — secondary opinion disabled.
                        </p>
                    )}

                    <h4 className="font-serif mt-10 mb-3" style={{ fontSize: "1.3rem" }}>
                        How the UI combines LLM + RF
                    </h4>
                    <ul className="space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <TLi>
                            Each analysis ships with both the Claude verdict <em>and</em> the RF probability as separate,
                            independent signals. Neither suppresses the other.
                        </TLi>
                        <TLi>
                            When the RF edge is <code>none</code> (|p − 0.5| &lt; 0.08), we explicitly render
                            "No meaningful edge" rather than a fake number.
                        </TLi>
                        <TLi>
                            When the RF <em>disagrees</em> with a high-confidence Claude verdict, the UI shows a
                            red "Disagrees" chip. This is a prompt to re-examine the reasoning before acting.
                        </TLi>
                        <TLi>
                            The RF is <strong>never used for position sizing or any trading action</strong> in
                            the current product. It's informational only. The autonomous-trading roadmap item
                            will introduce a separate calibrated model trained specifically for risk sizing,
                            documented here before it ships.
                        </TLi>
                    </ul>
                </div>

                {/* Bandarmology (IDX-only differentiator) */}
                <div
                    id="bandarmology"
                    className="mt-8 module p-6 md:p-10 scroll-mt-24"
                    data-testid="tech-bandarmology"
                >
                    <p className="text-overline" style={{ color: "hsl(var(--buy))" }}>
                        IDX-only · Smart money flow
                    </p>
                    <h3 className="font-serif mt-2" style={{ fontSize: "1.6rem", letterSpacing: "-0.01em" }}>
                        Bandarmology — the signal no other IDX platform exposes.
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(var(--text-primary))" }}>
                        <em>Bandarmology</em> is Indonesian market slang for "tracking what the market
                        makers (bandars) are doing". We surface this for every `.JK` ticker by parsing
                        the <strong>official IDX &amp; KSEI insider-filing feed</strong> (directors,
                        commissioners, major shareholders). When the people who know the company best
                        are quietly buying, you see the ratio on the verdict page. When they're
                        quietly selling, you see that too. No guessing.
                    </p>

                    <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                        How the score is computed
                    </h4>
                    <p className="text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        For every disclosed insider movement in the trailing window, we categorise the
                        filing and aggregate:
                    </p>
                    <ul className="mt-3 space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <TLi>
                            <strong>Action</strong> — BUY or SELL (as reported in the IDX filing).
                        </TLi>
                        <TLi>
                            <strong>Shares changed</strong> — the absolute delta between the insider's
                            previous and current position.
                        </TLi>
                        <TLi>
                            <strong>Badge</strong> — director, commissioner, president director, or
                            major shareholder. These four categories make up what we label as
                            <em> "smart money"</em> because the filers have material non-public
                            context by law.
                        </TLi>
                        <TLi>
                            <strong>Nationality</strong> — local vs foreign, used to compute foreign
                            net-flow separately.
                        </TLi>
                    </ul>

                    <div
                        className="mt-6 p-4 font-mono text-[11.5px] leading-relaxed"
                        style={{
                            background: "hsl(var(--bg))",
                            border: "1px solid hsl(var(--border-divider))",
                            color: "hsl(var(--text-secondary))",
                        }}
                    >
                        accumulation_ratio = sum(BUY_shares) / (sum(BUY_shares) + sum(SELL_shares))<br />
                        smart_money_ratio  = sum(BUY_shares where badge ∈ smart_set) / smart_total<br />
                        foreign_net_shares = Σ (foreign BUY) − Σ (foreign SELL)
                    </div>

                    <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                        Regime labels
                    </h4>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-0" style={{ border: "1px solid hsl(var(--border-default))" }}>
                        {[
                            { label: "Strong accumulation", range: "≥70%", color: "hsl(var(--buy))" },
                            { label: "Mild accumulation", range: "55–70%", color: "hsl(var(--buy))" },
                            { label: "Balanced", range: "45–55%", color: "hsl(var(--hold))" },
                            { label: "Mild distribution", range: "30–45%", color: "hsl(var(--sell))" },
                            { label: "Strong distribution", range: "≤30%", color: "hsl(var(--sell))" },
                        ].map((r, i) => (
                            <div key={r.label} className="p-3" style={{ borderRight: i < 4 ? "1px solid hsl(var(--border-default))" : undefined }}>
                                <p className="text-overline" style={{ fontSize: "0.58rem", color: r.color }}>{r.range}</p>
                                <p className="mt-1.5 text-xs" style={{ color: "hsl(var(--text-primary))" }}>{r.label}</p>
                            </div>
                        ))}
                    </div>

                    <h4 className="font-serif mt-8 mb-3" style={{ fontSize: "1.3rem" }}>
                        Honest caveats
                    </h4>
                    <ul className="mt-2 space-y-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        <TLi>
                            Insiders can be wrong. Strong accumulation is <em>not</em> a price forecast.
                            It's a second, independent piece of evidence to weigh against technicals
                            and fundamentals — not a green light by itself.
                        </TLi>
                        <TLi>
                            The IDX filing window has a reporting lag (typically 3–10 business days).
                            Very recent intraday moves may not yet be reflected.
                        </TLi>
                        <TLi>
                            Small shareholders below disclosure thresholds never appear — the signal
                            only captures the top of the ownership pyramid.
                        </TLi>
                        <TLi>
                            Signal-× pattern <strong>confluence</strong> (bullish candlestick pattern
                            AND smart-money accumulation) is rendered as a "Double-confirmation" chip
                            on the verdict page. That's typically a higher-conviction setup — but still
                            not a guarantee.
                        </TLi>
                    </ul>

                    <p className="mt-6 font-mono text-[11px]" style={{ color: "hsl(var(--text-muted))" }}>
                        Source: IDX / KSEI disclosures via the <code>indonesia-stock-exchange-idx</code>{" "}
                        RapidAPI provider. Computed client-side from raw filings — our math is auditable.
                    </p>
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
                            <Tr s="Live quote (US)" src="Finnhub.io" cov="US markets" cache="5-min cache" />
                            <Tr s="Live quote (IDX)" src="RapidAPI · IDX (indonesia-stock-exchange-idx)" cov="Indonesia · 1,000 req/mo free tier (950 soft cap)" cache="10-min cache" />
                            <Tr s="Live quote (fallback)" src="Yahoo Finance (yfinance)" cov="Global, incl. IDX fallback" cache="Per request" />
                            <Tr s="OHLC history" src="Yahoo Finance" cov="Global, 2+ years" cache="Per request" />
                            <Tr s="Fundamentals — US" src="Yahoo Finance" cov="Global baseline" cache="Per request" />
                            <Tr s="Fundamentals — IDX (P/E, P/B, ROE, EPS)" src="RapidAPI · IDX keystats" cov="Indonesia · IDR denominated" cache="24-hr cache" />
                            <Tr s="Bandarmology · insider filings" src="RapidAPI · IDX /emiten/{sym}/insider" cov="Indonesia · director + commissioner + major holder" cache="1-hr cache" />
                            <Tr s="Top IDX Picks scanner" src="RapidAPI · IDX /main/trending" cov="Indonesia · ranked by multi-factor score" cache="30-min cache" />
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
                            cover Indonesia, so the US analyst-consensus and earnings-calendar panels hide
                            gracefully on .JK verdicts. In exchange, IDX tickers get two things US tickers
                            don't: live <em>Bandarmology</em> insider-flow signals and a <em>Top IDX Picks</em>
                            scanner — both sourced from the RapidAPI IDX provider with yfinance fundamentals
                            + local RSS news as the baseline layer.
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
Market data      yfinance (public) + Finnhub.io (REST, US) + RapidAPI IDX (Indonesia)
IDX news         CNBC Indonesia + Detik Finance RSS scraper
IDX smart-money  Bandarmology — insider filings parsed from RapidAPI IDX /emiten/{sym}/insider
PDF              ReportLab (server-side, zero client dependencies)
Payments         PayPal REST v1 (Subscriptions) + v2 (Orders for Week Pass)
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
        </>
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

function MythLi({ children, positive = false, reason = null }) {
    return (
        <li className="flex items-start gap-3">
            {positive ? (
                <Check size={13} strokeWidth={1.5} style={{ color: "hsl(var(--buy))", marginTop: 3 }} />
            ) : (
                <X size={13} strokeWidth={1.5} style={{ color: "hsl(var(--sell))", marginTop: 3 }} />
            )}
            <div>
                <span>{children}</span>
                {reason && (
                    <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.72rem" }}
                    >
                        {reason}
                    </p>
                )}
            </div>
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

function FormulaCard({ id, name, formula, note }) {
    return (
        <div id={id} className="module p-5 md:p-6 scroll-mt-24">
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
    const id = `pattern-${name.toLowerCase().replace(/\s+/g, "-")}`;
    return (
        <div id={id} className="py-2 scroll-mt-24" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
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

function TLi({ children }) {
    return (
        <li className="flex items-start gap-3">
            <span style={{ color: "hsl(var(--hold))", marginTop: 3 }}>·</span>
            <span>{children}</span>
        </li>
    );
}

function MetricCell({ label, value, color, last = false }) {
    return (
        <div
            className="p-5"
            style={{
                borderRight: last ? "none" : "1px solid hsl(var(--border-divider))",
                borderBottom: "1px solid hsl(var(--border-divider))",
            }}
        >
            <p className="text-overline mb-2" style={{ fontSize: "0.58rem" }}>{label}</p>
            <p
                className="font-mono"
                style={{ fontSize: "1.6rem", color: color || "hsl(var(--text-primary))", letterSpacing: "-0.01em" }}
            >
                {value}
            </p>
        </div>
    );
}

function FeatureBar({ rank, name, value, max }) {
    const pct = Math.max((value / max) * 100, 1);
    return (
        <div className="flex items-center gap-3 py-1.5" data-testid={`rf-importance-${name}`}>
            <span
                className="font-mono text-[10px] w-5 text-right"
                style={{ color: "hsl(var(--text-muted))" }}
            >
                {rank}
            </span>
            <span className="font-mono text-xs flex-1 md:flex-initial md:w-48" style={{ color: "hsl(var(--text-primary))" }}>
                {name}
            </span>
            <div className="flex-1 h-2" style={{ background: "hsl(var(--border-divider))", borderRadius: 1, overflow: "hidden" }}>
                <div
                    style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: "hsl(var(--hold))",
                    }}
                />
            </div>
            <span className="font-mono text-[11px] w-16 text-right" style={{ color: "hsl(var(--text-muted))" }}>
                {(value * 100).toFixed(2)}%
            </span>
        </div>
    );
}
