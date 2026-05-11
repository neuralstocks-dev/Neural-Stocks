/**
 * OnboardingWizard — single-screen 3-step flow for fresh signups.
 *
 *   Step 1: pick up to 3 starter tickers (US + IDX presets)
 *   Step 2: add to watchlist + run their first AI analysis (live progress)
 *   Step 3: show verdict ring + plain-English summary + "explore" CTA
 *
 * Trigger: DashboardPage auto-opens this when the user has 0 watchlist
 * AND 0 analyses_this_week AND no localStorage dismiss flag. Manual
 * dismiss / completion both persist `sai_onboarding_completed_v1=1`.
 *
 * No new backend endpoints — uses POST /api/watchlist + POST
 * /api/analysis/{ticker}/start + GET /api/analysis/jobs/:id polling.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { track, newSessionId } from "@/lib/telemetry";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Sparkles,
    Check,
    Loader2,
    ArrowRight,
    X,
    TrendingUp,
    AlertTriangle,
} from "lucide-react";

const STORAGE_KEY = "sai_onboarding_completed_v1";

// Curated starter set — globally recognisable + diverse sectors. IDX
// presets are the same blue-chip picks that appear on the public landing
// trending strip, so the visitor experiences continuity.
const PRESETS = {
    us: [
        { ticker: "AAPL", name: "Apple", note: "Consumer · iPhone maker" },
        { ticker: "NVDA", name: "NVIDIA", note: "Semis · AI poster child" },
        { ticker: "TSLA", name: "Tesla", note: "Auto · EV + energy" },
        { ticker: "MSFT", name: "Microsoft", note: "Software · cloud + AI" },
    ],
    idx: [
        { ticker: "BBCA.JK", name: "Bank Central Asia", note: "Largest IDX bank" },
        { ticker: "BBRI.JK", name: "Bank Rakyat Indonesia", note: "State bank · MSME focus" },
        { ticker: "GOTO.JK", name: "GoTo Group", note: "Tech · ride-hailing + payments" },
        { ticker: "ANTM.JK", name: "Aneka Tambang", note: "Mining · gold + nickel" },
    ],
};

const MAX_PICKS = 3;

function isCompleted() {
    if (typeof window === "undefined") return true;
    try {
        return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return true;
    }
}

function markCompleted() {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, "1");
    } catch {
        /* private mode — ignore */
    }
}

// ---------- step components ----------

function StepIndicator({ current }) {
    return (
        <div className="flex items-center gap-2 mb-6" data-testid="onboarding-steps">
            {[1, 2, 3].map((n) => (
                <React.Fragment key={n}>
                    <div
                        className="flex items-center justify-center font-mono text-[11px]"
                        style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            border:
                                "1px solid " +
                                (n <= current ? "hsl(var(--hold))" : "hsl(var(--border-default))"),
                            color:
                                n < current
                                    ? "hsl(var(--background))"
                                    : n === current
                                    ? "hsl(var(--hold))"
                                    : "hsl(var(--text-muted))",
                            background: n < current ? "hsl(var(--hold))" : "transparent",
                        }}
                    >
                        {n < current ? <Check size={12} strokeWidth={2.5} /> : n}
                    </div>
                    {n !== 3 && (
                        <div
                            className="flex-1 h-px"
                            style={{
                                background:
                                    n < current
                                        ? "hsl(var(--hold))"
                                        : "hsl(var(--border-default))",
                            }}
                        />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

function PresetGrid({ presets, picks, onToggle, region }) {
    return (
        <div data-testid={`onboarding-region-${region}`}>
            <p
                className="text-overline mb-2"
                style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}
            >
                {region === "us" ? "United States · NASDAQ / NYSE" : "Indonesia · IDX"}
            </p>
            <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => {
                    const selected = picks.includes(p.ticker);
                    const max = picks.length >= MAX_PICKS;
                    const disabled = !selected && max;
                    return (
                        <button
                            key={p.ticker}
                            type="button"
                            onClick={() => onToggle(p.ticker)}
                            disabled={disabled}
                            className="text-left p-3 transition-all"
                            style={{
                                border:
                                    "1px solid " +
                                    (selected ? "hsl(var(--buy))" : "hsl(var(--border-default))"),
                                background: selected
                                    ? "hsl(var(--surface-elevated))"
                                    : "transparent",
                                borderRadius: 2,
                                cursor: disabled ? "not-allowed" : "pointer",
                                opacity: disabled ? 0.4 : 1,
                            }}
                            data-testid={`onboarding-preset-${p.ticker}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-sm" style={{ letterSpacing: "0.02em" }}>
                                    {p.ticker}
                                </span>
                                {selected && (
                                    <Check
                                        size={14}
                                        strokeWidth={2}
                                        style={{ color: "hsl(var(--buy))" }}
                                    />
                                )}
                            </div>
                            <p
                                className="text-xs mt-1"
                                style={{ color: "hsl(var(--text-primary))" }}
                            >
                                {p.name}
                            </p>
                            <p
                                className="text-[11px] mt-0.5"
                                style={{ color: "hsl(var(--text-muted))" }}
                            >
                                {p.note}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Step1Picks({ picks, setPicks, accepted, setAccepted, onNext, onClose }) {
    const togglePick = (t) => {
        setPicks((prev) =>
            prev.includes(t)
                ? prev.filter((x) => x !== t)
                : prev.length >= MAX_PICKS
                ? prev
                : [...prev, t]
        );
    };

    const canContinue = picks.length > 0 && accepted;

    return (
        <div data-testid="onboarding-step-1">
            <p className="text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                Pick <strong style={{ color: "hsl(var(--text-primary))" }}>up to {MAX_PICKS}</strong>{" "}
                stocks you'd like to track. We'll add them to your watchlist and run a free AI
                verdict on the first one — your fastest tour of how Neural Stock Intelligence™ actually works.
            </p>
            <div className="mt-5 space-y-5">
                <PresetGrid
                    presets={PRESETS.us}
                    picks={picks}
                    onToggle={togglePick}
                    region="us"
                />
                <PresetGrid
                    presets={PRESETS.idx}
                    picks={picks}
                    onToggle={togglePick}
                    region="idx"
                />
            </div>

            {/* Disclaimer gate — required before any AI analysis can run. */}
            <label
                className="mt-5 flex items-start gap-2.5 cursor-pointer text-xs"
                style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                data-testid="onboarding-disclaimer-row"
            >
                <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 shrink-0"
                    data-testid="onboarding-disclaimer-checkbox"
                />
                <span>
                    I understand Neural Stock Intelligence™'s AI verdicts are <strong>research and education</strong>,{" "}
                    not financial advice. Markets are unpredictable; the AI can be wrong. I'm
                    responsible for my own decisions.
                </span>
            </label>

            <div className="mt-5 flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="text-overline link-underline"
                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                    data-testid="onboarding-skip"
                >
                    Skip for now
                </button>
                <button
                    type="button"
                    disabled={!canContinue}
                    onClick={onNext}
                    className="btn-primary inline-flex items-center gap-2"
                    style={{
                        cursor: canContinue ? "pointer" : "not-allowed",
                        opacity: canContinue ? 1 : 0.45,
                    }}
                    data-testid="onboarding-step1-next"
                >
                    {picks.length === 0
                        ? "Pick at least 1 stock"
                        : `Continue with ${picks.length} ${picks.length === 1 ? "stock" : "stocks"}`}
                    <ArrowRight size={14} strokeWidth={1.8} />
                </button>
            </div>
        </div>
    );
}

function Step2Run({ picks, onComplete, onError }) {
    const [progress, setProgress] = useState({ phase: "starting", label: "Adding to watchlist…" });

    useEffect(() => {
        let cancelled = false;
        let pollHandle = null;

        const run = async () => {
            try {
                // 1. Add all selected tickers to watchlist (parallel — server is
                // idempotent and rejects duplicates with a 400 we ignore).
                setProgress({ phase: "watchlist", label: "Adding to watchlist…" });
                await Promise.allSettled(
                    picks.map((t) => api.post("/watchlist", { ticker: t }))
                );
                if (cancelled) return;

                // 2. Start an AI analysis on the FIRST ticker — that's the one
                // we'll show the verdict for. The other 2 stay in the watchlist
                // for the user to analyze themselves later.
                const targetTicker = picks[0];
                setProgress({
                    phase: "starting",
                    label: `Starting analysis on ${targetTicker}…`,
                });
                const startRes = await api.post(
                    `/analysis/${targetTicker}/start?mode=hybrid`
                );
                const jobId = startRes.data?.job_id;
                if (!jobId) throw new Error("No job id returned");
                if (cancelled) return;

                // 3. Poll. The pipeline runs against the same 240s
                // server-side job budget the backend enforces — so the
                // wizard's hard stop must NEVER fire before that, otherwise
                // we show a scary error to a brand-new user even when the
                // analysis is genuinely about to land. Two key lessons
                // from the May 2026 production incident
                // (rhendamukti@googlemail.com, screenshot timestamp
                // 8:49pm Sun 3 May): (a) when Anthropic is degraded,
                // ONE failed attempt eats ~60s before the chain rotates
                // to Gemini; (b) Gemini then takes another ~30s for the
                // actual response, so a HEALTHY run during a degraded
                // window is 90-105s — right at the previous 90s
                // ceiling. We now use 210s here (slightly under the
                // 240s server budget so the server can return a clean
                // failure status before our hard stop), and we keep
                // polling without showing ANY warning until 90s — the
                // first 90s is the happy-path window where most calls
                // land.
                const WIZARD_HARD_STOP_S = 210;
                const WIZARD_SOFT_NOTICE_S = 90;
                const startedAt = Date.now();
                const phases = ["Fetching market data", "Running candlestick scan", "Asking Claude", "Composing verdict"];
                let phaseIdx = 0;
                let softNoticeShown = false;
                let consecutiveErrors = 0;
                const MAX_CONSECUTIVE_POLL_ERRORS = 5;
                const pollOnce = async () => {
                    let r;
                    try {
                        r = await api.get(`/analysis/jobs/${jobId}`);
                        consecutiveErrors = 0;
                    } catch (e) {
                        const status = e?.response?.status;
                        // Auth / not-found problems are real — bail out.
                        if (cancelled) return;
                        if (status === 401 || status === 403 || status === 404) {
                            onError(e?.response?.data?.detail || e?.message || "Analysis failed");
                            return;
                        }
                        // Tolerate transient 5xx / network blips — the BG
                        // job keeps running on the server.
                        consecutiveErrors += 1;
                        if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
                            onError(e?.response?.data?.detail || e?.message || "Analysis failed");
                            return;
                        }
                        pollHandle = setTimeout(pollOnce, 2000);
                        return;
                    }
                    try {
                        const status = r.data?.status;
                        if (cancelled) return;
                        if (status === "done" && r.data?.result) {
                            onComplete({ ticker: targetTicker, result: r.data.result });
                            return;
                        }
                        if (status === "failed") {
                            throw new Error(r.data?.error || "Analysis failed");
                        }
                        // Bump label every ~10s for visual liveliness.
                        const elapsed = (Date.now() - startedAt) / 1000;
                        const newPhaseIdx = Math.min(phases.length - 1, Math.floor(elapsed / 10));
                        if (newPhaseIdx !== phaseIdx) {
                            phaseIdx = newPhaseIdx;
                            setProgress({ phase: "running", label: phases[phaseIdx] + "…" });
                        }
                        // Past the soft-notice threshold? Tell the user
                        // honestly that this run is on the slower side
                        // — but DON'T show an error. The job is still
                        // running; we're still polling. The reassuring
                        // tone matters more than anything here because
                        // a brand-new user is watching this exact
                        // moment decide whether they trust the product.
                        if (elapsed > WIZARD_SOFT_NOTICE_S && !softNoticeShown) {
                            softNoticeShown = true;
                            setProgress({
                                phase: "running-slow",
                                label: "Still working — sometimes the AI takes a moment, hang tight…",
                            });
                        }
                        if (elapsed > WIZARD_HARD_STOP_S) {
                            // Server's own 240s job budget will land a
                            // `failed` status shortly; we hard-stop
                            // slightly before that so the wizard
                            // doesn't appear frozen.
                            throw new Error("This run is taking longer than usual — your watchlist is saved. Close this and check the dashboard in a minute; the verdict will appear there as soon as it lands.");
                        }
                        pollHandle = setTimeout(pollOnce, 2000);
                    } catch (e) {
                        if (!cancelled) onError(e?.response?.data?.detail || e?.message || "Analysis failed");
                    }
                };
                pollOnce();
            } catch (e) {
                if (!cancelled) onError(e?.response?.data?.detail || e?.message || "Couldn't start onboarding");
            }
        };

        run();
        return () => {
            cancelled = true;
            if (pollHandle) clearTimeout(pollHandle);
        };
    }, [picks, onComplete, onError]);

    return (
        <div data-testid="onboarding-step-2" className="text-center py-6">
            <div className="inline-flex items-center justify-center mb-4" style={{ width: 48, height: 48 }}>
                <Loader2
                    className="animate-spin"
                    size={36}
                    strokeWidth={1.4}
                    style={{ color: "hsl(var(--hold))" }}
                />
            </div>
            <p className="font-serif text-lg" style={{ letterSpacing: "-0.005em" }}>
                Setting up your dashboard
            </p>
            <p
                className="text-sm mt-2 font-mono"
                style={{ color: "hsl(var(--text-muted))", fontSize: "0.78rem" }}
                data-testid="onboarding-step2-label"
            >
                {progress.label}
            </p>
            <p
                className="text-xs mt-6 max-w-sm mx-auto"
                style={{ color: "hsl(var(--text-muted))" }}
            >
                A typical AI verdict takes 20 to 60 seconds. We'll show the result the moment it
                lands.
            </p>
        </div>
    );
}

function VerdictRingMini({ signal, confidence }) {
    const color =
        signal === "BUY"
            ? "hsl(var(--buy))"
            : signal === "SELL"
            ? "hsl(var(--sell))"
            : "hsl(var(--hold))";
    return (
        <div
            className="inline-flex items-center justify-center font-mono"
            style={{
                width: 110,
                height: 110,
                border: "3px solid " + color,
                borderRadius: 999,
                color,
                flexDirection: "column",
            }}
            data-testid="onboarding-verdict-ring"
        >
            <div style={{ fontSize: "0.66rem", letterSpacing: "0.18em" }}>{signal}</div>
            <div className="font-serif" style={{ fontSize: "1.7rem", lineHeight: 1.05 }}>
                {Math.round((confidence ?? 0) * 100) || "—"}%
            </div>
        </div>
    );
}

function Step3Reveal({ ticker, result, onClose, onExplore }) {
    const signal = (result?.recommendation || "HOLD").toUpperCase();
    // Backend returns confidence_score in the 0-100 range (or 0-1 in some
    // schemas). Normalise to a 0-1 fraction the ring component expects.
    let confidenceFraction = 0;
    const raw = result?.confidence_score ?? result?.confidence ?? result?.signal_confidence;
    if (typeof raw === "number") {
        confidenceFraction = raw > 1 ? raw / 100 : raw;
    }

    // Backend returns time_horizon_weeks (number); translate to a friendly label.
    const weeks = result?.time_horizon_weeks;
    let horizonLabel = "Medium-term";
    if (typeof weeks === "number") {
        if (weeks <= 4) horizonLabel = "Short-term";
        else if (weeks <= 16) horizonLabel = "Medium-term";
        else horizonLabel = "Long-term";
    }

    // Try the most plausible "summary" fields in order. Real schema has
    // executive_summary; older verdicts may have summary or rationale.
    const why =
        result?.executive_summary ||
        result?.summary ||
        result?.thesis_summary ||
        result?.rationale ||
        result?.reasoning ||
        "Open the full report to see the AI's reasoning.";

    const goToReport = () => {
        markCompleted();
        onExplore?.();
    };

    return (
        <div data-testid="onboarding-step-3" className="text-center py-2">
            <p
                className="text-overline"
                style={{ color: "hsl(var(--buy))", fontSize: "0.6rem" }}
            >
                <Sparkles size={11} strokeWidth={2} className="inline mr-1" /> First verdict
            </p>
            <h3
                className="font-serif mt-3"
                style={{ fontSize: "clamp(1.4rem, 3vw, 1.8rem)", letterSpacing: "-0.01em" }}
            >
                {ticker}
            </h3>
            <div className="mt-5">
                <VerdictRingMini signal={signal} confidence={confidenceFraction} />
            </div>
            <p
                className="text-overline mt-4"
                style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}
            >
                Horizon · {horizonLabel.toUpperCase()}
                {typeof weeks === "number" ? ` · ${weeks}w` : ""}
            </p>
            <p
                className="text-sm mt-4 max-w-md mx-auto leading-relaxed text-left"
                style={{ color: "hsl(var(--text-secondary))" }}
                data-testid="onboarding-step3-why"
            >
                {String(why).slice(0, 320)}
                {String(why).length > 320 ? "…" : ""}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={goToReport}
                    className="btn-primary inline-flex items-center gap-2"
                    data-testid="onboarding-step3-explore"
                >
                    Open the full report
                    <ArrowRight size={14} strokeWidth={1.8} />
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="btn-ghost"
                    data-testid="onboarding-step3-close"
                >
                    Back to dashboard
                </button>
            </div>
            <p
                className="text-[11px] mt-5"
                style={{ color: "hsl(var(--text-muted))" }}
            >
                Tip: the 4 other modules (Pattern Scan, RF Second Opinion, Risks, Score Card) live
                on the report page.
            </p>
        </div>
    );
}

// ---------- top-level wizard ----------

export default function OnboardingWizard({ open, onClose, onWatchlistChanged }) {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [picks, setPicks] = useState([]);
    const [accepted, setAccepted] = useState(false);
    const [verdict, setVerdict] = useState(null);
    const [error, setError] = useState("");
    // Per-mount funnel session — one wizard mount = one session_id, so
    // every event from this open→close pass groups together server-side
    // for the funnel aggregation.
    const [sessionId] = useState(newSessionId);
    // Wall-clock at first mount — the 30-second goal is measured from
    // here to wizard_step2_complete. Stored in a ref-like state for
    // cheap reads inside event handlers (state value is immutable so
    // closures stay correct).
    const [openedAtMs] = useState(() => Date.now());

    // Fire `wizard_opened` exactly once, the first time the modal is
    // mounted with `open=true`. Subsequent toggles in the same mount
    // (rare — dashboard does mount→unmount, not toggle) don't re-fire.
    useEffect(() => {
        if (open) {
            track("wizard_opened", {}, sessionId);
        }
        // sessionId is stable per mount, intentionally only depend on open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleClose = () => {
        // Clicking close at any step counts as "completed" — we don't want to
        // re-pop the modal forever just because they didn't pick stocks.
        markCompleted();
        // Step 3 closures are tracked separately by Step3Reveal so we can
        // distinguish "explored" vs "closed at verdict". Earlier-stage
        // closures are funnel drop-offs.
        if (step !== 3) {
            track("wizard_dismissed_early", {
                step,
                elapsed_ms: Date.now() - openedAtMs,
            }, sessionId);
        }
        onClose?.();
    };

    const handleStep1Next = async () => {
        setError("");
        // Persist disclaimer acceptance BEFORE attempting the analysis call,
        // otherwise step 2 would crash on the 428 disclaimer_required gate.
        // The endpoint is idempotent — safe to retry.
        try {
            await api.post("/disclaimer/accept");
        } catch (e) {
            setError(e?.response?.data?.detail || "Couldn't save your acknowledgment. Please try again.");
            return;
        }
        track("wizard_step1_next", {
            picks_count: picks.length,
            has_idx: picks.some((t) => t.endsWith(".JK")),
            has_us: picks.some((t) => !t.endsWith(".JK")),
            elapsed_ms: Date.now() - openedAtMs,
        }, sessionId);
        setStep(2);
    };

    const handleStep2Complete = (payload) => {
        setVerdict(payload);
        track("wizard_step2_complete", {
            ticker: payload?.ticker,
            elapsed_ms: Date.now() - openedAtMs,
        }, sessionId);
        // The watchlist + first analysis already landed on the server. Tell
        // the parent so it can refetch its watchlist + quota counters.
        onWatchlistChanged?.();
        setStep(3);
    };

    const handleStep2Error = (msg) => {
        setError(msg);
        track("wizard_step2_error", {
            error: typeof msg === "string" ? msg.slice(0, 180) : "unknown",
            elapsed_ms: Date.now() - openedAtMs,
        }, sessionId);
        // Soft-fail: keep modal open so user sees the error and can retry/skip.
    };

    const handleStep3Explore = () => {
        track("wizard_step3_explore", {
            elapsed_ms: Date.now() - openedAtMs,
            ticker: verdict?.ticker,
        }, sessionId);
        markCompleted();
        const t = verdict?.ticker;
        onClose?.();
        if (t) navigate(`/analysis/${encodeURIComponent(t)}`);
    };

    const handleStep3Close = () => {
        track("wizard_step3_close", {
            elapsed_ms: Date.now() - openedAtMs,
        }, sessionId);
        markCompleted();
        onClose?.();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <DialogContent
                className="max-w-lg"
                data-testid="onboarding-wizard"
                style={{
                    background: "hsl(var(--background))",
                    // Constrain to viewport on mobile so the CTA never falls off.
                    // 100svh handles iOS Safari's address-bar shrinking quirk.
                    maxHeight: "min(90vh, 100svh - 32px)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    padding: 0,
                }}
            >
                <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close"
                    className="absolute right-3 top-3 p-1.5 transition-opacity"
                    style={{ color: "hsl(var(--text-muted))", opacity: 0.7, zIndex: 2 }}
                    data-testid="onboarding-close"
                >
                    <X size={16} strokeWidth={1.8} />
                </button>

                {/* Pinned header — title + step indicator stay visible while
                    the long stock-grid scrolls below on small screens. */}
                <div style={{ flexShrink: 0, padding: "24px 24px 12px" }}>
                    <DialogTitle className="font-serif text-xl">
                        {step === 1 && "Welcome to Neural Stock Intelligence™"}
                        {step === 2 && "Hold tight…"}
                        {step === 3 && "Your first verdict"}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Three-step onboarding wizard: pick starter tickers, run your first analysis,
                        review the verdict.
                    </DialogDescription>
                    <div className="mt-4">
                        <StepIndicator current={step} />
                    </div>
                </div>

                {/* Scrollable body — the picks + disclaimer + actions live here.
                    On iPhone 16 portrait this means the long IDX preset grid can
                    scroll while the user never loses sight of the dialog frame. */}
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        WebkitOverflowScrolling: "touch",
                        padding: "0 24px 24px",
                    }}
                    data-testid="onboarding-scroll-body"
                >
                    {error && (
                        <div
                            className="signal-sell px-3 py-2 mb-3 text-sm flex items-start gap-2"
                            data-testid="onboarding-error"
                        >
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
                        </div>
                    )}

                    {step === 1 && (
                        <Step1Picks
                            picks={picks}
                            setPicks={setPicks}
                            accepted={accepted}
                            setAccepted={setAccepted}
                            onClose={handleClose}
                            onNext={handleStep1Next}
                        />
                    )}
                    {step === 2 && (
                        <Step2Run
                            picks={picks}
                            onComplete={handleStep2Complete}
                            onError={handleStep2Error}
                        />
                    )}
                    {step === 3 && verdict && (
                        <Step3Reveal
                            ticker={verdict.ticker}
                            result={verdict.result}
                            onClose={handleStep3Close}
                            onExplore={handleStep3Explore}
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export { isCompleted as isOnboardingCompleted, markCompleted as markOnboardingCompleted };
