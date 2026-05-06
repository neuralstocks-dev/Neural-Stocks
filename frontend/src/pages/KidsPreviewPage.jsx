/**
 * KidsPreviewPage — StockKids Phase Zero proof-of-concept page.
 *
 * Public route at /kids/preview/:ticker (no auth, no AppShell). Shows
 * the GAL-translated kid view of an existing adult NSI verdict, plus
 * an in-page age-band picker, ticker picker, feedback widget, and a
 * shareable QR code for the WhatsApp tester group.
 *
 * Design intent: kid-friendly bright UI that contrasts deliberately
 * with the adult product's noir aesthetic. Rounded cards, generous
 * whitespace, friendly emoji-led copy. Stays accessible (high
 * contrast, large tap targets, semantic HTML).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { Loader2, Sparkles, ThumbsUp, ThumbsDown, RefreshCw, Share2, Brain, Lightbulb, MessageCircle, ShieldAlert } from "lucide-react";
import axios from "axios";
import { API_BASE } from "@/lib/api";

const DEMO_TICKERS = [
    { symbol: "AAPL", label: "Apple", emoji: "🍎" },
    { symbol: "MSFT", label: "Microsoft", emoji: "💻" },
    { symbol: "NVDA", label: "Nvidia", emoji: "🎮" },
    { symbol: "TSLA", label: "Tesla", emoji: "🚗" },
    { symbol: "BBCA.JK", label: "BCA (Indonesia)", emoji: "🏦" },
];

const AGE_BANDS = [
    { value: "8-10", label: "Ages 8–10", emoji: "🧒" },
    { value: "11-13", label: "Ages 11–13", emoji: "👦" },
    { value: "14-18", label: "Ages 14–18", emoji: "🧑" },
];

export default function KidsPreviewPage() {
    const { ticker } = useParams();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();

    const age = AGE_BANDS.some((b) => b.value === params.get("age"))
        ? params.get("age")
        : "11-13";
    const currentTicker = (ticker || "AAPL").toUpperCase();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showAdult, setShowAdult] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [feedbackComment, setFeedbackComment] = useState("");
    const [feedbackBusy, setFeedbackBusy] = useState(false);
    const [showShare, setShowShare] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError("");
            // Clear stale data so a previous ticker/age's kid_view doesn't
            // render alongside the new error state if the new request 503s.
            setData(null);
            setFeedbackSent(false);
            setShowAdult(false);
            try {
                const r = await axios.get(`${API_BASE}/kids/preview/${currentTicker}?age=${age}`);
                if (!cancelled) setData(r.data);
            } catch (err) {
                if (!cancelled) setError(err?.response?.data?.detail || "Couldn't load this one — try another stock or age.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [currentTicker, age]);

    const setTicker = (sym) => navigate(`/kids/preview/${sym}?age=${age}`);
    const setAge = (a) => setParams({ age: a });

    const submitFeedback = async (sentiment) => {
        setFeedbackBusy(true);
        try {
            await axios.post(`${API_BASE}/kids/preview/feedback`, {
                ticker: currentTicker,
                age_band: age,
                analysis_id: data?.analysis_id,
                sentiment,
                comment: feedbackComment.trim() || null,
            });
            setFeedbackSent(true);
        } catch {
            // Feedback failures are silent — testers shouldn't see error UI.
        } finally {
            setFeedbackBusy(false);
        }
    };

    const shareUrl = `${window.location.origin}/kids/preview/${currentTicker}?age=${age}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}&margin=2&bgcolor=fff8f0&color=1a1a2e`;

    const kv = data?.kid_view;
    const adult = data?.adult_snapshot;

    // Memoised header gradient — different per ticker so the page feels
    // like it adapts when you swap stocks. Pure CSS, no images.
    const headerGradient = useMemo(() => {
        const palettes = {
            AAPL: "linear-gradient(135deg, #FFE5B4 0%, #FFB570 100%)",
            MSFT: "linear-gradient(135deg, #B4E5FF 0%, #70B5FF 100%)",
            NVDA: "linear-gradient(135deg, #C8FFB4 0%, #76E576 100%)",
            TSLA: "linear-gradient(135deg, #FFB4C8 0%, #FF7676 100%)",
            "BBCA.JK": "linear-gradient(135deg, #B4D4FF 0%, #7676FF 100%)",
        };
        return palettes[currentTicker] || "linear-gradient(135deg, #FFE5B4 0%, #FFB570 100%)";
    }, [currentTicker]);

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#fff8f0",
                fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
                color: "#1a1a2e",
            }}
            data-testid="kids-preview-page"
        >
            {/* Top bar — kid-friendly, super minimal */}
            <header
                style={{
                    background: "#1a1a2e",
                    color: "#fff",
                    padding: "12px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <Link to="/" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <Sparkles size={18} strokeWidth={1.8} />
                    <span style={{ fontWeight: 700, letterSpacing: 1 }}>StockKids</span>
                    <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>by NeuLab</span>
                </Link>
                <button
                    onClick={() => setShowShare(true)}
                    data-testid="kids-share-button"
                    style={{
                        background: "transparent",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.3)",
                        borderRadius: 999,
                        padding: "6px 14px",
                        fontSize: 13,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <Share2 size={14} /> Share
                </button>
            </header>

            <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 80px" }}>
                {/* Ticker picker — chunky chips */}
                <div data-testid="kids-ticker-picker">
                    <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                        Pick a company
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {DEMO_TICKERS.map((t) => {
                            const active = t.symbol === currentTicker;
                            return (
                                <button
                                    key={t.symbol}
                                    onClick={() => setTicker(t.symbol)}
                                    data-testid={`kids-ticker-${t.symbol}`}
                                    style={{
                                        background: active ? "#1a1a2e" : "#fff",
                                        color: active ? "#fff" : "#1a1a2e",
                                        border: active ? "2px solid #1a1a2e" : "2px solid #e5d5b8",
                                        borderRadius: 16,
                                        padding: "10px 14px",
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        transition: "all 0.15s",
                                    }}
                                >
                                    <span>{t.emoji}</span>
                                    <span>{t.symbol}</span>
                                    <span style={{ opacity: 0.6, fontSize: 12 }}>· {t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Age picker */}
                <div style={{ marginTop: 18 }} data-testid="kids-age-picker">
                    <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                        Your age
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {AGE_BANDS.map((b) => {
                            const active = b.value === age;
                            return (
                                <button
                                    key={b.value}
                                    onClick={() => setAge(b.value)}
                                    data-testid={`kids-age-${b.value}`}
                                    style={{
                                        background: active ? "#ff7676" : "#fff",
                                        color: active ? "#fff" : "#1a1a2e",
                                        border: active ? "2px solid #ff7676" : "2px solid #e5d5b8",
                                        borderRadius: 16,
                                        padding: "10px 16px",
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <span>{b.emoji}</span>
                                    <span>{b.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Result panel */}
                <section
                    data-testid="kids-result-panel"
                    style={{
                        marginTop: 28,
                        background: "#fff",
                        borderRadius: 24,
                        padding: 0,
                        boxShadow: "0 8px 24px rgba(26,26,46,0.08), 0 2px 6px rgba(26,26,46,0.04)",
                        overflow: "hidden",
                        minHeight: 400,
                    }}
                >
                    {loading && (
                        <div style={{ padding: 80, textAlign: "center" }} data-testid="kids-loading">
                            <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
                            <p style={{ marginTop: 16, opacity: 0.6 }}>Asking the AI to think it over…</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div style={{ padding: 60, textAlign: "center" }} data-testid="kids-error">
                            <ShieldAlert size={32} color="#ff7676" />
                            <p style={{ marginTop: 12, fontWeight: 600, color: "#ff7676" }}>Hmm…</p>
                            <p style={{ marginTop: 8, opacity: 0.7 }}>{error}</p>
                        </div>
                    )}

                    {!loading && kv && (
                        <>
                            {/* Header band — emoji + ticker name */}
                            <div style={{ background: headerGradient, padding: "32px 28px", textAlign: "center" }}>
                                <div style={{ fontSize: 64, lineHeight: 1 }} data-testid="kids-emoji-mood">
                                    {kv.emoji_mood || "🤔"}
                                </div>
                                <p style={{ marginTop: 12, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.6 }}>
                                    {data.name} · {currentTicker}
                                </p>
                                <h1
                                    data-testid="kids-headline"
                                    style={{
                                        marginTop: 6,
                                        fontSize: 24,
                                        fontWeight: 700,
                                        lineHeight: 1.3,
                                        maxWidth: 580,
                                        marginLeft: "auto",
                                        marginRight: "auto",
                                    }}
                                >
                                    {kv.kid_headline}
                                </h1>
                            </div>

                            {/* Explanation */}
                            <div style={{ padding: "28px 28px 0" }}>
                                <p
                                    data-testid="kids-explanation"
                                    style={{ fontSize: 17, lineHeight: 1.7, color: "#2c2c4a" }}
                                >
                                    {kv.kid_explanation}
                                </p>
                            </div>

                            {/* Confidence pill */}
                            {kv.confidence_plain_english && (
                                <div style={{ padding: "16px 28px 0" }}>
                                    <div
                                        data-testid="kids-confidence"
                                        style={{
                                            background: "#fff8f0",
                                            border: "1.5px solid #e5d5b8",
                                            borderRadius: 12,
                                            padding: "12px 16px",
                                            display: "flex",
                                            gap: 12,
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <Brain size={18} color="#7a5a00" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <p style={{ fontSize: 14, color: "#7a5a00", lineHeight: 1.5, margin: 0 }}>
                                            <strong>How sure is the AI?</strong> {kv.confidence_plain_english}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Did you know? cards */}
                            {kv.did_you_know?.length > 0 && (
                                <div style={{ padding: "24px 28px 0" }} data-testid="kids-did-you-know">
                                    <p
                                        style={{
                                            fontSize: 12,
                                            letterSpacing: 1.5,
                                            textTransform: "uppercase",
                                            opacity: 0.6,
                                            marginBottom: 12,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6,
                                        }}
                                    >
                                        <Lightbulb size={14} /> Did you know?
                                    </p>
                                    <div style={{ display: "grid", gap: 10 }}>
                                        {kv.did_you_know.map((card, i) => (
                                            <div
                                                key={`dyk-${i}`}
                                                style={{
                                                    background: "#fff8f0",
                                                    borderLeft: "3px solid #ff7676",
                                                    padding: "14px 16px",
                                                    borderRadius: "4px 12px 12px 4px",
                                                }}
                                            >
                                                <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                                                    {card.title}
                                                </p>
                                                <p style={{ fontSize: 14, lineHeight: 1.55, color: "#2c2c4a" }}>
                                                    {card.body}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reflection question */}
                            {kv.reflection_question && (
                                <div style={{ padding: "24px 28px 0" }}>
                                    <div
                                        data-testid="kids-reflection"
                                        style={{
                                            background: "#1a1a2e",
                                            color: "#fff",
                                            padding: "18px 20px",
                                            borderRadius: 14,
                                            display: "flex",
                                            gap: 12,
                                            alignItems: "flex-start",
                                        }}
                                    >
                                        <MessageCircle size={20} color="#ffb570" style={{ marginTop: 2, flexShrink: 0 }} />
                                        <div>
                                            <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>
                                                Think about this
                                            </p>
                                            <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>
                                                {kv.reflection_question}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* What would change my mind */}
                            {kv.what_would_change_my_mind && (
                                <div style={{ padding: "16px 28px 0" }}>
                                    <p
                                        data-testid="kids-change-mind"
                                        style={{
                                            fontSize: 13,
                                            color: "#2c2c4a",
                                            opacity: 0.75,
                                            lineHeight: 1.55,
                                            fontStyle: "italic",
                                        }}
                                    >
                                        🚨 {kv.what_would_change_my_mind}
                                    </p>
                                </div>
                            )}

                            {/* Adult mode toggle (14-18 band most likely to use it) */}
                            {adult && (
                                <div style={{ padding: "20px 28px 28px", borderTop: "1px solid #f0e8d8", marginTop: 24 }}>
                                    <button
                                        onClick={() => setShowAdult((v) => !v)}
                                        data-testid="kids-adult-mode-toggle"
                                        style={{
                                            background: "transparent",
                                            border: "none",
                                            color: "#1a1a2e",
                                            fontSize: 13,
                                            cursor: "pointer",
                                            textDecoration: "underline",
                                            textUnderlineOffset: 4,
                                            opacity: 0.7,
                                        }}
                                    >
                                        {showAdult ? "← Hide grown-up version" : "See grown-up version →"}
                                    </button>
                                    {showAdult && (
                                        <div
                                            data-testid="kids-adult-snapshot"
                                            style={{
                                                marginTop: 14,
                                                padding: 16,
                                                background: "#f5f0e6",
                                                borderRadius: 12,
                                                fontSize: 13,
                                                lineHeight: 1.55,
                                            }}
                                        >
                                            <p style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
                                                {adult.recommendation} · {adult.confidence_score}% · target {adult.currency} {adult.price_target} · stop {adult.currency} {adult.stop_loss}
                                            </p>
                                            <p style={{ color: "#2c2c4a" }}>{adult.reasoning_excerpt}…</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </section>

                {/* Feedback widget — only show after content loaded */}
                {!loading && kv && !error && (
                    <section
                        data-testid="kids-feedback-widget"
                        style={{ marginTop: 24, padding: 20, background: "#fff", borderRadius: 16, border: "2px dashed #e5d5b8" }}
                    >
                        {feedbackSent ? (
                            <p style={{ textAlign: "center", color: "#76b876", fontSize: 14 }} data-testid="kids-feedback-thanks">
                                ✨ Thanks! Your feedback helps us teach kids better.
                            </p>
                        ) : (
                            <>
                                <p style={{ fontSize: 14, fontWeight: 600, textAlign: "center", marginBottom: 12 }}>
                                    Was this easy to understand?
                                </p>
                                <textarea
                                    value={feedbackComment}
                                    onChange={(e) => setFeedbackComment(e.target.value)}
                                    placeholder="Optional — what was confusing? what was great?"
                                    maxLength={500}
                                    data-testid="kids-feedback-comment"
                                    style={{
                                        width: "100%",
                                        minHeight: 60,
                                        padding: 12,
                                        border: "1.5px solid #e5d5b8",
                                        borderRadius: 10,
                                        fontSize: 13,
                                        fontFamily: "inherit",
                                        resize: "vertical",
                                        marginBottom: 12,
                                        background: "#fff8f0",
                                    }}
                                />
                                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                                    <button
                                        onClick={() => submitFeedback("up")}
                                        disabled={feedbackBusy}
                                        data-testid="kids-feedback-up"
                                        style={{
                                            background: "#76b876",
                                            color: "#fff",
                                            border: "none",
                                            borderRadius: 999,
                                            padding: "10px 22px",
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <ThumbsUp size={16} /> Yes!
                                    </button>
                                    <button
                                        onClick={() => submitFeedback("down")}
                                        disabled={feedbackBusy}
                                        data-testid="kids-feedback-down"
                                        style={{
                                            background: "#fff",
                                            color: "#ff7676",
                                            border: "1.5px solid #ff7676",
                                            borderRadius: 999,
                                            padding: "10px 22px",
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                        }}
                                    >
                                        <ThumbsDown size={16} /> Not really
                                    </button>
                                </div>
                            </>
                        )}
                    </section>
                )}

                <footer
                    style={{
                        marginTop: 40,
                        textAlign: "center",
                        fontSize: 11,
                        opacity: 0.5,
                        lineHeight: 1.6,
                    }}
                >
                    Educational use only. Not investment advice. Real investing involves the risk of losing money.
                    <br />StockKids is a NeuLab Inc. preview — Phase Zero pilot.
                </footer>
            </main>

            {/* Share modal — QR code + copy URL */}
            {showShare && (
                <div
                    data-testid="kids-share-modal"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowShare(false); }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(26,26,46,0.85)",
                        display: "grid",
                        placeItems: "center",
                        padding: 20,
                        zIndex: 100,
                    }}
                >
                    <div style={{ background: "#fff", borderRadius: 24, padding: 28, maxWidth: 360, width: "100%", textAlign: "center" }}>
                        <p style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.6 }}>Share this preview</p>
                        <h3 style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>Scan to open</h3>
                        <img
                            src={qrSrc}
                            alt={`QR code for ${shareUrl}`}
                            data-testid="kids-share-qr"
                            style={{ width: 240, height: 240, margin: "20px auto", borderRadius: 16, display: "block" }}
                        />
                        <input
                            readOnly
                            value={shareUrl}
                            data-testid="kids-share-url"
                            style={{
                                width: "100%",
                                padding: 10,
                                border: "1.5px solid #e5d5b8",
                                borderRadius: 10,
                                fontSize: 12,
                                fontFamily: "monospace",
                                marginBottom: 12,
                                background: "#fff8f0",
                                textAlign: "center",
                            }}
                            onFocus={(e) => e.target.select()}
                        />
                        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                            <button
                                onClick={() => navigator.clipboard?.writeText(shareUrl)}
                                data-testid="kids-share-copy"
                                style={{ flex: 1, padding: "10px 16px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                                Copy link
                            </button>
                            <button
                                onClick={() => setShowShare(false)}
                                data-testid="kids-share-close"
                                style={{ flex: 1, padding: "10px 16px", background: "#fff", color: "#1a1a2e", border: "1.5px solid #e5d5b8", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                            >
                                Close
                            </button>
                        </div>
                        <p style={{ marginTop: 12, fontSize: 11, opacity: 0.6 }}>
                            Paste this link in WhatsApp to invite kid testers.
                        </p>
                    </div>
                </div>
            )}

            {/* Subtle "try again" floater for refreshing the analysis without
                a full page reload — useful during testing sessions. */}
            <button
                onClick={() => window.location.reload()}
                data-testid="kids-refresh-button"
                title="Refresh the AI analysis"
                style={{
                    position: "fixed",
                    bottom: 20,
                    right: 20,
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "#1a1a2e",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 4px 12px rgba(26,26,46,0.3)",
                }}
            >
                <RefreshCw size={18} />
            </button>

            <style>{`
                @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
