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

// Empty-state placeholder A/B — variant `examples` ("Try AAPL, MSFT, or AMD")
// tests show-don't-tell against the instructional default. The fallback
// matches the `instruct` variant so the UX is unchanged when the experiment
// endpoint is unreachable.
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

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${BACKEND_URL}/api/try/status`);
                if (r.ok) setStatus(await r.json());
            } catch { /* ignore */ }
        })();
    }, []);

    const submit = async (e) => {
        e?.preventDefault();
        const t = (ticker || "").trim().toUpperCase();
        if (!t) return;
        setSubmitting(true);
        setError("");
        trackConversion("try_cta");
        trackConversion("try_placeholder");
        // Navigate to the try page — it runs the analysis itself, so the
        // visitor sees a loading state instead of a dead form.
        setTimeout(() => navigate(`/try/${encodeURIComponent(t)}`), 50);
    };

    const isDark = variant === "muted";
    const alreadyUsed = status && status.available === false;

    return (
        <form
            onSubmit={submit}
            className={`flex items-center gap-2 ${className}`}
            data-testid="try-now-box"
        >
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
                    placeholder={alreadyUsed ? "Used today — sign up for 3/day" : (placeholderExp?.render?.placeholder || PLACEHOLDER_FALLBACK.render.placeholder)}
                    disabled={alreadyUsed || submitting}
                    className="flex-1 min-w-0 bg-transparent outline-none font-mono text-xs sm:text-sm tracking-wide truncate"
                    style={{
                        color: isDark ? "rgba(255,255,255,0.95)" : "hsl(var(--text-primary))",
                    }}
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
                {submitting ? <Loader2 size={13} className="animate-spin" /> : (
                    <>
                        {cta.render.label} <ArrowRight size={11} strokeWidth={2} />
                    </>
                )}
            </button>
            {error && (
                <span className="text-xs" style={{ color: "hsl(var(--sell))" }}>
                    {error}
                </span>
            )}
        </form>
    );
}
