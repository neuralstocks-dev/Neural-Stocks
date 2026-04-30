import React, { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCcw, Users, Target, Clock } from "lucide-react";
import api from "@/lib/api";

/**
 * <AdminWizardFunnelPanel /> — visualises the onboarding wizard funnel
 * collected by `routers/telemetry.py::wizard_funnel`. Renders:
 *
 *   1. A 4-stage horizontal funnel (Opened → Step 1 → Step 2 → Step 3)
 *      with per-stage drop-off %, so ops can spot exactly where users
 *      bail (e.g. step1→step2 dropping 40% means the analysis-running
 *      step is too slow or breaks, not that the picker is the issue).
 *
 *   2. A "30-second goal" tile showing the % of completers that reached
 *      their first verdict in ≤30s — the published onboarding promise.
 *      Green if ≥75%, amber 50-74%, red <50%.
 *
 *   3. P50 / P75 / P90 time-to-verdict for completers, so the ops can
 *      see whether the long tail is slipping (P90 > 60s usually means
 *      the LLM fallback chain is rotating providers).
 *
 * Uses the same colour conventions + 30s auto-refresh cadence as
 * AdminLLMHealthPanel for visual continuity.
 */
export default function AdminWizardFunnelPanel() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const r = await api.get("/telemetry/wizard-funnel?days=30");
            setData(r.data);
            setErr("");
        } catch (ex) {
            setErr(ex?.response?.data?.detail || "Failed to load wizard funnel");
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, 30_000);
        return () => clearInterval(id);
    }, [refresh]);

    if (err) {
        return (
            <div
                className="module mt-6 p-5"
                style={{ borderColor: "hsl(var(--border-divider))" }}
                data-testid="admin-wizard-funnel-panel-error"
            >
                <p className="text-sm" style={{ color: "hsl(var(--sell))" }}>
                    {err}
                </p>
            </div>
        );
    }

    if (!data) {
        return (
            <div
                className="module mt-6 p-5"
                data-testid="admin-wizard-funnel-panel-loading"
                style={{ borderColor: "hsl(var(--border-divider))" }}
            >
                <p className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                    Loading wizard funnel…
                </p>
            </div>
        );
    }

    const funnel = data.funnel || [];
    const ttv = data.time_to_verdict_seconds || {};
    const goal = data.thirty_second_goal || {};
    const goalRate = goal.rate_pct;
    const goalColor =
        goalRate == null
            ? "hsl(var(--text-muted))"
            : goalRate >= 75
            ? "hsl(var(--buy))"
            : goalRate >= 50
            ? "hsl(var(--gold))"
            : "hsl(var(--sell))";

    return (
        <div
            className="module mt-6"
            data-testid="admin-wizard-funnel-panel"
            style={{ borderColor: "hsl(var(--border-divider))" }}
        >
            <div className="p-5 md:p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <div className="flex items-center gap-2">
                        <Activity size={14} strokeWidth={1.7} style={{ color: "hsl(var(--text-secondary))" }} />
                        <p className="text-overline" style={{ color: "hsl(var(--text-secondary))", fontSize: "10px" }}>
                            Wizard funnel · last {data.window_days}d
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={refreshing}
                        className="text-xs inline-flex items-center gap-1.5 px-2 py-1"
                        style={{
                            cursor: refreshing ? "wait" : "pointer",
                            color: "hsl(var(--text-secondary))",
                            border: "1px solid hsl(var(--border-divider))",
                        }}
                        data-testid="admin-wizard-funnel-refresh"
                    >
                        <RefreshCcw size={11} strokeWidth={1.7} className={refreshing ? "animate-spin" : ""} />
                        {refreshing ? "Refreshing…" : "Refresh"}
                    </button>
                </div>

                {data.session_total === 0 ? (
                    <p className="text-xs" style={{ color: "hsl(var(--text-muted))" }} data-testid="admin-wizard-funnel-empty">
                        No wizard sessions in the last {data.window_days} days. Once new users land on the onboarding modal, beacons will populate this strip automatically.
                    </p>
                ) : (
                    <>
                        {/* Funnel strip */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="admin-wizard-funnel-strip">
                            {funnel.map((s, i) => (
                                <FunnelStep key={s.step} step={s} index={i} max={funnel[0]?.count || 1} />
                            ))}
                        </div>

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                            <GoalTile
                                rate={goalRate}
                                color={goalColor}
                                completers={goal.n_completers}
                                under={goal.n_under_30s}
                            />
                            <PercentileTile ttv={ttv} />
                            <DropoutTile
                                step2Errors={data.step2_errors}
                                dismissedEarly={data.dismissed_early}
                            />
                        </div>

                        <p className="mt-4 text-[10.5px] leading-relaxed" style={{ color: "hsl(var(--text-muted))" }}>
                            Funnel groups events by per-mount <code style={{ color: "hsl(var(--text-secondary))" }}>session_id</code>; if missing, falls back to <code style={{ color: "hsl(var(--text-secondary))" }}>anonymous_id</code> (per-browser localStorage UUID). The 30s goal counts only sessions that reached <code>step2_complete</code>; users who dismiss earlier are tallied separately as drop-offs.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

function FunnelStep({ step, index, max }) {
    const pct = max > 0 ? Math.round((step.count / max) * 100) : 0;
    const drop = step.drop_from_prev_pct;
    const labelMap = {
        opened: "Opened",
        step1_next: "Picked + Next",
        step2_complete: "Verdict shown",
        step3_done: "Step 3 reached",
    };
    return (
        <div
            className="p-3"
            style={{
                border: "1px solid hsl(var(--border-divider))",
                borderLeft: "3px solid hsl(var(--text-secondary))",
            }}
            data-testid={`admin-wizard-funnel-step-${step.step}`}
        >
            <p className="text-overline" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>
                {String(index + 1).padStart(2, "0")} · {labelMap[step.step] || step.step}
            </p>
            <p className="font-mono mt-1" style={{ fontSize: "20px", color: "hsl(var(--text-primary))" }}>
                {step.count}
            </p>
            <p className="font-mono" style={{ fontSize: "10px", color: "hsl(var(--text-muted))" }}>
                {pct}% of opened
                {drop != null && index > 0 ? (
                    <>
                        {" · "}
                        <span style={{ color: drop > 30 ? "hsl(var(--sell))" : "hsl(var(--text-secondary))" }}>
                            -{drop}% from prev
                        </span>
                    </>
                ) : null}
            </p>
        </div>
    );
}

function GoalTile({ rate, color, completers, under }) {
    return (
        <div
            className="p-3"
            style={{ border: `1px solid ${color}`, borderLeftWidth: 3 }}
            data-testid="admin-wizard-funnel-goal-tile"
        >
            <div className="flex items-center gap-1.5">
                <Target size={11} strokeWidth={1.8} style={{ color }} />
                <p className="text-overline" style={{ fontSize: "9px", color }}>
                    30-second onboarding goal
                </p>
            </div>
            <p className="font-mono mt-1" style={{ fontSize: "20px", color }}>
                {rate == null ? "—" : `${rate}%`}
            </p>
            <p className="font-mono" style={{ fontSize: "10px", color: "hsl(var(--text-muted))" }}>
                {under ?? 0} / {completers ?? 0} completers ≤30s
            </p>
        </div>
    );
}

function PercentileTile({ ttv }) {
    const fmt = (v) => (v == null ? "—" : `${v}s`);
    return (
        <div
            className="p-3"
            style={{ border: "1px solid hsl(var(--border-divider))", borderLeftWidth: 3 }}
            data-testid="admin-wizard-funnel-percentile-tile"
        >
            <div className="flex items-center gap-1.5">
                <Clock size={11} strokeWidth={1.8} style={{ color: "hsl(var(--text-secondary))" }} />
                <p className="text-overline" style={{ fontSize: "9px", color: "hsl(var(--text-secondary))" }}>
                    Time-to-verdict (n={ttv.n ?? 0})
                </p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
                <div>
                    <p className="font-mono" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>P50</p>
                    <p className="font-mono" style={{ fontSize: "13px", color: "hsl(var(--text-primary))" }}>{fmt(ttv.p50)}</p>
                </div>
                <div>
                    <p className="font-mono" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>P75</p>
                    <p className="font-mono" style={{ fontSize: "13px", color: "hsl(var(--text-primary))" }}>{fmt(ttv.p75)}</p>
                </div>
                <div>
                    <p className="font-mono" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>P90</p>
                    <p
                        className="font-mono"
                        style={{
                            fontSize: "13px",
                            color: ttv.p90 != null && ttv.p90 > 60
                                ? "hsl(var(--gold))"
                                : "hsl(var(--text-primary))",
                        }}
                    >
                        {fmt(ttv.p90)}
                    </p>
                </div>
            </div>
        </div>
    );
}

function DropoutTile({ step2Errors, dismissedEarly }) {
    const total = (step2Errors || 0) + (dismissedEarly || 0);
    return (
        <div
            className="p-3"
            style={{
                border: `1px solid ${total > 0 ? "hsl(var(--gold))" : "hsl(var(--border-divider))"}`,
                borderLeftWidth: 3,
            }}
            data-testid="admin-wizard-funnel-dropout-tile"
        >
            <div className="flex items-center gap-1.5">
                <Users size={11} strokeWidth={1.8} style={{ color: "hsl(var(--text-secondary))" }} />
                <p className="text-overline" style={{ fontSize: "9px", color: "hsl(var(--text-secondary))" }}>
                    Failure modes
                </p>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
                <div>
                    <p className="font-mono" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>Step-2 errors</p>
                    <p
                        className="font-mono"
                        style={{
                            fontSize: "16px",
                            color: step2Errors > 0 ? "hsl(var(--sell))" : "hsl(var(--text-primary))",
                        }}
                    >
                        {step2Errors ?? 0}
                    </p>
                </div>
                <div>
                    <p className="font-mono" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>Dismissed early</p>
                    <p
                        className="font-mono"
                        style={{
                            fontSize: "16px",
                            color: dismissedEarly > 0 ? "hsl(var(--gold))" : "hsl(var(--text-primary))",
                        }}
                    >
                        {dismissedEarly ?? 0}
                    </p>
                </div>
            </div>
        </div>
    );
}
