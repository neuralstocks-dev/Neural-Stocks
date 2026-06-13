/**
 * LandingPage — public entry point for stock.neulab.xyz
 *
 * Option B: dedicated landing page at "/" for unauthenticated visitors.
 * Logged-in users are redirected to /dashboard via RootRedirect in App.js.
 *
 * Design: hero-first, ticker input IS the demo, feature overview below.
 * No stock photos. Dark, confident, consistent with existing app aesthetic.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, ArrowRight, CheckCircle2, Zap, Shield, Globe, TrendingUp, BarChart2, Bell } from "lucide-react";
import TryNowBox from "@/components/TryNowBox";
import PublicTrendingTicker from "@/components/PublicTrendingTicker";
import SocialLinks from "@/components/SocialLinks";

const BG_IMAGE =
    "https://static.prod-images.emergentagent.com/jobs/449d5842-eb76-413d-bd7e-07775c2311fa/images/da6e03e36e932405f471d2bb00616910cb10e5c8d593c7714da3cd482bc97e88.png";

const FEATURES = [
    {
        icon: BarChart2,
        title: "Full-stack analysis",
        body: "Technical indicators, candlestick patterns, fundamentals, and news sentiment — synthesized into one verdict with visible reasoning.",
    },
    {
        icon: Globe,
        title: "US & Indonesian markets",
        body: "US equities via Finnhub + yfinance. IDX stocks with Bandarmology insider flow — a signal no other retail platform surfaces.",
    },
    {
        icon: TrendingUp,
        title: "Three reasoning modes",
        body: "Standard (fundamentals + technicals), Candlestick (pattern-first), or Hybrid (AI confirms with candlestick timing). Same data, different emphasis.",
    },
    {
        icon: Zap,
        title: "Random Forest second opinion",
        body: "An independent statistical model runs alongside the AI verdict. When they disagree, confidence drops visibly — you see the uncertainty.",
    },
    {
        icon: Bell,
        title: "Telegram alerts",
        body: "High-conviction BUY and SELL signals (≥75% confidence) pushed to your phone the moment they're generated. No dashboard required.",
    },
    {
        icon: Shield,
        title: "Shows its work",
        body: "Every verdict cites the specific indicators, patterns, and news items that drove it. No black box. Every number is replicable in Excel.",
    },
];

const HONEST_POINTS = [
    "Not a price predictor — a direction-bias research tool",
    "Daily candles only — swing and position trading, not intraday",
    "Educational research output, not financial advice",
];

export default function LandingPage() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <div
            style={{
                background: "#07090D",
                color: "#F0F4F8",
                fontFamily: "'Outfit', sans-serif",
                minHeight: "100vh",
            }}
        >
            {/* ── Nav ─────────────────────────────────────────── */}
            <nav
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    padding: "0 24px",
                    height: 56,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: scrolled ? "rgba(7,9,13,0.92)" : "transparent",
                    backdropFilter: scrolled ? "blur(12px)" : "none",
                    borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "none",
                    transition: "background 0.3s, border-color 0.3s",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                        style={{
                            width: 30,
                            height: 30,
                            border: "1px solid rgba(197,164,94,0.5)",
                            display: "grid",
                            placeItems: "center",
                        }}
                    >
                        <LineChart size={14} strokeWidth={1.5} style={{ color: "#C5A45E" }} />
                    </div>
                    <div style={{ lineHeight: 1 }}>
                        <div
                            style={{
                                fontFamily: "'Playfair Display', serif",
                                fontSize: "0.95rem",
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                color: "#F0F4F8",
                            }}
                        >
                            NEULAB
                        </div>
                        <div
                            style={{
                                fontSize: "0.55rem",
                                letterSpacing: "0.12em",
                                color: "rgba(197,164,94,0.7)",
                                textTransform: "uppercase",
                            }}
                        >
                            Neural Stock Intelligence™
                        </div>
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Link
                        to="/login"
                        style={{
                            fontSize: "0.8rem",
                            color: "rgba(240,244,248,0.6)",
                            textDecoration: "none",
                            letterSpacing: "0.06em",
                            padding: "6px 12px",
                        }}
                    >
                        Sign in
                    </Link>
                    <Link
                        to="/signup"
                        style={{
                            fontSize: "0.8rem",
                            color: "#07090D",
                            background: "#C5A45E",
                            textDecoration: "none",
                            letterSpacing: "0.06em",
                            padding: "7px 16px",
                            fontWeight: 600,
                        }}
                    >
                        Start free
                    </Link>
                </div>
            </nav>

            {/* ── Hero ────────────────────────────────────────── */}
            <section
                style={{
                    position: "relative",
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "80px 24px 60px",
                    overflow: "hidden",
                }}
            >
                {/* Background image */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${BG_IMAGE})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center 30%",
                        filter: "brightness(0.35) saturate(0.8)",
                        zIndex: 0,
                    }}
                />
                {/* Gradient overlay */}
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background:
                            "linear-gradient(180deg, rgba(7,9,13,0.3) 0%, rgba(7,9,13,0.7) 60%, rgba(7,9,13,1) 100%)",
                        zIndex: 1,
                    }}
                />

                <div
                    style={{
                        position: "relative",
                        zIndex: 2,
                        maxWidth: 700,
                        margin: "0 auto",
                        width: "100%",
                        textAlign: "center",
                    }}
                >
                    {/* Eyebrow */}
                    <p
                        style={{
                            fontSize: "0.62rem",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "#C5A45E",
                            marginBottom: 20,
                            fontFamily: "'IBM Plex Mono', monospace",
                        }}
                    >
                        US &amp; Indonesia equity research · AI-powered
                    </p>

                    {/* Headline */}
                    <h1
                        style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize: "clamp(2.6rem, 7vw, 4.8rem)",
                            lineHeight: 1.05,
                            letterSpacing: "-0.02em",
                            fontWeight: 700,
                            color: "#F0F4F8",
                            margin: "0 0 20px",
                        }}
                    >
                        Analysis that
                        <br />
                        <em style={{ color: "#C5A45E", fontStyle: "italic" }}>shows its work.</em>
                    </h1>

                    {/* Subheadline */}
                    <p
                        style={{
                            fontSize: "clamp(0.95rem, 2vw, 1.1rem)",
                            lineHeight: 1.65,
                            color: "rgba(240,244,248,0.65)",
                            maxWidth: 520,
                            margin: "0 auto 40px",
                        }}
                    >
                        Enter any US or Indonesian stock ticker. Get a full AI verdict —
                        with every indicator, pattern, and data point cited.
                    </p>

                    {/* The input — the signature element */}
                    <div style={{ maxWidth: 520, margin: "0 auto 20px" }}>
                        <TryNowBox variant="muted" />
                    </div>

                    {/* Trending tickers */}
                    <div style={{ maxWidth: 580, margin: "0 auto" }}>
                        <PublicTrendingTicker
                            variant="muted"
                            windowDays={7}
                            limit={6}
                            ctaHref="/signup"
                            ctaLabel="See all →"
                        />
                    </div>

                    {/* Scroll hint */}
                    <div
                        style={{
                            marginTop: 56,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 6,
                            opacity: 0.35,
                        }}
                    >
                        <div
                            style={{
                                width: 1,
                                height: 48,
                                background: "linear-gradient(to bottom, rgba(197,164,94,0), rgba(197,164,94,0.6))",
                            }}
                        />
                        <span style={{ fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace" }}>
                            scroll
                        </span>
                    </div>
                </div>
            </section>

            {/* ── Features ────────────────────────────────────── */}
            <section
                style={{
                    background: "#07090D",
                    padding: "80px 24px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
            >
                <div style={{ maxWidth: 1100, margin: "0 auto" }}>
                    <div style={{ textAlign: "center", marginBottom: 56 }}>
                        <p
                            style={{
                                fontSize: "0.62rem",
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                                color: "#C5A45E",
                                fontFamily: "'IBM Plex Mono', monospace",
                                marginBottom: 12,
                            }}
                        >
                            What you get
                        </p>
                        <h2
                            style={{
                                fontFamily: "'Playfair Display', serif",
                                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                                letterSpacing: "-0.01em",
                                fontWeight: 700,
                                color: "#F0F4F8",
                                margin: 0,
                            }}
                        >
                            One engine. Every signal.
                        </h2>
                        <p
                            style={{
                                marginTop: 12,
                                color: "rgba(240,244,248,0.5)",
                                fontSize: "0.95rem",
                                maxWidth: 480,
                                margin: "12px auto 0",
                                lineHeight: 1.6,
                            }}
                        >
                            Not a screener. Not a chatbot. A structured research pipeline
                            that cites every number it uses.
                        </p>
                    </div>

                    {/* Feature grid */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                            gap: 1,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.06)",
                        }}
                    >
                        {FEATURES.map(({ icon: Icon, title, body }) => (
                            <div
                                key={title}
                                style={{
                                    background: "#07090D",
                                    padding: "28px 28px",
                                }}
                            >
                                <div
                                    style={{
                                        width: 36,
                                        height: 36,
                                        background: "rgba(197,164,94,0.08)",
                                        border: "1px solid rgba(197,164,94,0.2)",
                                        display: "grid",
                                        placeItems: "center",
                                        marginBottom: 16,
                                    }}
                                >
                                    <Icon size={16} strokeWidth={1.5} style={{ color: "#C5A45E" }} />
                                </div>
                                <h3
                                    style={{
                                        fontFamily: "'Playfair Display', serif",
                                        fontSize: "1.1rem",
                                        fontWeight: 600,
                                        color: "#F0F4F8",
                                        margin: "0 0 10px",
                                        letterSpacing: "-0.005em",
                                    }}
                                >
                                    {title}
                                </h3>
                                <p
                                    style={{
                                        fontSize: "0.875rem",
                                        lineHeight: 1.65,
                                        color: "rgba(240,244,248,0.55)",
                                        margin: 0,
                                    }}
                                >
                                    {body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Honest limits strip ─────────────────────────── */}
            <section
                style={{
                    background: "#0F1117",
                    padding: "40px 24px",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
            >
                <div
                    style={{
                        maxWidth: 900,
                        margin: "0 auto",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "16px 40px",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <span
                        style={{
                            fontSize: "0.62rem",
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "rgba(240,244,248,0.3)",
                            fontFamily: "'IBM Plex Mono', monospace",
                            flexShrink: 0,
                        }}
                    >
                        Honest limits
                    </span>
                    {HONEST_POINTS.map((pt) => (
                        <div
                            key={pt}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: "0.8rem",
                                color: "rgba(240,244,248,0.45)",
                            }}
                        >
                            <div
                                style={{
                                    width: 4,
                                    height: 4,
                                    borderRadius: "50%",
                                    background: "rgba(197,164,94,0.4)",
                                    flexShrink: 0,
                                }}
                            />
                            {pt}
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Bottom CTA ──────────────────────────────────── */}
            <section
                style={{
                    padding: "80px 24px",
                    textAlign: "center",
                    background: "#07090D",
                }}
            >
                <div style={{ maxWidth: 560, margin: "0 auto" }}>
                    <p
                        style={{
                            fontSize: "0.62rem",
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "#C5A45E",
                            fontFamily: "'IBM Plex Mono', monospace",
                            marginBottom: 16,
                        }}
                    >
                        Free to start
                    </p>
                    <h2
                        style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
                            letterSpacing: "-0.01em",
                            fontWeight: 700,
                            color: "#F0F4F8",
                            margin: "0 0 16px",
                        }}
                    >
                        Run your first analysis
                        <br />
                        <em style={{ color: "#C5A45E", fontStyle: "italic" }}>in 30 seconds.</em>
                    </h2>
                    <p
                        style={{
                            fontSize: "0.9rem",
                            color: "rgba(240,244,248,0.5)",
                            lineHeight: 1.65,
                            marginBottom: 36,
                        }}
                    >
                        3 free analyses per day. No credit card. US and IDX markets.
                    </p>
                    <div
                        style={{
                            display: "flex",
                            gap: 12,
                            justifyContent: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <Link
                            to="/signup"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                background: "#C5A45E",
                                color: "#07090D",
                                textDecoration: "none",
                                padding: "12px 28px",
                                fontWeight: 700,
                                fontSize: "0.85rem",
                                letterSpacing: "0.06em",
                            }}
                        >
                            Create free account
                            <ArrowRight size={15} strokeWidth={2} />
                        </Link>
                        <Link
                            to="/login"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                border: "1px solid rgba(255,255,255,0.15)",
                                color: "rgba(240,244,248,0.7)",
                                textDecoration: "none",
                                padding: "12px 28px",
                                fontSize: "0.85rem",
                                letterSpacing: "0.06em",
                            }}
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── Footer ──────────────────────────────────────── */}
            <footer
                style={{
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    padding: "32px 24px",
                    background: "#07090D",
                }}
            >
                <div
                    style={{
                        maxWidth: 1100,
                        margin: "0 auto",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <LineChart size={13} strokeWidth={1.5} style={{ color: "#C5A45E" }} />
                        <span
                            style={{
                                fontSize: "0.72rem",
                                color: "rgba(240,244,248,0.35)",
                                fontFamily: "'IBM Plex Mono', monospace",
                                letterSpacing: "0.06em",
                            }}
                        >
                            NEULAB INC. · Neural Stock Intelligence™ · Not financial advice
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                        <Link
                            to="/technical"
                            style={{ fontSize: "0.75rem", color: "rgba(240,244,248,0.3)", textDecoration: "none" }}
                        >
                            How it works
                        </Link>
                        <Link
                            to="/pricing"
                            style={{ fontSize: "0.75rem", color: "rgba(240,244,248,0.3)", textDecoration: "none" }}
                        >
                            Pricing
                        </Link>
                        <a
                            href="https://kidstocks.net"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.75rem", color: "rgba(240,244,248,0.3)", textDecoration: "none" }}
                        >
                            KidStocks
                        </a>
                        <SocialLinks variant="muted" size="sm" />
                    </div>
                </div>
            </footer>
        </div>
    );
}
