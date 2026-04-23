/**
 * IdxBudgetCard — admin console module showing the RapidAPI IDX provider's
 * monthly request count vs our soft budget. Links to the RapidAPI dashboard
 * for hard-limit configuration.
 */
import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Globe, CheckCircle2, AlertTriangle, XCircle, ExternalLink, RefreshCw } from "lucide-react";

export default function IdxBudgetCard() {
    const [snap, setSnap] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchSnap = useCallback(async () => {
        try {
            const res = await api.get("/admin/rapidapi/usage");
            setSnap(res.data);
        } catch {
            setSnap(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSnap();
    }, [fetchSnap]);

    const configured = snap?.configured;
    const count = snap?.count ?? 0;
    const budget = snap?.budget ?? 950;
    const remaining = snap?.remaining ?? 0;
    const exhausted = snap?.exhausted;
    const pct = budget > 0 ? Math.min(100, (count / budget) * 100) : 0;

    const StatusIcon = !configured
        ? XCircle
        : exhausted
            ? AlertTriangle
            : pct >= 80
                ? AlertTriangle
                : CheckCircle2;
    const statusColor = !configured
        ? "hsl(var(--sell))"
        : exhausted
            ? "hsl(var(--sell))"
            : pct >= 80
                ? "hsl(var(--hold))"
                : "hsl(var(--buy))";
    const statusLabel = !configured
        ? "Not configured"
        : exhausted
            ? "Budget exhausted"
            : `${remaining} / ${budget} remaining`;

    return (
        <section
            className="module mt-6 md:mt-10 p-5 md:p-6"
            data-testid="admin-idx-budget-module"
        >
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Globe size={12} strokeWidth={1.5} /> IDX · RapidAPI source
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        Monthly request budget
                    </h2>
                    <p className="text-sm mt-2" style={{ color: "hsl(var(--text-muted))" }}>
                        IDX live quotes, key stats, and technical signals come from the{" "}
                        <a
                            href="https://rapidapi.com/yasimpratama88/api/indonesia-stock-exchange-idx"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-dotted underline-offset-4"
                            style={{ color: "hsl(var(--text-primary))" }}
                        >
                            indonesia-stock-exchange-idx
                        </a>
                        {" "}provider (BASIC free plan · 1,000 req/mo · 1 req/sec). We enforce a{" "}
                        <strong style={{ color: "hsl(var(--text-primary))" }}>
                            soft budget of {budget}
                        </strong>
                        {" "}≈5% below the hard quota so overage charges can never fire.
                        When exhausted, IDX analyses silently fall back to yfinance.
                    </p>
                </div>
                <div
                    className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px]"
                    style={{ border: `1px solid ${statusColor}`, color: statusColor, borderRadius: 2 }}
                    data-testid="idx-budget-status-chip"
                >
                    <StatusIcon size={12} strokeWidth={1.5} />
                    {statusLabel}
                </div>
            </div>

            <div className="mt-5">
                <div
                    className="h-2 w-full overflow-hidden"
                    style={{ background: "hsl(var(--bg))", border: "1px solid hsl(var(--border-divider))", borderRadius: 2 }}
                    data-testid="idx-budget-bar"
                >
                    <div
                        style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: pct >= 100 ? "hsl(var(--sell))" : pct >= 80 ? "hsl(var(--hold))" : "hsl(var(--buy))",
                            transition: "width 0.4s ease",
                        }}
                    />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                    <span>{count.toLocaleString()} used this month ({snap?.month || "—"})</span>
                    <span>{pct.toFixed(1)}%</span>
                </div>
            </div>

            {!configured ? (
                <div
                    className="mt-4 p-4 text-[12px] leading-relaxed"
                    style={{ background: "hsla(0,55%,55%,0.06)", border: "1px solid hsl(var(--sell))" }}
                    data-testid="idx-setup-steps"
                >
                    <p style={{ color: "hsl(var(--text-primary))", fontWeight: 500 }}>
                        RapidAPI key not configured — IDX analyses currently run on yfinance only.
                    </p>
                    <ol className="mt-3 space-y-1.5 list-decimal list-inside" style={{ color: "hsl(var(--text-secondary))" }}>
                        <li>
                            Sign up at{" "}
                            <a href="https://rapidapi.com/auth/sign-up" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
                                rapidapi.com <ExternalLink size={10} className="inline" />
                            </a>
                        </li>
                        <li>
                            Subscribe to the <strong>BASIC</strong> free plan on the{" "}
                            <a
                                href="https://rapidapi.com/yasimpratama88/api/indonesia-stock-exchange-idx/pricing"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-dotted"
                            >
                                IDX API pricing page <ExternalLink size={10} className="inline" />
                            </a>{" "}
                            (a credit card is required even on the free plan — RapidAPI uses it for overage billing)
                        </li>
                        <li>Copy your <code>X-RapidAPI-Key</code> from the developer dashboard</li>
                        <li>
                            Paste it into <code>/app/backend/.env</code> as{" "}
                            <code>RAPIDAPI_KEY=your-key-here</code> then restart the backend
                        </li>
                    </ol>
                </div>
            ) : null}

            {snap?.last_call_at ? (
                <p className="mt-4 font-mono text-[10.5px]" style={{ color: "hsl(var(--text-muted))" }}>
                    Last call: {new Date(snap.last_call_at).toLocaleString()}
                    {snap.last_ticker ? ` · ${snap.last_ticker}.JK` : ""}
                    {snap.last_error ? ` · error: ${snap.last_error}` : ""}
                </p>
            ) : null}

            <div className="mt-4 flex items-center gap-3">
                <button
                    onClick={() => { setLoading(true); fetchSnap(); }}
                    disabled={loading}
                    className="btn-ghost !py-2 !px-4 !text-xs flex items-center gap-2"
                    data-testid="idx-budget-refresh-button"
                >
                    <RefreshCw size={12} strokeWidth={1.5} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>
        </section>
    );
}
