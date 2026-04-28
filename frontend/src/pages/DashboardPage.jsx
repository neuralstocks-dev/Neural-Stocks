import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AddStockModal from "@/components/AddStockModal";
import TimelineFitModal from "@/components/TimelineFitModal";
import Sparkline from "@/components/Sparkline";
import SignalBadge from "@/components/SignalBadge";
import QuickAnalyzeProgress from "@/components/QuickAnalyzeProgress";
import AnalysisQueueChip from "@/components/AnalysisQueueChip";
import LlmHealthBadge from "@/components/LlmHealthBadge";
import LLMBudgetBanner from "@/components/LLMBudgetBanner";
import TopConfluencesModule from "@/components/TopConfluencesModule";

// Tiny mirror of the detection logic in LLMBudgetBanner so the parent
// can hide its generic red string when the friendly banner is taking
// over. Kept in sync intentionally — same simple matcher.
function _isBudgetError(payload) {
    if (!payload) return false;
    if (typeof payload === "string") {
        const s = payload.toLowerCase();
        return (
            s.includes("budget exceeded") ||
            s.includes("budget has been exceeded") ||
            s.includes("llm budget") ||
            s.includes("top up your") ||
            s.includes("insufficient credit")
        );
    }
    if (typeof payload === "object") {
        if (payload.error_code === "llm_budget_exceeded") return true;
        return _isBudgetError(payload.message);
    }
    return false;
}
import TestUnlockBanner from "@/components/TestUnlockBanner";
import FirstTimeManualPill from "@/components/FirstTimeManualPill";
import OnboardingWizard, { isOnboardingCompleted } from "@/components/OnboardingWizard";
import DisclaimerModal, { useDisclaimer } from "@/components/DisclaimerModal";
import AnalysisModeSelector from "@/components/AnalysisModeSelector";
import LiveDeskGuide from "@/components/LiveDeskGuide";
import IdxTopPicksDialog from "@/components/IdxTopPicksDialog";
import TrendingOnNeulabWidget from "@/components/TrendingOnNeulabWidget";
import { useAuth } from "@/hooks/useAuth";
import { formatPrice, formatPct, timeAgo } from "@/lib/format";
import { pollAnalysisJob, formatAnalysisTimestamp } from "@/lib/analysisPolling";
import { errMessage } from "@/lib/errors";
import {
    ArrowUpRight,
    Bell,
    Plus,
    RefreshCw,
    Sparkles,
    Trash2,
    TrendingDown,
    TrendingUp,
    Loader2,
    Lock,
    Clock,
    Zap,
} from "lucide-react";

// Same phase labels used by the Re-analyze stepper. We surface only the
// CURRENT phase as a single pill on the dashboard row (full stepper would
// blow out the row width on mobile). Kept in lock-step with the labels in
// AnalysisProgressStepper.jsx so the user sees consistent phase names
// across both surfaces.
const WATCHLIST_PHASE_LABELS = {
    queued: "Queued",
    fetching_data: "Fetching data",
    computing_technicals: "Technicals",
    scanning_patterns: "Patterns",
    llm_thinking: "LLM verdict",
    rf_scoring: "RF score",
    calibrating: "Calibrating",
};

function WatchlistRow({ item, sparkline, onRemove, onAnalyze, onTimeline, analyzing, analyzingPhase, failed, failedMsg, canTimeline, revealed }) {
    const q = item.quote || {};    const up = (q.change_pct ?? 0) >= 0;
    return (
        <div
            className={`rise-in grid grid-cols-12 items-center gap-2 py-5 md:py-6 px-4 md:px-6 group${revealed ? " verdict-revealed" : ""}`}
            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            data-testid={`watchlist-card-${item.ticker}`}
        >
            <div className="col-span-12 md:col-span-3 flex items-center gap-3">
                <div>
                    <div className="font-mono text-lg font-medium tracking-tight">{item.ticker}</div>
                    <div className="text-xs text-[hsl(var(--text-secondary))] mt-0.5 line-clamp-1">
                        {item.name || "—"}
                    </div>
                    <span
                        className="text-overline mt-1 inline-block"
                        style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                    >
                        {item.category || "other"}
                    </span>
                </div>
            </div>

            <div className="col-span-6 md:col-span-3">
                <div className="font-mono text-2xl md:text-[1.75rem] leading-none hero-number">
                    {q.price != null ? formatPrice(q.price, q.currency) : "—"}
                </div>
                <div
                    className="flex items-center gap-1 mt-1 font-mono text-xs"
                    style={{ color: up ? "hsl(var(--buy))" : "hsl(var(--sell))" }}
                >
                    {up ? (
                        <TrendingUp size={12} strokeWidth={1.75} />
                    ) : (
                        <TrendingDown size={12} strokeWidth={1.75} />
                    )}
                    {q.change != null ? `${up ? "+" : ""}${q.change.toFixed(2)}` : "—"}
                    <span className="opacity-70 ml-1">
                        {q.change_pct != null ? formatPct(q.change_pct) : ""}
                    </span>
                </div>
            </div>

            <div className="hidden md:flex md:col-span-3 items-center">
                <Sparkline data={sparkline} width={180} height={38} color="trend" />
            </div>

            <div className="col-span-3 md:col-span-2 min-w-0 overflow-hidden">
                {item.latest_analysis?.recommendation ? (
                    <div
                        className="relative"
                        data-testid={`verdict-cell-${item.ticker}`}
                        // No interactive children in this subtree (SignalBadge,
                        // conf text, refreshing-pill overlay all non-clickable).
                        // Disable pointer events so this cell never intercepts
                        // clicks meant for the sibling action-buttons column.
                        style={{ pointerEvents: "none" }}
                    >
                        <div
                            className="min-w-0"
                            style={{
                                opacity: analyzing ? 0.4 : 1,
                                transition: "opacity 200ms ease-out",
                            }}
                        >
                            <SignalBadge signal={item.latest_analysis.recommendation} />
                            <div
                                className="text-overline mt-1"
                                style={{ fontSize: "0.56rem" }}
                                title={formatAnalysisTimestamp(item.latest_analysis.created_at, { noRelative: true })}
                            >
                                {item.latest_analysis.confidence_score}% conf · {timeAgo(item.latest_analysis.created_at)}
                            </div>
                        </div>
                        {analyzing && (
                            <div
                                className="absolute inset-0 flex items-center justify-start pointer-events-none"
                                data-testid={`refreshing-pill-${item.ticker}`}
                            >
                                <span
                                    className="font-mono text-[10px] inline-flex items-center gap-1.5 px-2 py-1 refreshing-pill"
                                    style={{
                                        background: "hsl(var(--surface-elevated))",
                                        color: "hsl(var(--hold))",
                                        border: "1px solid hsl(var(--hold))",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    <Loader2 size={9} strokeWidth={2} className="animate-spin" />
                                    {analyzingPhase || "Refreshing"}…
                                </span>
                            </div>
                        )}
                        {!analyzing && failed && (
                            // Re-analyse failed but the row already has a previous
                            // verdict — overlay an unmissable red failure pill so
                            // users don't think the request silently succeeded.
                            <div
                                className="absolute inset-0 flex items-center justify-start pointer-events-none"
                                data-testid={`failed-overlay-${item.ticker}`}
                            >
                                <span
                                    className="font-mono text-[10px] inline-flex items-center gap-1.5 px-2 py-1"
                                    style={{
                                        background: "hsl(var(--surface-elevated))",
                                        color: "hsl(var(--sell))",
                                        border: "1px solid hsl(var(--sell))",
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                    }}
                                >
                                    ⚠ Re-analyse failed
                                </span>
                            </div>
                        )}
                    </div>
                ) : analyzing ? (
                    <div data-testid={`analyzing-label-${item.ticker}`}>
                        <span
                            className="text-overline inline-flex items-center gap-1.5"
                            style={{ color: "hsl(var(--hold))" }}
                        >
                            <Loader2 size={10} strokeWidth={2} className="animate-spin" />
                            {analyzingPhase || "Analyzing"}…
                        </span>
                        <div
                            className="text-overline mt-1"
                            style={{ fontSize: "0.52rem", color: "hsl(var(--text-muted))" }}
                        >
                            20–60 seconds · please wait
                        </div>
                    </div>
                ) : failed ? (
                    // Row-level failure pill — surfaces the failure on the row
                    // itself instead of relying on the page-top error banner
                    // which is off-screen for users on long watchlists.
                    <div data-testid={`failed-label-${item.ticker}`}>
                        <span
                            className="text-overline inline-flex items-center gap-1.5"
                            style={{ color: "hsl(var(--sell))" }}
                        >
                            ⚠ Analysis failed
                        </span>
                        <div
                            className="text-[10px] mt-1 leading-snug"
                            style={{ color: "hsl(var(--text-secondary))" }}
                        >
                            {failedMsg && failedMsg.length > 90
                                ? failedMsg.slice(0, 87) + "…"
                                : failedMsg || "Tap retry below"}
                        </div>
                    </div>
                ) : (
                    <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                        No analysis
                    </span>
                )}
            </div>

            <div className="col-span-3 md:col-span-1 flex items-center justify-end gap-1">
                <button
                    onClick={() => onAnalyze(item.ticker)}
                    className="btn-ghost !py-1.5 !px-2 !text-xs"
                    title="Analyze now"
                    disabled={analyzing}
                    data-testid={`analyze-${item.ticker}-button`}
                >
                    {/* No spinner here — the row already shows an "Analyzing… · {phase}"
                        pill in the verdict column. Two synchronised spinners on the same
                        row was reported as confusing on mobile. The disabled state is
                        enough visual feedback. */}
                    <Sparkles
                        size={12}
                        strokeWidth={1.5}
                        style={{ opacity: analyzing ? 0.35 : 1 }}
                    />
                </button>
                <button
                    onClick={() => onTimeline(item.ticker)}
                    className="btn-ghost !py-1.5 !px-2 !text-xs"
                    title={canTimeline ? "Timeline Fit (Pro/Elite)" : "Timeline Fit — Pro/Elite only"}
                    disabled={!canTimeline}
                    style={{
                        opacity: canTimeline ? 1 : 0.5,
                        color: canTimeline ? "hsl(var(--hold))" : undefined,
                    }}
                    data-testid={`timeline-${item.ticker}-button`}
                >
                    {canTimeline ? (
                        <Clock size={12} strokeWidth={1.5} />
                    ) : (
                        <Lock size={12} strokeWidth={1.5} />
                    )}
                </button>
                <Link
                    to={`/analysis/${item.ticker}?autorun=1`}
                    className="btn-ghost !py-1.5 !px-2 !text-xs"
                    title="View details · auto-runs analysis if none yet"
                    data-testid={`view-${item.ticker}-button`}
                >
                    <ArrowUpRight size={12} strokeWidth={1.5} />
                </Link>
                <button
                    onClick={() => onRemove(item.ticker)}
                    className="btn-ghost !py-1.5 !px-2 !text-xs opacity-60 hover:opacity-100"
                    title="Remove"
                    data-testid={`remove-${item.ticker}-button`}
                >
                    <Trash2 size={12} strokeWidth={1.5} />
                </button>
            </div>
        </div>
    );
}

/**
 * ConfidenceDot — personalized "Neulab confidence" indicator for an
 * alert based on the user's historical win-rate with that alert type.
 *
 *  · GREEN  — ≥60% win rate AND ≥3 decisive trades   → "high confidence"
 *  · AMBER  — 45–60% win rate AND ≥3 decisive trades → "mixed track record"
 *  · RED    — <45% win rate AND ≥3 decisive trades    → "low historical hit-rate"
 *  · GREY   — <3 decisive (win+loss) trades resolved → "not enough data yet"
 *
 * Tooltip shown via native `title` attribute so it works on all devices
 * without extra dependencies. Click-through is intentionally not wired —
 * the row itself already links to the analysis page.
 */
function ConfidenceDot({ alertType, stats }) {
    const typeStat = stats?.by_type?.[alertType];
    const channelLabel = {
        signal: "AI Verdict",
        pattern: "Pattern Scan",
        rf_watchlist_scan: "RF Auto-Scan",
    }[alertType] || "Signal";

    let color = "hsl(var(--text-muted))";
    let tooltip;

    if (!typeStat || (typeStat.wins + typeStat.losses) < 3) {
        color = "hsl(var(--text-muted))";
        const taken = typeStat?.taken ?? 0;
        tooltip = taken === 0
            ? `${channelLabel}: no trades taken yet — mark alerts as taken on /alerts to start your personal track record.`
            : `${channelLabel}: ${taken} taken, ${typeStat.resolved} resolved. Need 3+ resolved trades before confidence scores show.`;
    } else {
        const wr = typeStat.win_rate_pct;
        if (wr >= 60) {
            color = "hsl(var(--buy))";
            tooltip = `${channelLabel}: you're ${wr}% on this channel — high confidence, follow the signal.`;
        } else if (wr >= 45) {
            color = "hsl(var(--hold))";
            tooltip = `${channelLabel}: ${wr}% historical hit-rate for you — mixed. Confirm with a full analysis before acting.`;
        } else {
            color = "hsl(var(--sell))";
            tooltip = `${channelLabel}: only ${wr}% historical hit-rate for you — cross-check carefully before acting.`;
        }
    }

    return (
        <span
            className="inline-block"
            style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 6px ${color}66`,
                flexShrink: 0,
            }}
            title={tooltip}
            data-testid={`confidence-dot-${alertType}`}
            aria-label={tooltip}
        />
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const disclaimer = useDisclaimer();
    const [items, setItems] = useState([]);
    const [sparks, setSparks] = useState({}); // ticker -> [closes]
    const [alerts, setAlerts] = useState([]);
    const [alertStats, setAlertStats] = useState(null);
    const [quota, setQuota] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [analyzingTicker, setAnalyzingTicker] = useState(null);
    // Live phase label ("Fetching data" | "Technicals" | "Patterns" | "LLM
    // verdict" | "RF score" | "Calibrating") for the watchlist row pill.
    // Updated by pollAnalysisJob's onProgress callback so the user sees
    // exactly where in the pipeline we are — same text as the Re-analyze
    // page stepper. Mobile-friendly: just a single label, no full stepper
    // (saves horizontal space; the underlying flow is identical).
    const [analyzingPhase, setAnalyzingPhase] = useState(null);
    // Per-row last-attempt error. Critical UX: the global `actionError`
    // banner sits at the top of the page; on a long watchlist scrolled
    // down to the row the user just clicked, that banner is off-screen
    // and the failure looks silent — the row just reverts to its prior
    // verdict. We hold the error per-ticker here so the row itself can
    // surface a red pill with one-tap retry. Auto-clears on next attempt
    // OR after 12 seconds (whichever comes first).
    const [failedTicker, setFailedTicker] = useState(null);
    const [failedTickerMsg, setFailedTickerMsg] = useState("");
    const [revealedTicker, setRevealedTicker] = useState(null);
    const [quickBusy, setQuickBusy] = useState(null); // 'top' | 'bottom' | null
    // Live job state for the floating QuickAnalyzeProgress panel. Set to
    // a polled job snapshot during a Top/Bottom 3 sweep, then cleared 4s
    // after completion (or instantly on error).
    const [quickJobState, setQuickJobState] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [timelineTicker, setTimelineTicker] = useState(null);
    const [actionError, setActionError] = useState("");
    // Raw error payload (string or structured detail) for the LLM-budget
    // friendly banner detection — kept in sync with `actionError`.
    const [actionErrorRaw, setActionErrorRaw] = useState(null);

    const plan = user?.plan || "free";
    const canQuickActions = quota?.quick_actions ?? (plan !== "free");
    const watchlistLimit = quota?.watchlist_limit ?? (plan === "free" ? 3 : plan === "pro" ? 10 : 25);
    const watchlistFull = items.length >= watchlistLimit;

    // Analyze-mode is picked here and passed into every analyze call.
    // Candlestick & Hybrid are available to ALL tiers (Feb 2026 change) —
    // Hybrid is the default across the board since it produces the best verdicts.
    const [analyzeMode, setAnalyzeMode] = useState("hybrid");

    // Onboarding wizard for fresh signups. Auto-opens once when the user
    // has zero watchlist + zero analyses this week and hasn't dismissed.
    const [onboardingOpen, setOnboardingOpen] = useState(false);
    useEffect(() => {
        if (loading) return; // wait for quota + watchlist to settle
        if (isOnboardingCompleted()) return;
        const noWatchlist = items.length === 0;
        const noAnalysesThisWeek = (quota?.analyses_this_week ?? 0) === 0;
        if (noWatchlist && noAnalysesThisWeek) {
            setOnboardingOpen(true);
        }
    }, [loading, items.length, quota?.analyses_this_week]);

    const fetchWatchlist = useCallback(async () => {
        const r = await api.get("/watchlist/live");
        setItems(r.data || []);
        return r.data || [];
    }, []);

    const fetchAlerts = useCallback(async () => {
        const r = await api.get("/alerts");
        setAlerts(r.data || []);
        // Fetch scoreboard in parallel — used for per-row confidence dots.
        // Never block the alert feed on this, it's a best-effort personalization.
        api.get("/alerts/stats")
            .then((s) => setAlertStats(s.data))
            .catch((err) => console.warn("alerts stats fetch failed:", err?.message || err));
    }, []);

    const fetchQuota = useCallback(async () => {
        try {
            const r = await api.get("/quota");
            setQuota(r.data);
        } catch (err) {
            console.warn("quota fetch failed:", err?.message || err);
        }
    }, []);

    const fetchSparks = useCallback(async (tickers) => {
        const results = await Promise.all(
            tickers.map(async (t) => {
                try {
                    const r = await api.get(`/stocks/${t}/history`, {
                        params: { period: "1mo", interval: "1d" },
                    });
                    return [t, (r.data.points || []).map((p) => p.close).filter((v) => v != null)];
                } catch {
                    return [t, []];
                }
            })
        );
        setSparks(Object.fromEntries(results));
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const wl = await fetchWatchlist();
                await fetchAlerts();
                await fetchQuota();
                if (wl.length) await fetchSparks(wl.map((i) => i.ticker));
            } finally {
                setLoading(false);
            }
        })();
    }, [fetchWatchlist, fetchAlerts, fetchQuota, fetchSparks]);

    const refresh = async () => {
        setRefreshing(true);
        try {
            const wl = await fetchWatchlist();
            await fetchAlerts();
            await fetchQuota();
            if (wl.length) await fetchSparks(wl.map((i) => i.ticker));
        } finally {
            setRefreshing(false);
        }
    };

    const removeTicker = async (ticker) => {
        await api.delete(`/watchlist/${ticker}`);
        setItems((prev) => prev.filter((i) => i.ticker !== ticker));
        await fetchQuota();
    };

    const analyzeOne = async (ticker) => {
        disclaimer.ensureAccepted(async () => {
            setActionError("");
            setAnalyzingTicker(ticker);
            setAnalyzingPhase(null);
            // Clear any previous row-level error for this ticker so the
            // user doesn't see a stale red pill while we're re-attempting.
            setFailedTicker((prev) => (prev === ticker ? null : prev));
            try {
                // Mobile-resilient poller (lib/analysisPolling.js) — budget 260s,
                // visibility-aware elapsed tracking so backgrounded tabs don't
                // incorrectly conclude the job timed out. Falls through to
                // /latest with freshness validation on exhaustion.
                // The onProgress callback drives the live phase pill in the
                // watchlist row so users see "Analyzing… · LLM verdict"
                // instead of a generic "Analyzing…" — same phase labels as
                // the AnalysisProgressStepper on the Re-analyze page.
                const finalResult = await pollAnalysisJob({
                    api,
                    ticker,
                    mode: analyzeMode,
                    onProgress: (p) => {
                        const label = WATCHLIST_PHASE_LABELS[p?.phase] || null;
                        setAnalyzingPhase(label);
                    },
                });

                const freshVerdict = finalResult
                    ? {
                          recommendation: finalResult.recommendation,
                          confidence_score: finalResult.confidence_score,
                          created_at: finalResult.created_at,
                      }
                    : null;

                if (freshVerdict) {
                    setItems((prev) =>
                        prev.map((it) =>
                            it.ticker === ticker
                                ? { ...it, latest_analysis: freshVerdict }
                                : it
                        )
                    );
                    // Tiny "verdict revealed" glow on the row — pure CSS, 1.6s
                    // amber wash that fades. Clear state just beyond animation
                    // length so the class can re-trigger on the next analyze.
                    setRevealedTicker(ticker);
                    setTimeout(() => {
                        setRevealedTicker((cur) => (cur === ticker ? null : cur));
                    }, 1600);
                }

                await fetchWatchlist();
                await fetchAlerts();
                await fetchQuota();

                // Safety-net: the BG job can finish AFTER our polling window
                // closes (slow IDX tickers, queue contention, etc.). Refetch
                // /latest once more 8s later so the row converges to truth
                // even if our main flow missed the analysis insert.
                setTimeout(async () => {
                    try {
                        const r = await api.get(`/analysis/${ticker}/latest`);
                        if (r?.data?.recommendation) {
                            setItems((prev) =>
                                prev.map((it) => {
                                    if (it.ticker !== ticker) return it;
                                    const existing = it.latest_analysis;
                                    // Only overwrite if the server has a newer
                                    // analysis than what we currently show.
                                    if (
                                        existing?.created_at &&
                                        existing.created_at >= r.data.created_at
                                    ) {
                                        return it;
                                    }
                                    return {
                                        ...it,
                                        latest_analysis: {
                                            recommendation: r.data.recommendation,
                                            confidence_score: r.data.confidence_score,
                                            created_at: r.data.created_at,
                                        },
                                    };
                                })
                            );
                        }
                    } catch (_) {
                        /* best-effort — no-op on failure */
                    }
                }, 8000);
            } catch (err) {
                if (disclaimer.promptFromError(err)) return;
                const detail = err?.response?.data?.detail;
                const msg = detail || err?.message || "Analysis failed";
                const friendly = errMessage(msg, "Analysis failed");
                setActionErrorRaw(detail || err?.message || null);
                setActionError(friendly);
                // Surface the failure ON the row itself so the user
                // (likely scrolled past the page-top banner) actually
                // sees what happened. Auto-clears after 12s.
                setFailedTicker(ticker);
                setFailedTickerMsg(friendly);
                setTimeout(() => {
                    setFailedTicker((cur) => (cur === ticker ? null : cur));
                }, 12000);
            } finally {
                setAnalyzingTicker(null);
                setAnalyzingPhase(null);
            }
        });
    };

    const quickAnalyze = async (kind) => {
        if (items.length === 0) {
            setActionError("Add stocks to your watchlist first");
            return;
        }
        disclaimer.ensureAccepted(async () => {
            setActionError("");
            setQuickBusy(kind);
            // Reset live state and immediately surface the floating panel.
            // Backend updates `analyzed` (selected tickers) within ~1s, so
            // the panel transitions from "Picking the top 3…" to per-ticker
            // rows almost instantly.
            setQuickJobState({ status: "running", analyzed: [], results: [], progress: { total: 0, completed: 0, timed_out: 0, errored: 0 } });
            try {
                const start = await api.post(`/analysis/quick/${kind}`);
                const jobId = start.data.job_id;
                // Poll until done/failed or 3 minutes pass
                const started = Date.now();
                let last = null;
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    if (Date.now() - started > 180000) {
                        throw new Error("Quick sweep took too long — refresh and try again");
                    }
                    await new Promise((r) => setTimeout(r, 2500));
                    const p = await api.get(`/analysis/quick/jobs/${jobId}`);
                    last = p.data;
                    // Push the latest job snapshot to the floating panel so
                    // each newly-completed ticker animates in real-time.
                    setQuickJobState(last);
                    if (last.status === "done" || last.status === "failed") break;
                }
                if (last?.status === "failed") {
                    setActionError(errMessage(last.error, "Quick sweep failed"));
                } else {
                    const s = last?.progress || {};
                    if (s.timed_out || s.errored) {
                        setActionError(
                            `Quick sweep: ${s.completed} done, ${s.timed_out} timed out, ${s.errored} errored. Run single-ticker Analyze on any that didn't complete.`
                        );
                    }
                }
                await fetchWatchlist();
                await fetchAlerts();
                await fetchQuota();
                // Auto-dismiss the panel 4s after completion so users can
                // glance at the final state before it slides away.
                setTimeout(() => setQuickJobState(null), 4000);
            } catch (err) {
                if (disclaimer.promptFromError(err)) return;
                setActionError(errMessage(err?.response?.data?.detail, err?.message || "Quick analysis failed"));
                setQuickJobState(null);
            } finally {
                setQuickBusy(null);
            }
        });
    };

    const markAllAlertsRead = async () => {
        await api.post("/alerts/read_all");
        setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    };

    const scanPatterns = async () => {
        if (items.length === 0) {
            setActionError("Add stocks to your watchlist first");
            return;
        }
        disclaimer.ensureAccepted(async () => {
            setActionError("");
            setQuickBusy("patterns");
            try {
                const r = await api.post("/patterns/scan");
                const { scanned, detected, alerts_created } = r.data;
                await fetchAlerts();
                if (detected === 0) {
                    setActionError(
                        `Pattern scan complete · ${scanned} watchlist stocks scanned · no high-strength reversal patterns detected.`
                    );
                } else if (alerts_created === 0) {
                    setActionError(
                        `Pattern scan complete · ${detected} pattern(s) detected but already alerted (no duplicates created).`
                    );
                } else {
                    setActionError(
                        `Pattern scan complete · ${alerts_created} new alert(s) for ${detected} detected pattern(s) across ${scanned} stocks. Check Signal Feed →`
                    );
                }
            } catch (err) {
                if (disclaimer.promptFromError(err)) return;
                setActionError(errMessage(err?.response?.data?.detail, "Pattern scan failed"));
            } finally {
                setQuickBusy(null);
            }
        });
    };

    // Performance summary derivations
    const perf = useMemo(() => {
        const changes = items.map((i) => i.quote?.change_pct).filter((v) => v != null);
        if (!changes.length) return { avg: null, gainers: 0, losers: 0 };
        const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
        return {
            avg,
            gainers: changes.filter((c) => c > 0).length,
            losers: changes.filter((c) => c < 0).length,
        };
    }, [items]);

    const unread = alerts.filter((a) => !a.read).length;

    return (
        <>
            <AddStockModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onAdded={() => {
                    refresh();
                }}
            />

            {timelineTicker && (
                <TimelineFitModal
                    ticker={timelineTicker}
                    onClose={() => setTimelineTicker(null)}
                />
            )}

            <DisclaimerModal
                open={disclaimer.open}
                onClose={disclaimer.onClose}
                onAccepted={disclaimer.onAccepted}
            />

            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16">
                {/* Hero header */}
                <section className="mb-8 md:mb-12">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="live-dot" />
                        <span className="text-overline">Live Desk</span>
                        <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                            · {new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                        </span>
                    </div>
                    <h1
                        className="font-serif hero-number"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}
                        data-testid="dashboard-title"
                    >
                        Your edge,
                        <em className="italic" style={{ color: "hsl(var(--buy))", fontWeight: 400 }}>
                            {" "}
                            in focus.
                        </em>
                    </h1>
                    <p
                        className="mt-4 text-base max-w-2xl"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        Three positions, reasoned verdicts, signal-grade alerts. Tap{" "}
                        <span className="font-mono text-[hsl(var(--text-primary))]">Analyze&nbsp;Now</span>{" "}
                        on any row, or let Claude sweep your movers with
                        <span className="font-mono text-[hsl(var(--text-primary))]"> Top/Bottom 3</span>.
                    </p>
                    <p
                        className="mt-3 text-overline"
                        style={{ fontSize: "0.58rem", color: "hsl(var(--text-muted))" }}
                    >
                        Not financial advice · Educational use only · You decide, you own the outcome
                    </p>
                </section>

                {/* Test-unlock banner (admin-granted) */}
                <TestUnlockBanner quota={quota} />

                {/* First-time manual nudge (auto-hides after first analysis this week) */}
                <FirstTimeManualPill quota={quota} />

                {/* Onboarding wizard — auto-opens for fresh signups */}
                <OnboardingWizard
                    open={onboardingOpen}
                    onClose={() => setOnboardingOpen(false)}
                    onWatchlistChanged={async () => {
                        await fetchWatchlist();
                        await fetchQuota?.();
                    }}
                />

                {/* Quota banner */}
                {quota && (
                    <section
                        className="module px-5 py-4 mb-4 flex items-center justify-between flex-wrap gap-3"
                        data-testid="quota-banner"
                    >
                        <div className="flex flex-wrap items-center gap-5 md:gap-8">
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Plan</p>
                                <p className="font-mono text-sm mt-1" style={{ color: plan === "elite" ? "hsl(var(--hold))" : plan === "pro" ? "hsl(var(--buy))" : "hsl(var(--text-primary))" }}>
                                    {quota.plan_name.toUpperCase()}
                                </p>
                            </div>
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Watchlist</p>
                                <p className="font-mono text-sm mt-1">{quota.watchlist_used} / {quota.watchlist_limit}</p>
                            </div>
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Analyses · today</p>
                                <p className="font-mono text-sm mt-1">
                                    {quota.analyses_today}
                                    {" / "}
                                    {quota.analyses_day_limit === null ? "∞" : quota.analyses_day_limit}
                                </p>
                            </div>
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Analyses · week</p>
                                <p className="font-mono text-sm mt-1">
                                    {quota.analyses_this_week}
                                    {" / "}
                                    {quota.analyses_week_limit === null ? "∞" : quota.analyses_week_limit}
                                </p>
                            </div>
                        </div>
                        {plan !== "elite" && (
                            <Link
                                to="/pricing"
                                className="btn-ghost !text-xs"
                                data-testid="upgrade-link"
                            >
                                Upgrade →
                            </Link>
                        )}
                    </section>
                )}

                {actionError && (
                    <>
                        <LLMBudgetBanner error={actionErrorRaw} />
                        {!_isBudgetError(actionErrorRaw) && (
                            <div className="signal-sell px-4 py-3 mb-4 font-mono text-sm" data-testid="action-error">
                                {actionError}
                            </div>
                        )}
                    </>
                )}

                {/* Analysis mode selector — applies to per-row Analyze */}
                <section className="module px-5 py-4 mb-4" data-testid="analyze-mode-section">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <AnalysisModeSelector
                            value={analyzeMode}
                            onChange={setAnalyzeMode}
                            canPro={true}
                            testIdPrefix="dashboard-mode"
                        />
                        <AnalysisQueueChip watch />
                        <LlmHealthBadge />
                    </div>
                </section>

                {/* Live Desk — how-to-use guide */}
                <LiveDeskGuide />

                {/* Trending on Neulab — community social proof */}
                <TrendingOnNeulabWidget />

                {/* Quick Actions */}
                <section className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-8">
                    <button
                        onClick={() => quickAnalyze("top")}
                        className="btn-quick flex items-center justify-between"
                        disabled={!!quickBusy || !canQuickActions}
                        title={!canQuickActions ? "Pro/Elite feature" : undefined}
                        data-testid="analyze-top-button"
                    >
                        <span>
                            {!canQuickActions ? "Top 3 · Pro" : quickBusy === "top" ? "Analyzing…" : "Analyze Top 3"}
                        </span>
                        {!canQuickActions ? (
                            <Lock size={14} strokeWidth={1.5} />
                        ) : quickBusy === "top" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <TrendingUp size={14} strokeWidth={1.5} />
                        )}
                    </button>
                    <button
                        onClick={() => quickAnalyze("bottom")}
                        className="btn-quick flex items-center justify-between"
                        disabled={!!quickBusy || !canQuickActions}
                        title={!canQuickActions ? "Pro/Elite feature" : undefined}
                        data-testid="analyze-bottom-button"
                    >
                        <span>
                            {!canQuickActions ? "Bottom 3 · Pro" : quickBusy === "bottom" ? "Analyzing…" : "Analyze Bottom 3"}
                        </span>
                        {!canQuickActions ? (
                            <Lock size={14} strokeWidth={1.5} />
                        ) : quickBusy === "bottom" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <TrendingDown size={14} strokeWidth={1.5} />
                        )}
                    </button>
                    <button
                        onClick={scanPatterns}
                        className="btn-quick flex items-center justify-between"
                        disabled={!!quickBusy}
                        title="Scan watchlist for candlestick reversal patterns — no LLM calls"
                        data-testid="scan-patterns-button"
                    >
                        <span>
                            {quickBusy === "patterns" ? "Scanning…" : "Scan Patterns"}
                        </span>
                        {quickBusy === "patterns" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Zap size={14} strokeWidth={1.5} />
                        )}
                    </button>
                    <button
                        onClick={refresh}
                        className="btn-quick flex items-center justify-between"
                        disabled={refreshing}
                        data-testid="refresh-button"
                    >
                        <span>{refreshing ? "Refreshing…" : "Refresh Prices"}</span>
                        <RefreshCw size={14} strokeWidth={1.5} className={refreshing ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={() => setModalOpen(true)}
                        className="btn-quick flex items-center justify-between"
                        disabled={watchlistFull}
                        data-testid="add-stock-button"
                    >
                        <span>
                            {watchlistFull ? "Watchlist Full" : "Add Stock"}
                        </span>
                        <Plus size={14} strokeWidth={1.5} />
                    </button>
                    <IdxTopPicksDialog canUse={canQuickActions} />
                </section>

                {/* Main grid: Watchlist + Alerts + Performance */}
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-1 md:gap-4">
                    {/* Watchlist module */}
                    <div className="lg:col-span-8 module">
                        <div className="p-5 md:p-6 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                            <div>
                                <p className="text-overline">Watchlist · {items.length} / {watchlistLimit}</p>
                                <h2 className="font-serif text-2xl md:text-3xl mt-1" style={{ letterSpacing: "-0.015em" }}>
                                    Positions under watch
                                </h2>
                            </div>
                        </div>

                        {loading && (
                            <div className="p-10 text-center text-[hsl(var(--text-secondary))]">
                                <Loader2 className="animate-spin mx-auto" size={20} />
                                <p className="mt-3 text-sm font-mono">Loading watchlist…</p>
                            </div>
                        )}

                        {!loading && items.length === 0 && (
                            <div
                                className="relative p-12 md:p-20 text-center grid-bg"
                                data-testid="watchlist-empty-state"
                            >
                                <p className="text-overline">Empty ledger</p>
                                <h3
                                    className="font-serif mt-4"
                                    style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", lineHeight: 1.05 }}
                                >
                                    Every thesis begins with
                                    <em className="italic" style={{ color: "hsl(var(--hold))" }}>
                                        {" "}
                                        one ticker.
                                    </em>
                                </h3>
                                <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Add up to three symbols to unlock live prices, AI verdicts, and real-time alerts.
                                </p>
                                <button
                                    onClick={() => setModalOpen(true)}
                                    className="btn-primary mt-8"
                                    data-testid="empty-add-stock-button"
                                >
                                    <Plus size={14} strokeWidth={1.5} /> Add your first stock
                                </button>
                            </div>
                        )}

                        {!loading && items.length > 0 && (
                            <div>
                                {items.map((item) => (
                                    <WatchlistRow
                                        key={item.ticker}
                                        item={item}
                                        sparkline={sparks[item.ticker] || []}
                                        onRemove={removeTicker}
                                        onAnalyze={analyzeOne}
                                        onTimeline={(t) => disclaimer.ensureAccepted(() => setTimelineTicker(t))}
                                        canTimeline={canQuickActions}
                                        analyzing={analyzingTicker === item.ticker}
                                        analyzingPhase={analyzingTicker === item.ticker ? analyzingPhase : null}
                                        failed={failedTicker === item.ticker}
                                        failedMsg={failedTicker === item.ticker ? failedTickerMsg : ""}
                                        revealed={revealedTicker === item.ticker}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Alerts feed */}
                    <div className="lg:col-span-4 module">
                        <div
                            className="p-5 md:p-6 flex items-center justify-between"
                            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                        >
                            <div>
                                <p className="text-overline">Signal Feed</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Bell size={16} strokeWidth={1.5} />
                                    <h3 className="font-serif text-xl" style={{ letterSpacing: "-0.01em" }}>
                                        Alerts {unread > 0 && <span className="font-mono text-xs ml-1 signal-hold px-2 py-0.5" data-testid="unread-count">{unread}</span>}
                                    </h3>
                                </div>
                            </div>
                            {alerts.length > 0 && (
                                <Link
                                    to="/alerts"
                                    className="text-overline hover:text-[hsl(var(--text-primary))] inline-flex items-center gap-2"
                                    data-testid="dash-alerts-triage-link"
                                    title="Open full Alert Triage + scoreboard"
                                >
                                    <span
                                        className="inline-block"
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: "50%",
                                            background: "hsl(var(--buy))",
                                            boxShadow: "0 0 4px hsl(var(--buy))",
                                        }}
                                    />
                                    Confidence · Triage →
                                </Link>
                            )}
                            {alerts.length > 0 && (
                                <button
                                    onClick={markAllAlertsRead}
                                    className="text-overline hover:text-[hsl(var(--text-primary))] ml-3"
                                    data-testid="mark-all-read-button"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>

                        <div className="max-h-[520px] overflow-y-auto" data-testid="alerts-list">
                            {alerts.length === 0 ? (
                                <div className="p-8 text-center">
                                    <p
                                        className="text-overline"
                                        style={{ color: "hsl(var(--text-muted))" }}
                                    >
                                        No alerts yet
                                    </p>
                                    <p
                                        className="mt-2 text-sm"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        High-confidence verdicts (≥75%) appear here.
                                    </p>
                                </div>
                            ) : (
                                alerts.map((a) => {
                                    const isPattern = a.type === "pattern";
                                    const bias = a.bias; // pattern alerts only
                                    const signal = a.signal; // signal alerts only
                                    const accentColor = isPattern
                                        ? bias === "bullish"
                                            ? "hsl(var(--buy))"
                                            : bias === "bearish"
                                            ? "hsl(var(--sell))"
                                            : "hsl(var(--hold))"
                                        : signal === "BUY"
                                        ? "hsl(var(--buy))"
                                        : signal === "SELL"
                                        ? "hsl(var(--sell))"
                                        : "hsl(var(--hold))";
                                    return (
                                        <Link
                                            to={`/analysis/${a.ticker}`}
                                            key={a.id}
                                            className="block px-4 py-4 hover:bg-[hsl(var(--surface-elevated))] transition-colors"
                                            style={{
                                                borderBottom: "1px solid hsl(var(--border-divider))",
                                                borderLeft: `2px solid ${accentColor}`,
                                                opacity: a.read ? 0.55 : 1,
                                            }}
                                            data-testid={`alert-${a.id}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <ConfidenceDot alertType={a.type} stats={alertStats} />
                                                    <span className="font-mono text-sm font-medium">{a.ticker}</span>
                                                    {isPattern ? (
                                                        <span
                                                            className="font-mono px-2 py-0.5"
                                                            style={{
                                                                fontSize: "0.56rem",
                                                                letterSpacing: "0.12em",
                                                                color: accentColor,
                                                                border: `1px solid ${accentColor}`,
                                                                borderRadius: 2,
                                                                textTransform: "uppercase",
                                                            }}
                                                            data-testid={`pattern-badge-${a.id}`}
                                                        >
                                                            {bias || "neutral"}
                                                        </span>
                                                    ) : (
                                                        <SignalBadge signal={signal} />
                                                    )}
                                                </div>
                                                <span className="text-overline" style={{ fontSize: "0.56rem" }}>
                                                    {timeAgo(a.created_at)}
                                                </span>
                                            </div>
                                            <p
                                                className="mt-2 text-xs line-clamp-2"
                                                style={{ color: "hsl(var(--text-secondary))" }}
                                            >
                                                {a.message}
                                            </p>
                                            <p className="text-overline mt-1" style={{ fontSize: "0.56rem" }}>
                                                {isPattern
                                                    ? `${a.pattern} · ${a.timeframe} · strength ${a.strength}`
                                                    : `${a.confidence_score}% conviction`}
                                            </p>
                                        </Link>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Top IDX Confluences — silent for users with no IDX
                        analyses in the past week, so it doesn't clutter the
                        US-only flows. Spans full width below the watchlist
                        + alerts row. */}
                    <div className="lg:col-span-12">
                        <TopConfluencesModule days={7} limit={3} />
                    </div>

                    {/* Performance summary */}
                    <div className="lg:col-span-12 module mt-1 md:mt-0">
                        <div
                            className="p-5 md:p-6 grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-6"
                            style={{ borderTop: "none" }}
                        >
                            <div>
                                <p className="text-overline">Avg change today</p>
                                <div
                                    className="font-mono hero-number mt-2"
                                    style={{
                                        fontSize: "2.4rem",
                                        color:
                                            perf.avg == null
                                                ? "hsl(var(--text-muted))"
                                                : perf.avg >= 0
                                                ? "hsl(var(--buy))"
                                                : "hsl(var(--sell))",
                                    }}
                                    data-testid="perf-avg"
                                >
                                    {perf.avg == null ? "—" : formatPct(perf.avg)}
                                </div>
                            </div>
                            <div>
                                <p className="text-overline">Gainers / Losers</p>
                                <div className="font-mono hero-number mt-2" style={{ fontSize: "2.4rem" }}>
                                    <span style={{ color: "hsl(var(--buy))" }}>{perf.gainers}</span>
                                    <span style={{ color: "hsl(var(--text-muted))" }}> / </span>
                                    <span style={{ color: "hsl(var(--sell))" }}>{perf.losers}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-overline">Verdicts generated</p>
                                <div className="font-mono hero-number mt-2" style={{ fontSize: "2.4rem" }}>
                                    {items.filter((i) => i.latest_analysis).length}
                                </div>
                            </div>
                            <div>
                                <p className="text-overline">Unread alerts</p>
                                <div
                                    className="font-mono hero-number mt-2"
                                    style={{
                                        fontSize: "2.4rem",
                                        color: unread > 0 ? "hsl(var(--hold))" : "hsl(var(--text-muted))",
                                    }}
                                >
                                    {unread}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            {/* Floating live progress panel during Quick Analyze (Top/Bottom 3) */}
            {quickJobState && (
                <QuickAnalyzeProgress kind={quickBusy || "top"} jobState={quickJobState} />
            )}
        </>
    );
}
