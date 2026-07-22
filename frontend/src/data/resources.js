/**
 * Resource catalogue — single source of truth for everything that
 * appears on `/resources` and any per-slug detail page. Each entry is
 * fully self-contained (title, kind, hero pitch, body sections, CTA)
 * so adding a new resource is a single object append; no per-resource
 * page component to write.
 *
 * Slug is the URL key (`/resources/:slug`) — must be stable, lowercase,
 * hyphenated, no extension. Once published, do NOT rename a slug —
 * external links / Telegram pushes / share cards will rot.
 *
 * `kind` drives the icon + how the CTA renders:
 *   - "pdf"     → BookOpen icon, "Download PDF" CTA, opens the file
 *   - "youtube" → Youtube icon, "Watch on YouTube" CTA, opens in new tab
 *   - "link"    → ExternalLink icon, "Open" CTA, opens in new tab
 *
 * Body schema (deliberately flat so the renderer stays dumb):
 *   - { type: "lead",       text }                    — italic two-liner under the hero
 *   - { type: "section",    heading, paragraph }      — standard section
 *   - { type: "section",    heading, items: [...] }   — bullet list section
 *   - { type: "callout",    heading?, paragraph }     — accent-bordered emphasis block
 */
export const RESOURCES = [
    {
        slug: "user-manual",
        kind: "pdf",
        title: "User Manual",
        teaser: "Complete guide to using Neural Stock Intelligence effectively — how the AI works, how to read verdicts, do's and don'ts, and what to watch out for.",
        ctaLabel: "Download PDF",
        downloadUrl: "/resources/neural-stock-intelligence-user-manual-v1.pdf",
        downloadFilename: "Neural-Stock-Intelligence-User-Manual.pdf",
        secondaryUrl: "/manual",
        secondaryLabel: "Read in-app →",
        meta: { pages: "5 parts", size: "~176 KB", priceLabel: "Free · No email required" },
        heroQuote: "Understanding the tool makes every verdict more useful.\nThis manual explains not just what the AI says — but how it thinks.",
        body: [
            {
                type: "lead",
                text: "What this manual covers",
            },
            {
                type: "section",
                paragraph:
                    "The User Manual is the definitive guide to getting the most out of Neural Stock Intelligence. " +
                    "It covers how the five data pipelines work, what BUY / HOLD / SELL actually means, how to read the confidence score correctly, " +
                    "when to use each analysis mode, and how to build an effective daily research workflow.",
            },
            {
                type: "section",
                heading: "What's inside",
                items: [
                    "Part 1 — Understanding the App: How the AI actually works, what each verdict means, confidence score explained, three analysis modes compared",
                    "Part 2 — Getting Started: Sign-up, dashboard tour, your first analysis, full anatomy of a verdict page with all 11 sections explained",
                    "Part 3 — Daily Workflow: Watchlist best practices, Pattern Scan as a triage tool, Alerts & Telegram, master do's and don'ts",
                    "Part 4 — Power Features: Portfolio P&L, Score Card, Backtesting Lab, IDX exclusives (Bandarmology & Top Picks)",
                    "Part 5 — Reference: Plans comparison table (Guest through Elite), settings reference, 10-question FAQ, full disclaimer",
                ],
            },
            {
                type: "section",
                heading: "Do's, Don'ts & Watch-outs",
                paragraph: "The most detailed section covers the most common mistakes users make:",
                items: [
                    "How to use verdicts correctly — reading executive summaries, checking Bear scenarios, re-analysing before acting",
                    "Managing your quota effectively without wasting analyses",
                    "IDX-specific risks — Bandarmology reporting lag, low-liquidity stocks, market hours",
                    "US stock risks — earnings announcements, meme stocks, pre-market data gaps",
                    "Things that look like bugs but are not — cold-start behaviour, stable verdicts, low-confidence HOLDs",
                ],
            },
            {
                type: "callout",
                paragraph: "If you only read one thing before your first analysis, read Part 1 Section 1.3 — Reading Verdicts Correctly. It explains the single most common misunderstanding new users have.",
            },
            {
                type: "section",
                heading: "Available formats",
                items: [
                    "PDF download: Download this manual as a PDF for offline reading or sharing — no email required",
                    "In-app: Read the full interactive manual at stock.neulab.xyz/manual with live navigation and section anchors",
                ],
            },
        ],
    },
    {
        slug: "stock-market-decoded",
        kind: "pdf",
        title: "The Stock Market Decoded",
        // Short tagline shown on the list card. Keep <= 90 chars.
        teaser: "12 chapters of evidence-based investing — every formula and signal that powers Neural Stock Intelligence™.",
        ctaLabel: "Free Download",
        // Path under /public/resources/. Served as a static asset by
        // CRA, so the URL ends up at https://<host>/resources/<file>.
        downloadUrl: "/resources/stock-market-decoded-v1.pdf",
        downloadFilename: "The_Stock_Market_Decoded_v1.0.pdf",
        meta: { pages: "~120 pages", size: "~650 KB", priceLabel: "Free · No email required" },
        // Detail-page hero quote — sits above everything else.
        heroQuote: "Most investing books teach you how to think about markets.\nThis one shows you the machine that reads them.",
        body: [
            {
                type: "lead",
                text: "What you're actually downloading",
            },
            {
                type: "section",
                paragraph:
                    "This isn't a motivational guide about \"building wealth mindsets.\" It isn't a recycled beginner course dressed up as a book. " +
                    "The Stock Market Decoded is 12 chapters of evidence-based investing education — every formula, every signal, every risk principle that powers the Neural Stock Intelligence™ analysis engine, explained in plain English so you can understand not just what the verdict says, but why.",
            },
            {
                type: "section",
                heading: "What's inside",
                paragraph: "Chapters 1–10 build your foundation from the ground up:",
                items: [
                    "How stock markets actually work — exchanges, order types, market makers, the mechanics most beginners never learn",
                    "Every valuation metric that matters: P/E, P/B, EV/EBITDA, PEG — what each measures, where each breaks down",
                    "Technical analysis explained without the mysticism: RSI, MACD, SMA, EMA — the exact Wilder and Appel formulas, replicable in Excel",
                    "All 15 candlestick patterns NSI detects — Hammer, Bullish Engulfing, Morning Star, Evening Star, Three Black Crows and 10 more — with the geometric rules behind each",
                    "How to read a balance sheet, income statement, and cash flow statement side by side",
                    "Risk management frameworks: position sizing, the Kelly Criterion, portfolio concentration, drawdown psychology",
                    "How AI actually reads the stock market — not marketing language, the real pipeline: deterministic indicators → candlestick scan → sentiment heuristic → intrinsic value anchor → EV multiples → macro context → LLM reasoning",
                ],
            },
            {
                type: "section",
                paragraph: "Chapters 11–12 go somewhere no other beginner book goes:",
                items: [
                    "A direct, honest comparison of 10 platforms — TradingView, Trade Ideas, Danelfin, TrendSpider, Bloomberg Terminal and five more — their real strengths, their documented weaknesses, and the specific gaps each one leaves",
                    "Why the confidence score on your NSI verdict is a signal-agreement score, not a probability — and why that distinction protects you from misreading it",
                    "The 7 structural reasons institutional-grade intelligence is now available at a retail price point",
                ],
            },
            {
                type: "section",
                heading: "Why read it before using NSI",
                paragraph:
                    "The analysis engine does the work in about 60 seconds. But a verdict without context is just a number. " +
                    "When NSI returns a BUY at 68% confidence with an RF disagreement penalty of −7 points and a Graham Number anchor showing a 1,531% premium, you need to know what each of those elements means — not to second-guess the model, but to decide how much weight to give it in your own portfolio context.",
            },
            {
                type: "section",
                paragraph:
                    "This book gives you that context. Every indicator NSI computes is explained here. Every calibration rule is documented here. Every honest limit — what the model cannot do, what the Random Forest underperformed on in 2025, why FinBERT was rejected, why LSTM price-forecasting models were not used — is in here.",
            },
            {
                type: "callout",
                paragraph: "The book is the intelligence behind the intelligence.",
            },
            {
                type: "section",
                heading: "Who this is written for",
                items: [
                    "Beginners who are tired of YouTube channels that teach the same 5 indicators without explaining why they work — or when they don't.",
                    "Intermediate investors who have been using TradingView or a screener for years but still feel like they're missing a layer — the synthesis layer that turns signals into a decision.",
                    "IDX investors who want to understand Bandarmology, insider filing ratios, and why the equity risk premium for Indonesian stocks is calibrated differently from US large caps.",
                    "Anyone who has ever looked at an AI verdict and thought \"but how did it get there?\" — this book answers that question for every stage of the pipeline.",
                ],
            },
            {
                type: "section",
                heading: "What makes this different from every other free investing PDF",
                paragraph:
                    "Most free investing guides are lead magnets — thin content designed to get your email. This one was built as the companion document to a live AI analysis engine. Every chapter maps to a real feature. Every formula in the book is the same formula computed in the backend. There is no upsell chapter. There is no \"book a call\" page. " +
                    "It is 12 chapters of the actual methodology, written at a level that respects your intelligence.",
            },
            {
                type: "callout",
                heading: "Download it. Read Chapter 8 first.",
                paragraph:
                    "If you want to understand how NSI works before you run your first analysis, start at Chapter 8 — How NSI Delivers Its Verdict. " +
                    "It walks through all 8 pipeline stages, the confidence scoring system, the Post-LLM calibration rules, and the complete report structure. " +
                    "By the end of that chapter, the next time you see a verdict ring at 74% HOLD, you will know exactly what produced it.",
            },
        ],
    },
];

/**
 * Convenience lookup. Returns null for unknown slugs so the detail page
 * can render a clean 404 instead of a hard crash.
 */
export function findResource(slug) {
    return RESOURCES.find((r) => r.slug === slug) || null;
}
