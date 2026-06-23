/**
 * TryNowBox — a one-line ticker input that drops a curious anonymous
 * visitor directly into a free verdict on their own stock. Used across
 * /login, /signup, /v/:shareId and optionally /landing.
 *
 * Checks GET /api/try/status on mount so it can show "already used"
 * state without making the user type a ticker first.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Lock, Sparkles } from "lucide-react";
import { useExperimentVariant, trackConversion } from "@/hooks/useExperimentVariant";
import { BACKEND_URL } from "@/lib/api";

const CTA_FALLBACK = {
    key: "analyze",
    render: { label: "ANALYZE" },
};

const PLACEHOLDER_FALLBACK = {
    key: "instruct",
    render: { placeholder: "Type a ticker (e.g. AAPL, BBCA.JK)" },
};

export default function TryNowBox({ variant = "default", className = "" }) {
    const navigate = useNavigate();
    const cta = useExperimentVariant("try_cta", CTA_FALLBACK);
    const placeholderExp = useExperimentVariant("try_placeholder", PLACEHOLDER_FALLBACK);
    const [ticker, setTicker] = useState("");
    const [status, setStatus] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [resetCountdown, setResetCountdown] = useState("");

    useEffect(() => {
        let timer = null;
        (async () => {
            try {
                const r = await fetch(`${BACKEND_URL}/api/try/status`);
                if (r.ok) {
                    const s = await r.json();
                    setStatus(s);
                    if (s.available === false && s.next_reset_at) {
                        const tick = () => {
                            const diff = new Date(s.next_reset_at) - new Date();
                            if (diff <= 0) { setResetCountdown("now"); return; }
                            const h = Math.floor(diff / 3600000);
                            const m = Math.floor((diff % 3600000) / 60000);
                            setResetCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`);
                        };
                        tick();
                        timer = setInterval(tick, 60000);
                    }
                }
            } catch { /* ignore */ }
        })();
        return () => { if (timer) clearInterval(timer); };
    }, []);

    const submit = async (e) => {
        e?.preventDefault();
        const t = (ticker || "").trim().toUpperCase();
        if (!t) return;
        setSubmitting(true);
        setError("");
        trackConversion("try_cta");
        trackConversion("try_placeholder");
        setTimeout(() => navigate(`/try/${encodeURIComponent(t)}`), 50);
    };

    const isDark = variant === "muted";
    const alreadyUsed = status && status.available === false;

    return (
        <div className={className} data-testid="try-now-box">
            <form onSubmit={submit} className="flex items-center gap-2">
                <div
                    className="flex items-center gap-2 flex-1 px-3 py-2.5"
                    style={{
                        background: isDark ? "rgba(0,0,0,0.55)" : "hsl(var(--surface-elevated))",
                        border: `1px solid ${isDark ? "rgba(255,200,120,0.5)" : "hsl(var(--border-default))"}`,
                        borderRadius: 2,
                        backdropFilter: isDark ? "blur(12px)" : undefined,
                    }}
                >
                    {alreadyUsed ? (
                        <Lock size={13} strokeWidth={1.8} style={{ color: isDark ? "rgba(255,255,255,0.5)" : "hsl(var(--text-muted))" }} />
                    ) : (
                        <Sparkles size={13} strokeWidth={1.8} style={{ color: isDark ? "rgba(255,200,120,0.9)" : "hsl(var(--accent-primary))" }} />
                    )}
                    <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        placeholder={alreadyUsed
                            ? "Used today — sign up for 3/day free"
                            : (placeholderExp?.render?.placeholder || PLACEHOLDER_FALLBACK.render.placeholder)}
                        disabled={alreadyUsed || submitting}
                        className="flex-1 min-w-0 bg-transparent outline-none font-mono text-xs sm:text-sm tracking-wide truncate"
                        style={{ color: isDark ? "rgba(255,255,255,0.95)" : "hsl(var(--text-primary))" }}
                        data-testid="try-now-input"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                <button
                    type="submit"
                    disabled={!ticker.trim() || submitting || alreadyUsed}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 font-mono transition-all"
                    style={{
                        background: isDark ? "rgba(255,200,120,0.9)" : "hsl(var(--accent-primary))",
                        color: "#0B0B0B",
                        fontSize: "0.7rem",
                        letterSpacing: "0.08em",
                        border: "none",
                        borderRadius: 2,
                        cursor: (!ticker.trim() || alreadyUsed) ? "not-allowed" : "pointer",
                        opacity: (!ticker.trim() || alreadyUsed) ? 0.45 : 1,
                    }}
                    data-testid="try-now-submit"
                >
                    {submitting
                        ? <Loader2 size={13} className="animate-spin" />
                        : <>{cta.render.label} <ArrowRight size={11} strokeWidth={2} /></>}
                </button>
            </form>

            {/* Counter + reset timer — always visible */}
            <div className="flex items-center justify-between mt-2">
                <span
                    className="font-mono"
                    style={{
                        fontSize: "0.6rem",
                        letterSpacing: "0.08em",
                        color: isDark ? "rgba(255,255,255,0.4)" : "hsl(var(--text-muted))",
                    }}
                >
                    {status === null
                        ? "CHECKING…"
                        : alreadyUsed
                        ? "1 / 1 FREE ANALYSIS USED"
                        : "0 / 1 FREE ANALYSIS USED"}
                </span>
                {alreadyUsed && resetCountdown ? (
                    <span
                        className="font-mono"
                        style={{
                            fontSize: "0.6rem",
                            letterSpacing: "0.08em",
                            color: isDark ? "rgba(255,255,255,0.35)" : "hsl(var(--text-muted))",
                        }}
                    >
                        RESETS IN {resetCountdown.toUpperCase()}
                    </span>
                ) : !alreadyUsed ? (
                    <span
                        className="font-mono"
                        style={{
                            fontSize: "0.6rem",
                            letterSpacing: "0.08em",
                            color: isDark ? "rgba(255,200,120,0.55)" : "hsl(var(--accent-primary))",
                            opacity: 0.75,
                        }}
                    >
                        NO SIGN-UP NEEDED
                    </span>
                ) : null}
            </div>

            {error && (
                <span className="block mt-1 text-xs" style={{ color: "hsl(var(--sell))" }}>
                    {error}
                </span>
            )}
        </div>
    );
}
