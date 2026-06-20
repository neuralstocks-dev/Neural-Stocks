/**
 * KidsPreviewPage — KidStocks Phase Zero proof-of-concept page.
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
import { Loader2, Sparkles, ThumbsUp, ThumbsDown, RefreshCw, Share2, Brain, Lightbulb, MessageCircle, ShieldAlert, Search, Download, Calendar } from "lucide-react";
import { jsPDF } from "jspdf";
import KidStocksLogo from "@/components/KidStocksLogo";
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
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const age = AGE_BANDS.some((b) => b.value === params.get("age"))
        ? params.get("age")
        : "11-13";
    const currentTicker = (ticker || "AAPL").toUpperCase();

    // Gate: should we actually fetch/show a verdict yet? A genuine deep link
    // — the Share button's URL, or one of the deliberate "see a sample" /
    // "try the live demo" CTAs (KidsDiscoverNudge, KidsForParentsPage,
    // WhyUsPage, KidsLandingPage — all of which explicitly promise an
    // immediate demo in their own copy before the tap) — arrives with BOTH
    // :ticker and ?age already explicit in the URL, and correctly auto-runs
    // immediately. The bare /kids/preview route (no promise attached to it
    // anywhere) redirects to /kids/preview/AAPL with NO age param on purpose
    // — see App.js — specifically so landing here with zero prior tap does
    // NOT look like a deep link and does NOT auto-run. Separately, the
    // in-page picker used to fire a fresh analysis the instant a company
    // chip was tapped, using whatever age happened to be the URL's silent
    // default even if the user hadn't touched the age picker at all yet.
    // Seeded ONCE on mount from whether the URL already had an explicit
    // age param — never recalculated after, so it correctly stays "true"
    // once a run has happened (via deep link OR via the confirm button)
    // and the picker chips below just adjust pending selections without
    // re-triggering anything until Get my verdict is hit.
    const [hasRunOnce, setHasRunOnce] = useState(() => params.get("age") != null);
    const [pendingTicker, setPendingTicker] = useState(currentTicker);
    const [pendingAge, setPendingAge] = useState(
        AGE_BANDS.some((b) => b.value === params.get("age")) ? params.get("age") : null
    );

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showAdult, setShowAdult] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [feedbackComment, setFeedbackComment] = useState("");
    const [feedbackBusy, setFeedbackBusy] = useState(false);
    const [showShare, setShowShare] = useState(false);
    const [tickerInput, setTickerInput] = useState("");
    const [tickerErr, setTickerErr] = useState("");
    // Live-analysis job state — only used when the backend reports a
    // cache miss for a brand-new ticker that no adult has analysed in
    // the last 14 days. Holds {job_id, stage_label, ticker} while the
    // background pipeline runs.
    const [jobState, setJobState] = useState(null);
    // Set by the "Get a fresh take" button to force the NEXT fetch for this
    // exact (ticker, age) pair to skip the backend's up-to-14-day cache.
    // Format: `${ticker}|${age}|${Date.now()}`. The ticker/age prefix means
    // a later switch to a DIFFERENT ticker via the normal picker + confirm
    // flow naturally doesn't match and isn't forced — no explicit clearing
    // needed for that case. The trailing timestamp exists so clicking
    // "Get a fresh take" twice on the SAME ticker still produces a string
    // React sees as a genuinely new value (a bare `${ticker}|${age}` would
    // be identical to the previous click and React would correctly bail
    // out of re-running the effect, since nothing in the dependency array
    // actually changed) — see the prefix-match check in the fetch effect
    // below, which deliberately checks startsWith, not exact equality.
    const [forceFreshKey, setForceFreshKey] = useState(null);

    // Mark this browser as having seen KidStocks — silences the
    // dashboard cross-promo nudge.
    useEffect(() => {
        try { localStorage.setItem("kids_preview_visited", "1"); } catch (_) { /* ignore quota / private-mode */ }
    }, []);

    useEffect(() => {
        // Don't fetch anything until a run has actually been confirmed —
        // see hasRunOnce comment above. Picker-only interaction (tapping a
        // company chip, tapping an age band) updates pendingTicker/pendingAge
        // and the URL stays untouched, so currentTicker/age here don't even
        // change yet — this guard is the belt to that suspenders, and also
        // covers the very first render before any deep-link age param exists.
        if (!hasRunOnce) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        let pollTimer = null;

        const lang = (() => {
            try { return localStorage.getItem("kids_lang") === "id" ? "id" : "en"; } catch (_) { return "en"; }
        })();

        const pollJob = async (jobId) => {
            if (cancelled) return;
            try {
                const r = await axios.get(`${API_BASE}/kids/preview/job/${jobId}`);
                if (cancelled) return;
                const job = r.data?._job;
                if (job?.status === "done") {
                    setData(r.data);
                    setJobState(null);
                    setLoading(false);
                    return;
                }
                if (job?.status === "error") {
                    setError(job?.error || "Couldn't analyse that ticker — try another one.");
                    setJobState(null);
                    setLoading(false);
                    return;
                }
                // Still pending — refresh stage label and re-poll in 2s
                setJobState({
                    job_id: jobId,
                    ticker: job?.ticker || currentTicker,
                    stage_label: job?.stage_label || "Thinking…",
                });
                pollTimer = setTimeout(() => pollJob(jobId), 2000);
            } catch (err) {
                if (cancelled) return;
                setError(err?.response?.data?.detail || "Lost touch with the AI — please try again.");
                setJobState(null);
                setLoading(false);
            }
        };

        (async () => {
            setLoading(true);
            setError("");
            setData(null);
            setJobState(null);
            setFeedbackSent(false);
            setShowAdult(false);
            try {
                const forceFresh = !!forceFreshKey && forceFreshKey.startsWith(`${currentTicker}|${age}|`);
                const r = await axios.get(
                    `${API_BASE}/kids/preview/${currentTicker}?age=${age}&lang=${lang}${forceFresh ? "&force_fresh=true" : ""}`,
                    // axios treats 202 as success — we read status + body to
                    // decide whether we got a cached verdict (200) or a job
                    // handle to poll (202).
                    { validateStatus: (s) => s >= 200 && s < 300 },
                );
                if (cancelled) return;
                if (r.status === 202 && r.data?.job_id) {
                    setJobState({
                        job_id: r.data.job_id,
                        ticker: r.data.ticker || currentTicker,
                        stage_label: "Looking up the company…",
                    });
                    pollTimer = setTimeout(() => pollJob(r.data.job_id), 1500);
                } else {
                    setData(r.data);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err?.response?.data?.detail || "Couldn't load this one — try another stock or age.");
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [currentTicker, age, hasRunOnce, forceFreshKey]);

    // Picker chips only stage a selection now — they never navigate or
    // trigger a fetch directly. confirmRun() below is the single place
    // that turns a confirmed (ticker + age) pair into an actual analysis.
    const setTicker = (sym) => { setPendingTicker(sym); setTickerErr(""); setTickerInput(""); };
    const setAge = (a) => setPendingAge(a);

    /**
     * Stage a free-text ticker symbol the kid (or parent) typed. Backend
     * resolves Yahoo / IDX / global; basic shape validation here so we
     * don't ship gibberish like "asdf!@#" through to confirmRun.
     *
     * Deliberately does NOT clear tickerInput afterward (it used to) —
     * that left the input box blank with zero trace that anything had
     * happened, which is exactly what was reported as "Look it up does
     * nothing": the ticker WAS staged into pendingTicker correctly, but
     * there was no visible confirmation, and Look it up only stages —
     * same two-step model as the chip picker, NOT an immediate result.
     * Keeping the typed value visible plus the confirmation line below
     * the form (rendered when pendingTicker isn't one of the demo chips)
     * makes that staging step visible instead of silent.
     */
    const submitCustomTicker = (e) => {
        e?.preventDefault?.();
        const cleaned = (tickerInput || "").trim().toUpperCase();
        if (!cleaned) return;
        if (!/^[A-Z0-9.\-^]{1,12}$/.test(cleaned)) {
            setTickerErr("Use letters, numbers, dot or dash. e.g. NVDA, BBCA.JK");
            return;
        }
        setTickerErr("");
        setPendingTicker(cleaned);
    };

    /**
     * The ONLY action that actually fires an analysis. Requires both a
     * pending ticker and a pending age band to be staged first — see the
     * "Get my verdict" button below, disabled until both are set. This is
     * the fix for the bug where tapping a company chip alone used to run
     * a full AI verdict immediately, using whichever age band happened to
     * be the URL's silent default rather than one the user had actually
     * chosen.
     */
    const confirmRun = () => {
        if (!pendingTicker || !pendingAge) return;
        setHasRunOnce(true);
        navigate(`/kids/preview/${pendingTicker}?age=${pendingAge}`);
    };

    /**
     * "Get a fresh take" — forces the currently-shown ticker/age to bypass
     * the backend's up-to-14-day cache and spawn a brand-new adult
     * analysis + GAL translation, even though the (ticker, age) pair
     * itself hasn't changed. Without this, confirming a fresh choice via
     * the picker could still silently land on a DIFFERENT user's analysis
     * from up to two weeks ago with no way to ask for a current one — see
     * forceFreshKey's comment above for why this is keyed rather than a
     * plain boolean/counter.
     */
    const getFreshTake = () => {
        if (!currentTicker || !age) return;
        setForceFreshKey(`${currentTicker}|${age}|${Date.now()}`);
    };

    /**
     * Format the verdict's generated_at ISO string into a kid-friendly
     * "Updated Mon 12 Feb 2026, 09:34" style stamp. Defensive against
     * missing/invalid dates from the backend.
     */
    const verdictDate = useMemo(() => {
        const iso = data?.generated_at;
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return d;
    }, [data?.generated_at]);

    const formatVerdictDate = (d) => {
        if (!d) return "";
        return d.toLocaleString("en-GB", {
            weekday: "short", day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    };

    /**
     * Export the kid verdict as a child-friendly PDF that scales its
     * typography & whitespace to the selected age band.
     *
     *   8-10  : super-large fonts, generous whitespace, single-column
     *   11-13 : medium-large fonts, slightly denser
     *   14-18 : standard book-style PDF — closest to the adult format
     *
     * jsPDF uses WinAnsi (Helvetica) so emoji are stripped before
     * rendering; on-screen UI keeps emoji intact.
     */
    const exportPDF = () => {
        if (!kv || !data) return;
        // Age-band typography ladder. Numbers are points (jsPDF default unit).
        const profile = {
            "8-10":  { title: 26, body: 16, label: 12, gap: 14, margin: 56 },
            "11-13": { title: 22, body: 14, label: 11, gap: 12, margin: 50 },
            "14-18": { title: 20, body: 12, label: 10, gap: 10, margin: 48 },
        }[age] || { title: 22, body: 14, label: 11, gap: 12, margin: 50 };

        const stripEmoji = (s) => (s == null ? "" : String(s)
            .replace(/[\u2300-\u27FF\u2B00-\u2BFF\u3030\u303D\uFE0F\u200D]/g, "")
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
            .replace(/\s+/g, " ").trim());

        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const M = profile.margin;
        let y = M;

        const newPageIfNeeded = (need) => {
            if (y + need > pageH - M) { doc.addPage(); y = M; }
        };
        const writeWrapped = (text, size, opts = {}) => {
            doc.setFontSize(size);
            doc.setFont("helvetica", opts.bold ? "bold" : "normal");
            const c = opts.color || [42, 42, 70];
            doc.setTextColor(c[0], c[1], c[2]);
            const lines = doc.splitTextToSize(stripEmoji(text), pageW - M * 2);
            const block = lines.length * (size * 1.35);
            newPageIfNeeded(block);
            doc.text(lines, M, y);
            y += block + (opts.gap ?? profile.gap);
        };
        const accent = (h) => {
            // Coral accent banner used between sections — kid-friendly visual rhythm
            newPageIfNeeded(profile.title + 18);
            doc.setFillColor(255, 118, 118);
            doc.rect(M, y, pageW - M * 2, 4, "F");
            y += 14;
            writeWrapped(h, profile.label, { bold: true, color: [255, 118, 118], gap: profile.gap });
        };

        // ── Cover band ────────────────────────────────────────────
        doc.setFillColor(255, 248, 240);                  // soft cream
        doc.rect(0, 0, pageW, M + profile.title * 3.2, "F");
        writeWrapped("KidStocks", profile.title, { bold: true, color: [26, 26, 46], gap: 4 });
        writeWrapped("by NeuLab Inc.", profile.label, { color: [120, 120, 130], gap: profile.gap + 6 });
        writeWrapped(`${data.name || ""} (${currentTicker})`, profile.title - 2, { bold: true, color: [255, 118, 118], gap: 4 });
        writeWrapped(`Ages ${age}  ·  My Stock Verdict`, profile.label, { color: [120, 120, 130], gap: profile.gap });
        if (verdictDate) {
            writeWrapped(`AI verdict generated: ${formatVerdictDate(verdictDate)}`, profile.label - 1, { color: [140, 140, 150], gap: profile.gap });
        }

        // ── Mood + Headline ───────────────────────────────────────
        accent("How does the AI feel?");
        writeWrapped(kv.kid_headline || "", profile.body + 4, { bold: true, color: [26, 26, 46], gap: profile.gap });

        // ── Why ────────────────────────────────────────────────────
        if (kv.kid_explanation) {
            accent("Why?");
            writeWrapped(kv.kid_explanation, profile.body, { gap: profile.gap });
        }

        // ── How sure is the AI ────────────────────────────────────
        if (kv.confidence_plain_english) {
            accent("How sure is the AI?");
            writeWrapped(kv.confidence_plain_english, profile.body, { gap: profile.gap });
        }

        // ── Did you know ──────────────────────────────────────────
        if (kv.did_you_know?.length) {
            accent("Did you know?");
            kv.did_you_know.forEach((c) => {
                writeWrapped(c.title, profile.body, { bold: true, color: [255, 118, 118], gap: 4 });
                writeWrapped(c.body, profile.body, { gap: profile.gap });
            });
        }

        // ── Reflection question ───────────────────────────────────
        if (kv.reflection_question) {
            accent("Think about this");
            writeWrapped(kv.reflection_question, profile.body + 1, { color: [26, 26, 46], gap: profile.gap });
        }

        // ── What would change my mind ─────────────────────────────
        if (kv.what_would_change_my_mind) {
            accent("What would change the AI's mind?");
            writeWrapped(kv.what_would_change_my_mind, profile.body, { gap: profile.gap });
        }

        // ── Footer on every page ──────────────────────────────────
        const pages = doc.internal.pages.length - 1;
        for (let p = 1; p <= pages; p++) {
            doc.setPage(p);
            doc.setFontSize(8);
            doc.setTextColor(140, 140, 150);
            doc.text(stripEmoji(`KidStocks · NeuLab Inc. · kidstocks.net   —   Educational only · No real money · Not financial advice`), M, pageH - 24);
            doc.text(`${p} / ${pages}`, pageW - M, pageH - 24, { align: "right" });
        }

        const stamp = verdictDate ? verdictDate.toISOString().slice(0, 10) : "today";
        doc.save(`KidStocks_${currentTicker}_ages-${age}_${stamp}.pdf`);
    };

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
                    paddingTop: "calc(env(safe-area-inset-top) + 12px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <Link to="/kids/about" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
                    <KidStocksLogo size={26} />
                    <span style={{ fontWeight: 700, letterSpacing: 1 }}>KidStocks</span>
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
                            const active = t.symbol === pendingTicker;
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
                    {/* Free-text ticker input — anything from Yahoo Finance.
                        Lives under the chip picker so kids can type their
                        own (Roblox = RBLX, Coca-Cola = KO, BBRI.JK etc.). */}
                    {(() => {
                        // Only the 5 hardcoded demo chips get their own
                        // "active" highlight above — a custom ticker staged
                        // via this form has nowhere else to show it was
                        // registered, so we surface it explicitly here.
                        const isPendingCustom = pendingTicker && !DEMO_TICKERS.some((t) => t.symbol === pendingTicker);
                        return (
                        <>
                            <form
                                onSubmit={submitCustomTicker}
                                data-testid="kids-ticker-form"
                                style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        background: "#fff",
                                        border: `2px solid ${tickerErr ? "#ff7676" : "#e5d5b8"}`,
                                        borderRadius: 16,
                                        padding: "8px 14px",
                                        flex: "1 1 240px",
                                        minWidth: 0,
                                    }}
                                >
                                    <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                                    <input
                                        type="text"
                                        value={tickerInput}
                                        onChange={(e) => { setTickerInput(e.target.value); setTickerErr(""); }}
                                        placeholder="Type any ticker — RBLX, KO, BBRI.JK"
                                        aria-label="Custom ticker"
                                        data-testid="kids-ticker-input"
                                        maxLength={12}
                                        style={{
                                            flex: 1,
                                            border: "none",
                                            outline: "none",
                                            background: "transparent",
                                            fontSize: 14,
                                            fontFamily: "inherit",
                                            color: "#1a1a2e",
                                            minWidth: 0,
                                        }}
                                    />
                                </div>
                                <button
                                    type="submit"
                                    data-testid="kids-ticker-submit"
                                    disabled={!tickerInput.trim()}
                                    style={{
                                        background: tickerInput.trim() ? "#1a1a2e" : "#e5d5b8",
                                        color: "#fff",
                                        border: "none",
                                        borderRadius: 16,
                                        padding: "10px 18px",
                                        fontSize: 13,
                                        fontWeight: 700,
                                        cursor: tickerInput.trim() ? "pointer" : "not-allowed",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    Look it up →
                                </button>
                            </form>
                            {tickerErr && (
                                <p data-testid="kids-ticker-error" style={{ marginTop: 6, fontSize: 12, color: "#ff7676" }}>{tickerErr}</p>
                            )}
                            {!tickerErr && isPendingCustom && (
                                <p data-testid="kids-ticker-staged" style={{ marginTop: 6, fontSize: 12, color: "#2c7a4b", fontWeight: 600 }}>
                                    {pendingAge
                                        ? `✓ ${pendingTicker} picked — tap Get my verdict below.`
                                        : `✓ ${pendingTicker} picked — now choose your age below.`}
                                </p>
                            )}
                        </>
                        );
                    })()}
                </div>

                {/* Age picker */}
                <div style={{ marginTop: 18 }} data-testid="kids-age-picker">
                    <p style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
                        Your age
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {AGE_BANDS.map((b) => {
                            const active = b.value === pendingAge;
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

                {/* Guidance + confirm — the single gate that turns a staged
                    (ticker, age) pair into an actual AI call. Shown whenever
                    nothing has run yet, OR the user has changed their pending
                    selection away from what's currently showing below, so
                    it's always clear another tap is needed before anything
                    new happens. */}
                {(!hasRunOnce || pendingTicker !== currentTicker || pendingAge !== age) && (
                    <div style={{ marginTop: 18 }} data-testid="kids-confirm-run">
                        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
                            {!pendingTicker
                                ? "👆 Pick a company above to get started."
                                : !pendingAge
                                    ? `👇 Now pick your age so the AI can explain ${pendingTicker} the right way for you.`
                                    : "Ready! Tap below to get your verdict."}
                        </p>
                        <button
                            type="button"
                            onClick={confirmRun}
                            disabled={!pendingTicker || !pendingAge}
                            data-testid="kids-confirm-run-button"
                            style={{
                                background: pendingTicker && pendingAge ? "#ff7676" : "#e5d5b8",
                                color: "#fff",
                                border: "none",
                                borderRadius: 16,
                                padding: "14px 24px",
                                fontSize: 16,
                                fontWeight: 700,
                                cursor: pendingTicker && pendingAge ? "pointer" : "not-allowed",
                                width: "100%",
                                maxWidth: 360,
                            }}
                        >
                            Get my verdict →
                        </button>
                    </div>
                )}

                {/* Result panel — hidden entirely until a run has actually
                    been confirmed via Get my verdict (or arrived via an
                    explicit deep link). Avoids showing an empty 400px white
                    placeholder card before the user has picked anything. */}
                {hasRunOnce && (
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
                        <div style={{ padding: 60, textAlign: "center" }} data-testid="kids-loading">
                            <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
                            {jobState ? (
                                <>
                                    <p
                                        data-testid="kids-job-headline"
                                        style={{ marginTop: 16, fontWeight: 700, fontSize: 16 }}
                                    >
                                        🧠 Cooking up a fresh verdict for {jobState.ticker}…
                                    </p>
                                    <p
                                        data-testid="kids-job-stage"
                                        style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}
                                    >
                                        {jobState.stage_label || "Thinking…"}
                                    </p>
                                    <p style={{ marginTop: 14, opacity: 0.5, fontSize: 12, lineHeight: 1.5 }}>
                                        First look at this stock — usually about 30 seconds.
                                        <br />Hang tight!
                                    </p>
                                </>
                            ) : (
                                <p style={{ marginTop: 16, opacity: 0.6 }}>Asking the AI to think it over…</p>
                            )}
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
                                {verdictDate && (
                                    <p
                                        data-testid="kids-verdict-date"
                                        style={{
                                            marginTop: 4,
                                            fontSize: 11,
                                            opacity: 0.55,
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                        }}
                                    >
                                        <Calendar size={11} /> Updated {formatVerdictDate(verdictDate)}
                                    </p>
                                )}
                                {verdictDate && !loading && (
                                    <div>
                                        <button
                                            type="button"
                                            onClick={getFreshTake}
                                            data-testid="kids-get-fresh-take"
                                            title="This may be reused from an earlier check — tap for a brand-new one"
                                            style={{
                                                marginTop: 4,
                                                background: "transparent",
                                                border: "none",
                                                color: "inherit",
                                                opacity: 0.7,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                textDecoration: "underline",
                                                cursor: "pointer",
                                                padding: 0,
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 4,
                                            }}
                                        >
                                            <RefreshCw size={11} /> Get a fresh take
                                        </button>
                                    </div>
                                )}
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
                )}

                {/* Save as PDF — kid-friendly, age-aware export */}
                {!loading && kv && !error && (
                    <div
                        data-testid="kids-pdf-block"
                        style={{
                            marginTop: 18,
                            padding: "16px 18px",
                            background: "#fff",
                            border: "2px solid #e5d5b8",
                            borderRadius: 16,
                            display: "flex",
                            gap: 14,
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 220 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 2 }}>
                                Save this verdict
                            </p>
                            <p style={{ fontSize: 12, color: "#2c2c4a", opacity: 0.7, lineHeight: 1.5 }}>
                                One-page PDF tuned for ages <strong>{age}</strong> — bigger fonts for younger readers,
                                more compact for teens. Great for school projects or fridge-door reading.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={exportPDF}
                            data-testid="kids-pdf-button"
                            style={{
                                background: "#ff7676",
                                color: "#fff",
                                border: "none",
                                borderRadius: 16,
                                padding: "12px 20px",
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                whiteSpace: "nowrap",
                            }}
                        >
                            <Download size={16} /> Save as PDF
                        </button>
                    </div>
                )}

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
                    <br />KidStocks is a NeuLab Inc. preview — Phase Zero pilot.
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
