import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import {
    Inbox,
    Star,
    Archive as ArchiveIcon,
    CheckCircle2,
    Loader2,
    TrendingUp,
    TrendingDown,
    Radar,
    Send as SendIcon,
    Sparkles,
    Undo2,
    ChevronRight,
} from "lucide-react";

const FILTERS = [
    { key: "all", label: "Inbox", testid: "alerts-filter-all" },
    { key: "unread", label: "Unread", testid: "alerts-filter-unread" },
    { key: "starred", label: "Starred", testid: "alerts-filter-starred" },
    { key: "taken", label: "Taken", testid: "alerts-filter-taken" },
    { key: "archived", label: "Archived", testid: "alerts-filter-archived" },
];

// Human labels + icon glyphs per alert `type`. Fall back to "Signal" for
// unknown types so unusual historical rows still render gracefully.
const TYPE_META = {
    signal: { label: "AI Verdict", icon: Sparkles, hue: "hsl(var(--buy))" },
    pattern: { label: "Pattern Scan", icon: Radar, hue: "hsl(var(--hold))" },
    rf_watchlist_scan: { label: "RF Auto-Scan", icon: SendIcon, hue: "hsl(var(--hold))" },
};

function typeMeta(t) {
    return TYPE_META[t] || { label: "Signal", icon: Sparkles, hue: "hsl(var(--text-secondary))" };
}

function fmtPct(v) {
    if (v === null || v === undefined) return "—";
    const s = v >= 0 ? "+" : "";
    return `${s}${v.toFixed(1)}%`;
}

function fmtDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
        return iso;
    }
}

function Kpi({ label, value, sub, tone, testid }) {
    const color =
        tone === "buy"
            ? "hsl(var(--buy))"
            : tone === "sell"
            ? "hsl(var(--sell))"
            : tone === "hold"
            ? "hsl(var(--hold))"
            : "hsl(var(--text-primary))";
    return (
        <div
            className="module p-5"
            style={{ background: "hsl(var(--surface-elevated))" }}
            data-testid={testid}
        >
            <p className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                {label}
            </p>
            <p
                className="font-mono mt-2"
                style={{
                    fontSize: "1.8rem",
                    letterSpacing: "-0.01em",
                    color,
                    lineHeight: 1.1,
                }}
            >
                {value}
            </p>
            {sub && (
                <p className="text-xs mt-2 font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                    {sub}
                </p>
            )}
        </div>
    );
}

function OutcomeBadge({ outcome, pnl }) {
    if (outcome === null || outcome === undefined) {
        return (
            <span
                className="font-mono text-xs px-2 py-1"
                style={{
                    background: "hsl(var(--surface-elevated))",
                    border: "1px solid hsl(var(--border-default))",
                    color: "hsl(var(--text-muted))",
                    letterSpacing: "0.1em",
                }}
                data-testid="alert-outcome-pending"
            >
                COOKING
            </span>
        );
    }
    const map = {
        win: { bg: "hsl(var(--buy-bg))", fg: "hsl(var(--buy))", label: "WIN" },
        loss: { bg: "hsl(var(--sell-bg))", fg: "hsl(var(--sell))", label: "LOSS" },
        break_even: {
            bg: "hsl(var(--surface-elevated))",
            fg: "hsl(var(--hold))",
            label: "FLAT",
        },
    };
    const m = map[outcome] || map.break_even;
    return (
        <span
            className="font-mono text-xs px-2 py-1"
            style={{
                background: m.bg,
                color: m.fg,
                border: `1px solid ${m.fg}`,
                letterSpacing: "0.1em",
            }}
            data-testid={`alert-outcome-${outcome}`}
        >
            {m.label} {pnl !== null && pnl !== undefined ? `· ${fmtPct(pnl)}` : ""}
        </span>
    );
}

function AlertCard({ alert, onStar, onArchive, onTake, busy }) {
    const meta = typeMeta(alert.type);
    const Icon = meta.icon;
    const isBuy = alert.signal === "BUY";
    const sigColor = isBuy ? "hsl(var(--buy))" : alert.signal === "SELL" ? "hsl(var(--sell))" : "hsl(var(--hold))";
    const SigIcon = isBuy ? TrendingUp : TrendingDown;
    const canTake = alert.signal === "BUY" || alert.signal === "SELL";

    return (
        <article
            className="module p-5"
            data-testid={`alert-card-${alert.id}`}
            style={{
                opacity: alert.archived ? 0.55 : 1,
                borderLeft: `3px solid ${sigColor}`,
            }}
        >
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span
                            className="font-mono text-xs inline-flex items-center gap-1.5 px-2 py-1"
                            style={{
                                background: "hsl(var(--surface-elevated))",
                                color: meta.hue,
                                letterSpacing: "0.1em",
                                border: `1px solid ${meta.hue}33`,
                            }}
                        >
                            <Icon size={11} strokeWidth={1.5} /> {meta.label}
                        </span>
                        <Link
                            to={`/analysis/${alert.ticker}?autorun=1`}
                            className="font-mono hover:underline"
                            style={{
                                fontSize: "1.1rem",
                                color: "hsl(var(--text-primary))",
                                letterSpacing: "0.02em",
                            }}
                            data-testid={`alert-ticker-link-${alert.id}`}
                        >
                            {alert.ticker}
                        </Link>
                        {alert.signal && (
                            <span
                                className="font-mono text-xs inline-flex items-center gap-1"
                                style={{
                                    color: sigColor,
                                    letterSpacing: "0.12em",
                                }}
                            >
                                <SigIcon size={11} strokeWidth={2} /> {alert.signal}
                                {alert.confidence_score != null ? ` · ${alert.confidence_score}%` : ""}
                            </span>
                        )}
                        {alert.taken && <OutcomeBadge outcome={alert.outcome} pnl={alert.outcome_pnl_pct} />}
                    </div>
                    <p
                        className="mt-3 text-sm font-serif"
                        style={{
                            fontSize: "1.05rem",
                            lineHeight: 1.35,
                            color: "hsl(var(--text-primary))",
                        }}
                    >
                        {alert.title}
                    </p>
                    <p
                        className="mt-2 text-sm"
                        style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                    >
                        {alert.message}
                    </p>
                    {alert.taken && (
                        <p
                            className="mt-3 text-xs font-mono"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            Entry ${alert.entry_price} on {fmtDate(alert.taken_at)}
                            {alert.exit_price ? ` · exit $${alert.exit_price} on ${fmtDate(alert.outcome_resolved_at)}` : " · still open"}
                        </p>
                    )}
                    <p
                        className="mt-2 text-xs font-mono"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        {fmtDate(alert.created_at)}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => onStar(alert)}
                        disabled={busy}
                        className="btn-quick inline-flex items-center gap-1.5"
                        data-testid={`alert-star-${alert.id}`}
                        title={alert.starred ? "Unstar" : "Star"}
                        style={{
                            color: alert.starred ? "hsl(var(--hold))" : "hsl(var(--text-secondary))",
                        }}
                    >
                        <Star
                            size={13}
                            strokeWidth={1.5}
                            fill={alert.starred ? "currentColor" : "none"}
                        />
                    </button>
                    {canTake && (
                        <button
                            onClick={() => onTake(alert)}
                            disabled={busy}
                            className="btn-quick inline-flex items-center gap-1.5"
                            data-testid={`alert-take-${alert.id}`}
                            style={{
                                color: alert.taken ? "hsl(var(--buy))" : "hsl(var(--text-secondary))",
                            }}
                            title={alert.taken ? "Un-mark as taken" : "I took this trade"}
                        >
                            {alert.taken ? <Undo2 size={12} strokeWidth={1.5} /> : <CheckCircle2 size={13} strokeWidth={1.5} />}
                            <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-wider">
                                {alert.taken ? "Undo" : "Took it"}
                            </span>
                        </button>
                    )}
                    <button
                        onClick={() => onArchive(alert)}
                        disabled={busy}
                        className="btn-quick inline-flex items-center gap-1.5"
                        data-testid={`alert-archive-${alert.id}`}
                        title={alert.archived ? "Unarchive" : "Archive"}
                    >
                        <ArchiveIcon
                            size={13}
                            strokeWidth={1.5}
                            style={{ color: alert.archived ? "hsl(var(--hold))" : "hsl(var(--text-secondary))" }}
                        />
                    </button>
                </div>
            </div>
        </article>
    );
}

function TypeBreakdownTable({ stats }) {
    const rows = useMemo(() => {
        if (!stats?.by_type) return [];
        return Object.entries(stats.by_type)
            .map(([type, b]) => ({ type, ...b }))
            .sort((a, b) => (b.win_rate_pct ?? -1) - (a.win_rate_pct ?? -1));
    }, [stats]);

    if (rows.length === 0) {
        return (
            <p
                className="text-sm mt-4 font-mono"
                style={{ color: "hsl(var(--text-muted))" }}
                data-testid="alerts-breakdown-empty"
            >
                Mark your first taken alert above to start the scoreboard.
            </p>
        );
    }

    return (
        <div className="overflow-x-auto mt-4" data-testid="alerts-breakdown-table">
            <table className="w-full font-mono text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                    <tr style={{ color: "hsl(var(--text-muted))", letterSpacing: "0.1em" }}>
                        <th className="text-left text-xs uppercase py-2">Channel</th>
                        <th className="text-right text-xs uppercase py-2">Taken</th>
                        <th className="text-right text-xs uppercase py-2">W · L · F</th>
                        <th className="text-right text-xs uppercase py-2">Win rate</th>
                        <th className="text-right text-xs uppercase py-2">Avg P&amp;L</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const meta = typeMeta(r.type);
                        const Icon = meta.icon;
                        return (
                            <tr
                                key={r.type}
                                style={{ borderTop: "1px solid hsl(var(--border-default))" }}
                                data-testid={`alerts-breakdown-row-${r.type}`}
                            >
                                <td className="py-3">
                                    <span className="inline-flex items-center gap-2" style={{ color: meta.hue }}>
                                        <Icon size={12} strokeWidth={1.5} />
                                        {meta.label}
                                    </span>
                                </td>
                                <td className="text-right py-3">{r.taken}</td>
                                <td className="text-right py-3" style={{ color: "hsl(var(--text-secondary))" }}>
                                    {r.wins} · {r.losses} · {r.break_even}
                                </td>
                                <td
                                    className="text-right py-3"
                                    style={{
                                        color:
                                            r.win_rate_pct === null
                                                ? "hsl(var(--text-muted))"
                                                : r.win_rate_pct >= 60
                                                ? "hsl(var(--buy))"
                                                : r.win_rate_pct >= 45
                                                ? "hsl(var(--hold))"
                                                : "hsl(var(--sell))",
                                    }}
                                >
                                    {r.win_rate_pct === null ? "—" : `${r.win_rate_pct}%`}
                                </td>
                                <td
                                    className="text-right py-3"
                                    style={{
                                        color:
                                            r.avg_pnl_pct === null
                                                ? "hsl(var(--text-muted))"
                                                : r.avg_pnl_pct >= 0
                                                ? "hsl(var(--buy))"
                                                : "hsl(var(--sell))",
                                    }}
                                >
                                    {r.avg_pnl_pct === null ? "—" : fmtPct(r.avg_pnl_pct)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function AlertsPage() {
    const { user } = useAuth();
    const [alerts, setAlerts] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [busy, setBusy] = useState(false);
    const [loadErr, setLoadErr] = useState("");

    const load = useCallback(async (nextFilter = filter) => {
        setLoading(true);
        setLoadErr("");
        try {
            const [listRes, statsRes] = await Promise.all([
                api.get(`/alerts?filter=${nextFilter}&limit=200`),
                api.get("/alerts/stats"),
            ]);
            setAlerts(listRes.data || []);
            setStats(statsRes.data);
        } catch (e) {
            setLoadErr(e?.response?.data?.detail || "Couldn't load alerts. Reload the page to retry.");
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        load(filter);
    }, [filter, load]);

    const onStar = async (alert) => {
        setBusy(true);
        try {
            await api.post(`/alerts/${alert.id}/star`, { starred: !alert.starred });
            await load(filter);
        } finally {
            setBusy(false);
        }
    };

    const onArchive = async (alert) => {
        setBusy(true);
        try {
            await api.post(`/alerts/${alert.id}/archive`, { archived: !alert.archived });
            await load(filter);
        } finally {
            setBusy(false);
        }
    };

    const onTake = async (a) => {
        setBusy(true);
        try {
            await api.post(`/alerts/${a.id}/taken`, { taken: !a.taken });
            await load(filter);
        } catch (e) {
            const msg = e?.response?.data?.detail || "Couldn't update this alert — try again.";
            window.alert(msg); // eslint-disable-line no-alert
        } finally {
            setBusy(false);
        }
    };

    return (
        <AppShell user={user}>
            <div className="max-w-[1100px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="alerts-page">
                <p className="text-overline flex items-center gap-2">
                    <Inbox size={12} strokeWidth={1.5} /> Alerts · Triage
                </p>
                <h1
                    className="font-serif mt-3"
                    style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em" }}
                >
                    Your <em style={{ color: "hsl(var(--hold))" }}>model-vs-market</em> scoreboard.
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Every verdict, pattern scan, and RF auto-scan alert lands here. Star the ones
                    worth watching, mark the trades you actually took, and we'll compute win-rate
                    and P&amp;L over a 20-day horizon per channel — so you know which part of
                    Neulab is pulling its weight for <em>your</em> style.
                </p>

                {/* KPI row */}
                <section
                    className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3"
                    data-testid="alerts-kpi-row"
                >
                    <Kpi
                        label="Taken"
                        value={stats?.total_taken ?? "—"}
                        sub={`${stats?.total_active ?? 0} still cooking`}
                        testid="kpi-taken"
                    />
                    <Kpi
                        label="Win rate"
                        value={stats?.overall_win_rate_pct === null || stats?.overall_win_rate_pct === undefined
                            ? "—"
                            : `${stats.overall_win_rate_pct}%`}
                        sub={`${stats?.total_wins ?? 0} W · ${stats?.total_losses ?? 0} L`}
                        tone={
                            stats?.overall_win_rate_pct == null
                                ? null
                                : stats.overall_win_rate_pct >= 60
                                ? "buy"
                                : stats.overall_win_rate_pct >= 45
                                ? "hold"
                                : "sell"
                        }
                        testid="kpi-winrate"
                    />
                    <Kpi
                        label="Avg P&L per taken"
                        value={stats?.overall_avg_pnl_pct == null ? "—" : fmtPct(stats.overall_avg_pnl_pct)}
                        sub={`${stats?.total_resolved ?? 0} resolved · ${stats?.resolve_horizon_days ?? 20}d horizon`}
                        tone={
                            stats?.overall_avg_pnl_pct == null
                                ? null
                                : stats.overall_avg_pnl_pct >= 0
                                ? "buy"
                                : "sell"
                        }
                        testid="kpi-pnl"
                    />
                    <Kpi
                        label="Break-even"
                        value={stats?.total_break_even ?? 0}
                        sub={`|move| < 0.5%`}
                        testid="kpi-breakeven"
                    />
                </section>

                {/* Channel breakdown */}
                <section className="module p-6 md:p-8 mt-6" data-testid="alerts-breakdown-module">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <div>
                            <p className="text-overline">Per-channel scoreboard</p>
                            <h2 className="font-serif mt-1" style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
                                Which channel wins for you?
                            </h2>
                        </div>
                        <Link
                            to="/scorecard"
                            className="btn-quick inline-flex items-center gap-2"
                            data-testid="alerts-scorecard-link"
                        >
                            All verdicts · Public scorecard <ChevronRight size={12} strokeWidth={1.5} />
                        </Link>
                    </div>
                    <TypeBreakdownTable stats={stats} />
                </section>

                {/* Filter tabs */}
                <div
                    className="mt-8 flex items-center gap-2 flex-wrap border-b"
                    style={{ borderColor: "hsl(var(--border-default))" }}
                    data-testid="alerts-filter-tabs"
                >
                    {FILTERS.map((f) => {
                        const active = filter === f.key;
                        return (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                data-testid={f.testid}
                                className="font-mono text-xs px-3 py-2 transition-colors"
                                style={{
                                    color: active ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                                    borderBottom: active ? "2px solid hsl(var(--hold))" : "2px solid transparent",
                                    letterSpacing: "0.12em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>

                {/* Alert list */}
                <div className="mt-5 space-y-3" data-testid="alerts-list">
                    {loadErr ? (
                        <div
                            className="module p-5 font-mono text-sm"
                            style={{
                                background: "hsl(var(--sell-bg))",
                                color: "hsl(var(--sell))",
                                border: "1px solid hsl(var(--sell))",
                            }}
                            data-testid="alerts-load-error"
                        >
                            {loadErr}
                        </div>
                    ) : loading ? (
                        <p className="text-sm font-mono py-8 text-center" style={{ color: "hsl(var(--text-muted))" }}>
                            <Loader2 size={14} className="animate-spin inline mr-2" /> Loading alerts…
                        </p>
                    ) : alerts.length === 0 ? (
                        <div
                            className="module p-8 text-center"
                            data-testid="alerts-empty-state"
                            style={{ background: "hsl(var(--surface-elevated))" }}
                        >
                            <Inbox size={24} strokeWidth={1.5} className="mx-auto" style={{ color: "hsl(var(--text-muted))" }} />
                            <p className="font-mono mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                                {filter === "all" && "No alerts yet — run an analysis or enable Auto-Scan to start seeing signals here."}
                                {filter === "unread" && "All caught up. Nothing unread."}
                                {filter === "starred" && "No starred alerts. Star the signals worth tracking."}
                                {filter === "taken" && "You haven't marked any trade as taken yet."}
                                {filter === "archived" && "Archive is empty."}
                            </p>
                        </div>
                    ) : (
                        alerts.map((a) => (
                            <AlertCard
                                key={a.id}
                                alert={a}
                                onStar={onStar}
                                onArchive={onArchive}
                                onTake={onTake}
                                busy={busy}
                            />
                        ))
                    )}
                </div>
            </div>
        </AppShell>
    );
}
