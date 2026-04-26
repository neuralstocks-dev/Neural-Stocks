/**
 * AdminCostPage — `/admin/cost`
 *
 * Admin-only dashboard that surfaces the LLM-cost economics that we
 * deliberately HIDE from public users (those numbers are unhelpful at
 * best and competitive-margin disclosure at worst). Shows:
 *   - Per-day verdict count × $0.027 totals (last 30 days)
 *   - Lifetime totals (USD spent, credits burned, verdict count)
 *   - Universal Key balance anchor: admin enters their last-known top-up
 *     amount, app subtracts estimated spend since the top-up to project
 *     verdicts remaining.
 *   - Sparkline of daily burn so admin can spot spikes.
 *
 * The "anchor" pattern works around the fact that Emergent doesn't
 * expose a balance-check API. Admin pastes their current Universal Key
 * balance (from the Profile page) and the dashboard subtracts the
 * estimated spend since that timestamp.
 */
import { useEffect, useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Wallet, TrendingDown, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

const _user = () => {
    try {
        return JSON.parse(localStorage.getItem("sai_user") || "{}");
    } catch {
        return {};
    }
};

function _StatCell({ label, value, note, accent = "text-primary", testId }) {
    return (
        <div
            className="p-4"
            style={{ border: "1px solid hsl(var(--border-default))", borderRadius: 2 }}
            data-testid={testId}
        >
            <p
                className="text-overline"
                style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}
            >
                {label}
            </p>
            <p
                className="font-mono mt-2"
                style={{ fontSize: "1.4rem", color: `hsl(var(--${accent}))` }}
            >
                {value}
            </p>
            {note && (
                <p
                    className="mt-1 text-xs"
                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.7rem" }}
                >
                    {note}
                </p>
            )}
        </div>
    );
}

function _Sparkline({ data }) {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data.map((d) => d.count), 1);
    const W = 600;
    const H = 60;
    const stepX = data.length > 1 ? W / (data.length - 1) : W;
    const points = data
        .map((d, i) => `${i * stepX},${H - (d.count / max) * (H - 6) - 3}`)
        .join(" ");
    return (
        <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ height: 60, overflow: "visible" }}
            data-testid="cost-sparkline"
        >
            <polyline
                points={points}
                fill="none"
                stroke="hsl(var(--hold))"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {data.map((d, i) => (
                <circle
                    key={d.date}
                    cx={i * stepX}
                    cy={H - (d.count / max) * (H - 6) - 3}
                    r="2.5"
                    fill="hsl(var(--hold))"
                >
                    <title>{`${d.date}: ${d.count} verdicts · $${d.usd.toFixed(2)} · ${d.credits.toFixed(1)} credits`}</title>
                </circle>
            ))}
        </svg>
    );
}

export default function AdminCostPage() {
    const auth = useAuth();
    // Bootstrapping = useAuth still resolving /auth/me; fall back to
    // localStorage hydrate so we don't redirect a real admin to /dashboard
    // before the first render finishes.
    const me = auth?.user || _user();
    const isAdmin = !!me?.is_admin;
    const bootstrapping = !!auth?.bootstrapping;

    const [days, setDays] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [anchorInput, setAnchorInput] = useState("");
    const [savingAnchor, setSavingAnchor] = useState(false);

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const r = await api.get(`/admin/cost/summary?days=${days}`);
            setData(r.data);
            if (r.data?.balance_anchor?.credits_at_top_up != null) {
                setAnchorInput(String(r.data.balance_anchor.credits_at_top_up));
            }
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days, isAdmin]);

    const saveAnchor = async () => {
        const n = parseFloat(anchorInput);
        if (!Number.isFinite(n) || n < 0) {
            setError("Enter a valid balance number (e.g. 54.89)");
            return;
        }
        setSavingAnchor(true);
        setError("");
        try {
            await api.post("/admin/cost/balance-anchor", { credits_at_top_up: n });
            await load();
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to save anchor");
        } finally {
            setSavingAnchor(false);
        }
    };

    const burnRate = useMemo(() => {
        if (!data?.daily?.length) return null;
        const totalC = data.totals.count;
        const d = data.daily.length;
        return d > 0 ? totalC / d : 0;
    }, [data]);

    if (bootstrapping) {
        return (
            <div className="container-narrow py-12 flex items-center justify-center" data-testid="admin-cost-loading">
                <Loader2 size={20} className="animate-spin" style={{ color: "hsl(var(--text-muted))" }} />
            </div>
        );
    }
    if (!isAdmin) return <Navigate to="/dashboard" replace />;

    const anchor = data?.balance_anchor;
    const lowBalance =
        anchor && anchor.estimated_verdicts_remaining < 10;

    return (
        <div className="container-narrow py-8 md:py-12" data-testid="admin-cost-page">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
                <div>
                    <p
                        className="text-overline"
                        style={{ color: "hsl(var(--hold))", fontSize: "0.62rem" }}
                    >
                        Admin · cost analytics
                    </p>
                    <h1
                        className="font-serif mt-2"
                        style={{ fontSize: "2rem", letterSpacing: "-0.01em" }}
                    >
                        LLM cost &amp; Universal Key balance.
                    </h1>
                    <p
                        className="mt-2 text-sm"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        Estimated burn at{" "}
                        <strong>${data?.cost_per_verdict_usd?.toFixed(3) || "0.027"}</strong>{" "}
                        per Claude Sonnet 4.5 verdict ·{" "}
                        <strong>{data?.cost_per_verdict_credits?.toFixed(1) || "2.7"}</strong>{" "}
                        Universal Key credits each.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        value={days}
                        onChange={(e) => setDays(parseInt(e.target.value, 10))}
                        className="font-mono px-2 py-1 text-xs"
                        style={{
                            background: "hsl(var(--bg))",
                            border: "1px solid hsl(var(--border-default))",
                            color: "hsl(var(--text-primary))",
                            borderRadius: 2,
                        }}
                        data-testid="cost-days-select"
                    >
                        {[7, 30, 60, 90].map((d) => (
                            <option key={d} value={d}>
                                Last {d} days
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="btn-ghost inline-flex items-center gap-1.5"
                        data-testid="cost-refresh"
                    >
                        {loading ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <RefreshCw size={12} />
                        )}
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div
                    className="signal-sell px-4 py-3 mb-4 font-mono text-sm"
                    data-testid="cost-error"
                >
                    {error}
                </div>
            )}

            {/* Lifetime/period totals */}
            {data && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <_StatCell
                        label="Verdicts"
                        value={data.totals.count.toLocaleString()}
                        note={`last ${data.days} days`}
                        testId="stat-count"
                    />
                    <_StatCell
                        label="USD spent"
                        value={`$${data.totals.usd.toFixed(2)}`}
                        note="estimated"
                        accent="hold"
                        testId="stat-usd"
                    />
                    <_StatCell
                        label="Credits burned"
                        value={data.totals.credits.toFixed(1)}
                        note="1 credit = $0.01"
                        accent="hold"
                        testId="stat-credits"
                    />
                    <_StatCell
                        label="Avg burn"
                        value={burnRate != null ? `${burnRate.toFixed(1)}/d` : "—"}
                        note="verdicts per day"
                        testId="stat-burn-rate"
                    />
                </div>
            )}

            {/* Sparkline */}
            {data?.daily?.length > 0 && (
                <div
                    className="module p-5 md:p-6 mb-6"
                    data-testid="cost-sparkline-card"
                >
                    <p
                        className="text-overline"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                    >
                        Daily verdict count · last {data.days} days
                    </p>
                    <div className="mt-3">
                        <_Sparkline data={data.daily} />
                    </div>
                    <div className="flex items-center justify-between mt-3 font-mono text-[10px]" style={{ color: "hsl(var(--text-muted))" }}>
                        <span>{data.daily[0]?.date}</span>
                        <span>{data.daily[data.daily.length - 1]?.date}</span>
                    </div>
                </div>
            )}

            {/* Balance anchor */}
            <div
                className="module p-5 md:p-6 mb-6"
                style={{
                    background: lowBalance ? "hsla(0, 55%, 55%, 0.04)" : undefined,
                    borderLeft: lowBalance
                        ? "3px solid hsl(var(--sell))"
                        : "3px solid hsl(var(--buy))",
                }}
                data-testid="cost-balance-card"
            >
                <div className="flex items-center gap-2.5">
                    <Wallet size={16} style={{ color: lowBalance ? "hsl(var(--sell))" : "hsl(var(--buy))" }} />
                    <p
                        className="text-overline"
                        style={{
                            color: lowBalance ? "hsl(var(--sell))" : "hsl(var(--buy))",
                            fontSize: "0.62rem",
                        }}
                    >
                        Universal Key balance
                    </p>
                </div>

                {anchor ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                            <_StatCell
                                label="Anchor balance"
                                value={anchor.credits_at_top_up.toFixed(2)}
                                note={`set ${anchor.anchor_date || "—"}`}
                                testId="anchor-start"
                            />
                            <_StatCell
                                label="Used since"
                                value={anchor.used_credits_since.toFixed(2)}
                                note={`${anchor.verdicts_since} verdicts`}
                                accent="sell"
                                testId="anchor-used"
                            />
                            <_StatCell
                                label="Remaining (est.)"
                                value={anchor.estimated_remaining_credits.toFixed(2)}
                                note={`≈ $${anchor.estimated_remaining_usd?.toFixed(2)}`}
                                accent={lowBalance ? "sell" : "buy"}
                                testId="anchor-remaining"
                            />
                            <_StatCell
                                label="Verdicts left"
                                value={anchor.estimated_verdicts_remaining}
                                note="@ ~2.7 cr each"
                                accent={lowBalance ? "sell" : "buy"}
                                testId="anchor-verdicts-left"
                            />
                        </div>
                        {lowBalance && (
                            <div
                                className="mt-4 p-3 flex items-start gap-2"
                                style={{
                                    border: "1px solid hsl(var(--sell))",
                                    background: "hsla(0,55%,55%,0.06)",
                                    borderRadius: 2,
                                }}
                                data-testid="cost-low-balance-warning"
                            >
                                <AlertTriangle
                                    size={14}
                                    style={{ color: "hsl(var(--sell))", marginTop: 2, flexShrink: 0 }}
                                />
                                <p
                                    className="text-xs"
                                    style={{ color: "hsl(var(--text-secondary))" }}
                                >
                                    Estimated balance below 10 verdicts. Top up the Universal
                                    Key (Profile → Universal Key → Add Balance) to avoid
                                    blocking new verdict generation.
                                </p>
                            </div>
                        )}
                    </>
                ) : (
                    <p
                        className="mt-3 text-sm"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        No anchor set yet. Enter your current Universal Key balance below to
                        start tracking remaining credits.
                    </p>
                )}

                <div className="mt-5 pt-4" style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                    <p
                        className="text-overline"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                    >
                        Update balance anchor
                    </p>
                    <p
                        className="mt-2 text-xs leading-relaxed"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.72rem" }}
                    >
                        Open <a href="https://app.emergent.sh/" target="_blank" rel="noopener noreferrer" className="link-underline">Emergent Profile → Universal Key</a>, copy the current credit balance, paste here, click Save. The dashboard will subtract estimated spend going forward.
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={anchorInput}
                            onChange={(e) => setAnchorInput(e.target.value)}
                            placeholder="e.g. 54.89"
                            className="font-mono px-2 py-1.5 text-sm"
                            style={{
                                background: "hsl(var(--bg))",
                                border: "1px solid hsl(var(--border-default))",
                                color: "hsl(var(--text-primary))",
                                borderRadius: 2,
                                width: 160,
                            }}
                            data-testid="anchor-input"
                        />
                        <button
                            type="button"
                            onClick={saveAnchor}
                            disabled={savingAnchor || !anchorInput}
                            className="btn-primary inline-flex items-center gap-1.5"
                            data-testid="anchor-save"
                        >
                            {savingAnchor ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <TrendingDown size={12} />
                            )}
                            Save anchor
                        </button>
                    </div>
                </div>
            </div>

            {/* Daily breakdown table */}
            {data?.daily?.length > 0 && (
                <div className="module p-5 md:p-6" data-testid="cost-daily-table">
                    <p
                        className="text-overline"
                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}
                    >
                        Daily breakdown
                    </p>
                    <div
                        className="mt-3 font-mono"
                        style={{ fontSize: "0.78rem" }}
                    >
                        <div
                            className="grid grid-cols-4 gap-2 pb-2"
                            style={{
                                borderBottom: "1px solid hsl(var(--border-divider))",
                                color: "hsl(var(--text-muted))",
                                fontSize: "0.65rem",
                            }}
                        >
                            <span>Date</span>
                            <span className="text-right">Verdicts</span>
                            <span className="text-right">USD</span>
                            <span className="text-right">Credits</span>
                        </div>
                        {[...data.daily].reverse().map((d) => (
                            <div
                                key={d.date}
                                className="grid grid-cols-4 gap-2 py-1.5"
                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                            >
                                <span style={{ color: "hsl(var(--text-secondary))" }}>{d.date}</span>
                                <span className="text-right" style={{ color: "hsl(var(--text-primary))" }}>
                                    {d.count}
                                </span>
                                <span className="text-right" style={{ color: "hsl(var(--text-secondary))" }}>
                                    ${d.usd.toFixed(2)}
                                </span>
                                <span className="text-right" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {d.credits.toFixed(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
