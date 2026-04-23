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

export default function TryNowBox({ variant = "default", className = "" }) {
    const navigate = useNavigate();
    const [ticker, setTicker] = useState("");
    const [status, setStatus] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const base = process.env.REACT_APP_BACKEND_URL || "";
                const r = await fetch(`${base}/api/try/status`);
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
                    placeholder={alreadyUsed ? "Already used today — sign up for unlimited" : "Try one free analysis — type a ticker (e.g. AAPL, BBCA.JK)"}
                    disabled={alreadyUsed || submitting}
                    className="flex-1 bg-transparent outline-none font-mono text-sm tracking-wide"
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
                        ANALYZE <ArrowRight size={11} strokeWidth={2} />
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
