import React from "react";
import { Newspaper, Users, CalendarClock, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { timeAgo } from "@/lib/format";

/**
 * Renders 3 Finnhub-sourced modules on the Analysis Report page:
 *  - Recent Headlines
 *  - Wall Street Consensus (analyst recommendation mix)
 *  - Next Earnings
 *
 * Expects the `market_context` object from /api/analysis/{ticker}:
 *   { configured, news: {articles, summary_sentiment, score},
 *     analyst_consensus: {strong_buy, buy, hold, sell, strong_sell, total,
 *                         score, recommendation_label, period},
 *     earnings: {date, days_until, hour, quarter, year, eps_estimate, revenue_estimate} }
 */
export default function MarketContextModules({ marketContext }) {
    if (!marketContext || marketContext.configured !== true) return null;
    const { news, analyst_consensus: consensus, earnings } = marketContext;
    // Render nothing if Finnhub returned nothing useful at all
    if (!news?.articles?.length && !consensus && !earnings) return null;

    return (
        <section
            className="grid grid-cols-12 gap-1 md:gap-4 mb-1 md:mb-4"
            data-testid="market-context-modules"
        >
            <HeadlinesModule news={news} />
            <ConsensusModule consensus={consensus} />
            <EarningsModule earnings={earnings} />
        </section>
    );
}

/* ------------------------------ Headlines ------------------------------- */

const SENTIMENT_STYLES = {
    positive: { color: "hsl(var(--buy))", Icon: TrendingUp, label: "POS" },
    negative: { color: "hsl(var(--sell))", Icon: TrendingDown, label: "NEG" },
    neutral: { color: "hsl(var(--text-muted))", Icon: Minus, label: "NEU" },
};

function HeadlinesModule({ news }) {
    const articles = news?.articles || [];
    if (!articles.length) return null;
    const top = articles.slice(0, 5);
    const overall = news.summary_sentiment || "neutral";
    const score = news.score ?? 0;
    const { color: overallColor } = SENTIMENT_STYLES[overall] || SENTIMENT_STYLES.neutral;

    return (
        <article
            className="module p-6 md:p-8 col-span-12 md:col-span-6"
            data-testid="market-headlines-module"
        >
            <div className="flex items-center justify-between mb-4">
                <p className="text-overline flex items-center gap-2">
                    <Newspaper size={12} strokeWidth={1.5} /> Recent Headlines
                </p>
                <span
                    className="font-mono text-[10px] uppercase tracking-wider"
                    style={{ color: overallColor }}
                    data-testid="headlines-sentiment-summary"
                >
                    {overall} · {score > 0 ? "+" : ""}{score}
                </span>
            </div>
            <h3 className="font-serif text-2xl mb-5" style={{ letterSpacing: "-0.01em" }}>
                Last 7 days on the tape.
            </h3>
            <ol className="space-y-4">
                {top.map((a, i) => {
                    const s = SENTIMENT_STYLES[a.sentiment] || SENTIMENT_STYLES.neutral;
                    const Icon = s.Icon;
                    return (
                        <li
                            key={`hl-${i}-${(a.url || a.headline || "").slice(0, 24)}`}
                            className="flex gap-3 pb-4"
                            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                            data-testid={`headline-item-${i}`}
                        >
                            <div className="flex flex-col items-center gap-1 pt-1" style={{ minWidth: "2.5rem" }}>
                                <Icon size={14} strokeWidth={1.5} style={{ color: s.color }} />
                                <span
                                    className="font-mono text-[9px]"
                                    style={{ color: s.color, letterSpacing: "0.1em" }}
                                >
                                    {s.label}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <a
                                    href={a.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm leading-snug hover:underline inline-flex items-start gap-1"
                                    style={{ color: "hsl(var(--text-primary))" }}
                                >
                                    <span>{a.headline}</span>
                                    <ExternalLink size={10} strokeWidth={1.5} className="mt-1 shrink-0 opacity-60" />
                                </a>
                                <p
                                    className="font-mono text-[10px] mt-1.5"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    {a.source || "—"}{a.published_at ? ` · ${timeAgo(a.published_at)}` : ""}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </article>
    );
}

/* ------------------------------ Consensus ------------------------------- */

const CONSENSUS_COLORS = {
    strong_buy: "hsl(var(--buy))",
    buy: "hsl(142 55% 45%)",
    hold: "hsl(var(--hold))",
    sell: "hsl(0 55% 55%)",
    strong_sell: "hsl(var(--sell))",
};
const CONSENSUS_LABEL_COLOR = {
    BUY: "hsl(var(--buy))",
    OVERWEIGHT: "hsl(var(--buy))",
    HOLD: "hsl(var(--hold))",
    UNDERWEIGHT: "hsl(var(--sell))",
    SELL: "hsl(var(--sell))",
};

function ConsensusModule({ consensus }) {
    if (!consensus || !consensus.total) {
        return (
            <article
                className="module p-6 md:p-8 col-span-12 md:col-span-3"
                data-testid="market-consensus-module-empty"
            >
                <p className="text-overline flex items-center gap-2 mb-3">
                    <Users size={12} strokeWidth={1.5} /> Wall Street
                </p>
                <p className="text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                    No analyst coverage available.
                </p>
            </article>
        );
    }
    const { strong_buy = 0, buy = 0, hold = 0, sell = 0, strong_sell = 0, total, score, recommendation_label, period } = consensus;
    const segments = [
        { key: "strong_buy", label: "Strong Buy", value: strong_buy },
        { key: "buy", label: "Buy", value: buy },
        { key: "hold", label: "Hold", value: hold },
        { key: "sell", label: "Sell", value: sell },
        { key: "strong_sell", label: "Strong Sell", value: strong_sell },
    ];
    const labelColor = CONSENSUS_LABEL_COLOR[recommendation_label] || "hsl(var(--text-primary))";

    return (
        <article
            className="module p-6 md:p-8 col-span-12 md:col-span-3"
            data-testid="market-consensus-module"
        >
            <p className="text-overline flex items-center gap-2 mb-3">
                <Users size={12} strokeWidth={1.5} /> Wall Street
            </p>
            <div
                className="font-serif mb-1"
                style={{ fontSize: "1.8rem", lineHeight: 1.1, color: labelColor, letterSpacing: "-0.01em" }}
                data-testid="consensus-label"
            >
                {recommendation_label}
            </div>
            <p className="font-mono text-[10px] mb-4" style={{ color: "hsl(var(--text-muted))" }}>
                {total} analysts · score {score > 0 ? "+" : ""}{score}
            </p>

            {/* Stacked bar */}
            <div
                className="flex h-3 w-full overflow-hidden mb-4"
                style={{ borderRadius: 2 }}
                data-testid="consensus-bar"
            >
                {segments.map((seg) =>
                    seg.value > 0 ? (
                        <div
                            key={seg.key}
                            style={{
                                width: `${(seg.value / total) * 100}%`,
                                background: CONSENSUS_COLORS[seg.key],
                            }}
                            title={`${seg.label}: ${seg.value}`}
                        />
                    ) : null
                )}
            </div>

            <ul className="space-y-1.5">
                {segments.map((seg) => (
                    <li
                        key={seg.key}
                        className="flex items-center justify-between text-[11px] font-mono"
                        data-testid={`consensus-row-${seg.key}`}
                    >
                        <span className="flex items-center gap-2" style={{ color: "hsl(var(--text-secondary))" }}>
                            <span
                                className="inline-block"
                                style={{ width: 8, height: 8, background: CONSENSUS_COLORS[seg.key], borderRadius: 1 }}
                            />
                            {seg.label}
                        </span>
                        <span style={{ color: "hsl(var(--text-primary))" }}>{seg.value}</span>
                    </li>
                ))}
            </ul>
            {period ? (
                <p className="text-overline mt-4" style={{ fontSize: "0.52rem" }}>
                    Period · {period}
                </p>
            ) : null}
        </article>
    );
}

/* ------------------------------ Earnings ------------------------------- */

const HOUR_LABEL = {
    bmo: "Before market open",
    amc: "After market close",
    dmh: "During market hours",
};

function EarningsModule({ earnings }) {
    if (!earnings || !earnings.date) {
        return (
            <article
                className="module p-6 md:p-8 col-span-12 md:col-span-3"
                data-testid="market-earnings-module-empty"
            >
                <p className="text-overline flex items-center gap-2 mb-3">
                    <CalendarClock size={12} strokeWidth={1.5} /> Next Earnings
                </p>
                <p className="text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                    No upcoming earnings scheduled.
                </p>
            </article>
        );
    }
    const { date, days_until, hour, quarter, year, eps_estimate, revenue_estimate } = earnings;
    let formatted = date;
    try {
        formatted = new Date(date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch (_) { /* keep iso */ }
    const hourLabel = HOUR_LABEL[(hour || "").toLowerCase()];
    const fmtRev = (v) => {
        if (v == null) return "—";
        const abs = Math.abs(v);
        if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
        if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
        return `$${v.toLocaleString()}`;
    };

    return (
        <article
            className="module p-6 md:p-8 col-span-12 md:col-span-3"
            data-testid="market-earnings-module"
        >
            <p className="text-overline flex items-center gap-2 mb-3">
                <CalendarClock size={12} strokeWidth={1.5} /> Next Earnings
            </p>
            <div
                className="font-serif"
                style={{ fontSize: "1.8rem", lineHeight: 1.1, letterSpacing: "-0.01em" }}
                data-testid="earnings-date"
            >
                {formatted}
            </div>
            {days_until != null && (
                <p
                    className="font-mono text-[11px] mt-1"
                    style={{
                        color:
                            days_until <= 7
                                ? "hsl(var(--hold))"
                                : "hsl(var(--text-muted))",
                    }}
                    data-testid="earnings-countdown"
                >
                    {days_until > 0 ? `in ${days_until} day${days_until === 1 ? "" : "s"}` : days_until === 0 ? "today" : `${Math.abs(days_until)}d ago`}
                </p>
            )}
            {hourLabel && (
                <p className="text-[11px] mt-3" style={{ color: "hsl(var(--text-secondary))" }}>
                    {hourLabel}
                </p>
            )}
            <div
                className="mt-4 pt-4 space-y-2"
                style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
            >
                <KV label="Quarter" value={quarter && year ? `Q${quarter} ${year}` : "—"} />
                <KV label="EPS est." value={eps_estimate != null ? `$${Number(eps_estimate).toFixed(2)}` : "—"} />
                <KV label="Rev. est." value={fmtRev(revenue_estimate)} />
            </div>
        </article>
    );
}

function KV({ label, value }) {
    return (
        <div className="flex items-center justify-between text-[11px] font-mono">
            <span style={{ color: "hsl(var(--text-muted))" }}>{label}</span>
            <span style={{ color: "hsl(var(--text-primary))" }}>{value}</span>
        </div>
    );
}
