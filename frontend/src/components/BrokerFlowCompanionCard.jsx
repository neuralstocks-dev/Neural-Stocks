import React from "react";
import { ExternalLink, Info, Radar } from "lucide-react";

/**
 * BrokerFlowCompanionCard — user-facing guidance that acknowledges the
 * limits of what we compute in-house (insider filings, T+5 to T+30 lag)
 * and surfaces external Indonesian broker-summary tools that together
 * with our verdict form a more complete trading picture.
 *
 * Shown on IDX analyses + referenced from the Technical page's broker-flow
 * methodology section. Educational framing only — these are third-party
 * tools, we make no endorsement beyond signposting.
 */

const TOOLS = [
    {
        name: "Stockbit",
        url: "https://stockbit.com",
        category: "Retail platform",
        highlight: "Best-in-class broker summary + community cashflow view",
        details: "Daily broker summary (netval/bval/sval/bavg/savg), foreign vs domestic split via NG broker tag, rolling accumulation distribution tracker.",
    },
    {
        name: "RTI Business",
        url: "https://www.rti.co.id",
        category: "Pro terminal",
        highlight: "Industry-standard intraday broker flow",
        details: "Real-time broker summary by ticker, intraday crossing flags, Top N broker concentration. Used by most Indonesian day-traders & analysts.",
    },
    {
        name: "IPOT (IndoPremier)",
        url: "https://www.indopremier.com",
        category: "Broker app (free w/ account)",
        highlight: "Foreign vs domestic net flow + bandar flow",
        details: "Built-in bandarmology-style visualisations for each ticker. Free when you hold an active brokerage account — open online in ~15 minutes.",
    },
    {
        name: "Ajaib",
        url: "https://ajaib.co.id",
        category: "Mobile-first broker app",
        highlight: "Simplified broker summary + smart-money chip",
        details: "Mobile-native, curated for newer investors. Shows top-5 broker net-buy/net-sell per ticker in the Analysis tab.",
    },
    {
        name: "Mirae HOTS",
        url: "https://miraeasset.co.id",
        category: "Pro terminal (desktop)",
        highlight: "Order-flow level detail",
        details: "Broker summary + queue depth + order-book streaming. Steep learning curve, but the richest intraday flow data available to retail.",
    },
    {
        name: "Phillip POEMS",
        url: "https://www.poems.co.id",
        category: "Pro terminal (desktop)",
        highlight: "Institutional-grade broker analytics",
        details: "Broker summary with custom date ranges (1d / 5d / 20d rolling), top-broker concentration %, foreign/domestic split.",
    },
    {
        name: "Bions (BNI Sekuritas)",
        url: "https://www.bions.id",
        category: "Broker app",
        highlight: "Broker summary + foreign net breakdown",
        details: "Mobile + web. Daily broker ranking, net-buy/net-sell per broker code, foreign vs domestic split.",
    },
    {
        name: "IDN Financials",
        url: "https://www.idnfinancials.com",
        category: "Data service (paid)",
        highlight: "Historical broker-summary exports",
        details: "CSV export of broker summary by ticker and date range — useful for backtesting. Subscription required.",
    },
];

export default function BrokerFlowCompanionCard() {
    return (
        <section
            className="module p-6 md:p-8 mb-1 md:mb-4"
            data-testid="broker-flow-companion-card"
            style={{ background: "hsl(var(--surface))" }}
            id="broker-flow-companion"
        >
            <div className="flex items-start gap-2 mb-4">
                <Radar size={14} strokeWidth={1.5} className="mt-1 shrink-0" style={{ color: "hsl(var(--hold))" }} />
                <div>
                    <p className="text-overline">Companion tools · IDX broker-summary</p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.02em" }}>
                        Where to check real-time broker flow
                    </h2>
                </div>
            </div>

            <div
                className="mb-5 p-3 font-mono text-[11px] leading-relaxed"
                style={{
                    background: "hsl(var(--bg) / 0.5)",
                    border: "1px dashed hsl(var(--border-divider))",
                    color: "hsl(var(--text-secondary))",
                }}
                data-testid="broker-flow-why-it-matters"
            >
                <p className="mb-2" style={{ color: "hsl(var(--text-primary))" }}>
                    <Info size={11} strokeWidth={1.5} className="inline mr-1" />
                    <strong>Why this matters.</strong>
                </p>
                <p style={{ lineHeight: 1.7 }}>
                    The bandarmology block above is computed from <strong>IDX/KSEI insider filings</strong> —
                    regulatory disclosures from directors, commissioners, and major shareholders.
                    Those filings typically lag the actual transaction by 5-30 days, so they're
                    best used as <em>confirmatory background</em>, not as a timing signal.
                    <br /><br />
                    For <strong>intraday broker flow</strong> (daily netval, foreign vs domestic split via
                    broker code NG, top-broker concentration to detect crossing trades, multi-day
                    rolling netval, and LTP vs bavg spread) — use one of the tools below alongside
                    Neural's verdict. A Neural BUY with 3-day persistent foreign net-buy from a
                    companion tool is a materially stronger setup than either signal alone.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="broker-flow-tools-grid">
                {TOOLS.map((t) => (
                    <a
                        key={t.name}
                        href={t.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 block transition-colors"
                        style={{
                            border: "1px solid hsl(var(--border-default))",
                            background: "hsl(var(--bg) / 0.3)",
                        }}
                        data-testid={`broker-flow-tool-${t.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                <p className="text-overline" style={{ fontSize: "0.58rem" }}>
                                    {t.category}
                                </p>
                                <p className="font-serif text-lg mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    {t.name}
                                </p>
                            </div>
                            <ExternalLink size={12} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} className="shrink-0 mt-1" />
                        </div>
                        <p className="mt-2 text-xs font-medium" style={{ color: "hsl(var(--hold))" }}>
                            {t.highlight}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "hsl(var(--text-secondary))" }}>
                            {t.details}
                        </p>
                    </a>
                ))}
            </div>

            <p
                className="mt-5 text-[10px] leading-relaxed"
                style={{ color: "hsl(var(--text-muted))" }}
                data-testid="broker-flow-disclaimer"
            >
                These are third-party tools. Neural Stock Intelligence™ is not affiliated with any
                of them and does not share your data. Use them for intraday broker-flow confirmation
                alongside Neural's research verdict. <strong>Research only — not financial advice.</strong>
            </p>
        </section>
    );
}
