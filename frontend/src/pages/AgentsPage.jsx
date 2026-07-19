import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
    Bot,
    Loader2,
    Lock,
    Play,
    Trash2,
    History,
    Send as SendIcon,
    Plus,
} from "lucide-react";

const WEEKDAYS = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
];

const TIMEZONES = [
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "UTC",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Jakarta",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
];

const SCREENER_TYPES = [
    {
        value: "relative_strength_screener",
        label: "Relative Strength Screener",
        description:
            "Stocks near their all-time high on a day the market is down, with a track record " +
            "of beating both earnings and guidance expectations. $10B+ market cap, S&P 500 universe.",
    },
];

function fmtDate(iso) {
    if (!iso) return "Never";
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function CreateAgentForm({ onCreate, busy, onCancel }) {
    const [days, setDays] = useState(new Set(["mon", "tue", "wed", "thu", "fri"]));
    const [hour, setHour] = useState(9);
    const [timezone, setTimezone] = useState("America/New_York");
    const [deliverTelegram, setDeliverTelegram] = useState(true);
    const [err, setErr] = useState("");

    const toggleDay = (key) => {
        const next = new Set(days);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        setDays(next);
    };

    const submit = async () => {
        if (days.size === 0) {
            setErr("Pick at least one day.");
            return;
        }
        setErr("");
        try {
            await onCreate({
                agent_type: "relative_strength_screener",
                schedule: {
                    days: Array.from(days),
                    time: `${String(hour).padStart(2, "0")}:00`,
                    timezone,
                },
                deliver_telegram: deliverTelegram,
            });
        } catch (e) {
            setErr(e?.response?.data?.detail || "Couldn't create agent — try again.");
        }
    };

    return (
        <div className="module p-6" data-testid="agent-create-form">
            <p className="text-overline">Create agent</p>
            <div className="mt-4">
                <p className="text-overline" style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}>
                    Screener
                </p>
                <select
                    value="relative_strength_screener"
                    disabled
                    className="font-mono text-sm px-3 py-2 mt-1 w-full"
                    style={{
                        background: "hsl(var(--surface-elevated))",
                        color: "hsl(var(--text-primary))",
                        border: "1px solid hsl(var(--border-default))",
                    }}
                    data-testid="agent-type-select"
                >
                    {SCREENER_TYPES.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
                <p className="mt-2 text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                    {SCREENER_TYPES[0].description}
                </p>
            </div>

            <div className="mt-5">
                <p className="text-overline" style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}>
                    Days
                </p>
                <div className="flex flex-wrap gap-2 mt-2" data-testid="agent-weekday-picker">
                    {WEEKDAYS.map((d) => {
                        const active = days.has(d.key);
                        return (
                            <button
                                key={d.key}
                                type="button"
                                onClick={() => toggleDay(d.key)}
                                data-testid={`agent-weekday-${d.key}`}
                                className="font-mono text-xs px-3 py-2 transition-colors"
                                style={{
                                    background: active ? "hsl(var(--hold))" : "hsl(var(--surface-elevated))",
                                    color: active ? "hsl(var(--surface))" : "hsl(var(--text-secondary))",
                                    border: "1px solid hsl(var(--border-default))",
                                }}
                            >
                                {d.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-5">
                <div>
                    <p className="text-overline" style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}>
                        Time
                    </p>
                    <select
                        value={hour}
                        onChange={(e) => setHour(parseInt(e.target.value, 10))}
                        className="font-mono text-sm px-3 py-2 mt-1 w-full"
                        style={{
                            background: "hsl(var(--surface-elevated))",
                            color: "hsl(var(--text-primary))",
                            border: "1px solid hsl(var(--border-default))",
                        }}
                        data-testid="agent-hour-select"
                    >
                        {Array.from({ length: 24 }, (_, h) => (
                            <option key={h} value={h}>
                                {String(h).padStart(2, "0")}:00
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <p className="text-overline" style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}>
                        Timezone
                    </p>
                    <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="font-mono text-sm px-3 py-2 mt-1 w-full"
                        style={{
                            background: "hsl(var(--surface-elevated))",
                            color: "hsl(var(--text-primary))",
                            border: "1px solid hsl(var(--border-default))",
                        }}
                        data-testid="agent-timezone-select"
                    >
                        {TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>
                                {tz}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <label className="flex items-center gap-2 mt-5 font-mono text-sm cursor-pointer" style={{ color: "hsl(var(--text-secondary))" }}>
                <input
                    type="checkbox"
                    checked={deliverTelegram}
                    onChange={(e) => setDeliverTelegram(e.target.checked)}
                    data-testid="agent-telegram-toggle"
                />
                Also send results to Telegram
            </label>

            {err && (
                <p className="mt-3 text-xs font-mono" style={{ color: "hsl(var(--sell))" }} data-testid="agent-create-error">
                    {err}
                </p>
            )}

            <div className="flex items-center gap-3 mt-6">
                <button
                    onClick={submit}
                    disabled={busy}
                    className="btn-quick inline-flex items-center gap-2"
                    data-testid="agent-create-submit"
                >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={1.8} />}
                    Create agent
                </button>
                <button onClick={onCancel} disabled={busy} className="btn-quick" data-testid="agent-create-cancel">
                    Cancel
                </button>
            </div>
        </div>
    );
}

function AgentCard({ agent, onToggle, onDelete, onRunNow, busy }) {
    const schedule = agent.schedule || {};
    const dayLabel = (schedule.days || [])
        .map((d) => WEEKDAYS.find((w) => w.key === d)?.label || d)
        .join(", ");

    return (
        <article className="module p-5" data-testid={`agent-card-${agent.id}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span
                            className="font-mono text-xs inline-flex items-center gap-1.5 px-2 py-1"
                            style={{
                                background: "hsl(var(--surface-elevated))",
                                color: "hsl(var(--hold))",
                                letterSpacing: "0.1em",
                                border: "1px solid hsl(var(--hold))33",
                            }}
                        >
                            <Bot size={11} strokeWidth={1.5} /> Relative Strength Screener
                        </span>
                        <span
                            className="font-mono text-xs px-2 py-1"
                            style={{
                                background: agent.enabled ? "hsl(var(--buy-bg))" : "hsl(var(--surface-elevated))",
                                color: agent.enabled ? "hsl(var(--buy))" : "hsl(var(--text-muted))",
                                letterSpacing: "0.1em",
                            }}
                            data-testid={`agent-status-${agent.id}`}
                        >
                            {agent.enabled ? "ENABLED" : "DISABLED"}
                        </span>
                    </div>
                    <p className="mt-3 text-sm font-mono" style={{ color: "hsl(var(--text-primary))" }}>
                        {dayLabel} · {schedule.time} {schedule.timezone}
                        {agent.deliver_telegram && (
                            <span className="ml-2 inline-flex items-center gap-1" style={{ color: "hsl(var(--text-secondary))" }}>
                                <SendIcon size={11} strokeWidth={1.5} /> Telegram
                            </span>
                        )}
                    </p>
                    <p className="mt-2 text-xs font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                        Last run: {fmtDate(agent.last_run_at)}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => onRunNow(agent)}
                        disabled={busy}
                        className="btn-quick inline-flex items-center gap-1.5"
                        title="Run now"
                        data-testid={`agent-run-now-${agent.id}`}
                    >
                        <Play size={13} strokeWidth={1.5} />
                        <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-wider">Run now</span>
                    </button>
                    <Link
                        to={`/agents/${agent.id}/runs`}
                        className="btn-quick inline-flex items-center gap-1.5"
                        title="Run history"
                        data-testid={`agent-history-link-${agent.id}`}
                    >
                        <History size={13} strokeWidth={1.5} />
                    </Link>
                    <button
                        onClick={() => onToggle(agent)}
                        disabled={busy}
                        className="btn-quick"
                        data-testid={`agent-toggle-${agent.id}`}
                    >
                        {agent.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                        onClick={() => onDelete(agent)}
                        disabled={busy}
                        className="btn-quick"
                        title="Delete"
                        data-testid={`agent-delete-${agent.id}`}
                    >
                        <Trash2 size={13} strokeWidth={1.5} style={{ color: "hsl(var(--sell))" }} />
                    </button>
                </div>
            </div>
        </article>
    );
}

export default function AgentsPage() {
    const { user } = useAuth();
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState("");
    const [busy, setBusy] = useState(false);
    const [showCreate, setShowCreate] = useState(false);

    // Same defensive client-side eligibility pattern as SettingsPage.jsx —
    // server still enforces the real gate on every mutating call.
    const planIsPaid =
        !!user?.is_admin ||
        !!user?.test_unlock_active ||
        !!user?.test_unlock_expires_at ||
        ["pro", "elite", "daypass"].includes(user?.plan);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadErr("");
        try {
            const res = await api.get("/agents");
            setAgents(res.data?.agents || []);
        } catch (e) {
            setLoadErr(e?.response?.data?.detail || "Couldn't load agents. Reload the page to retry.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const hasEnabledAgent = agents.some((a) => a.enabled);

    const onCreate = async (payload) => {
        setBusy(true);
        try {
            await api.post("/agents", payload);
            setShowCreate(false);
            await load();
        } finally {
            setBusy(false);
        }
    };

    const onToggle = async (agent) => {
        setBusy(true);
        try {
            await api.patch(`/agents/${agent.id}`, { enabled: !agent.enabled });
            await load();
        } catch (e) {
            window.alert(e?.response?.data?.detail || "Couldn't update this agent — try again."); // eslint-disable-line no-alert
        } finally {
            setBusy(false);
        }
    };

    const onDelete = async (agent) => {
        if (!window.confirm("Delete this agent? Its run history will remain visible.")) return; // eslint-disable-line no-alert
        setBusy(true);
        try {
            await api.delete(`/agents/${agent.id}`);
            await load();
        } finally {
            setBusy(false);
        }
    };

    const onRunNow = async (agent) => {
        setBusy(true);
        try {
            await api.post(`/agents/${agent.id}/run-now`);
            window.alert("Run started — check the history tab shortly for results."); // eslint-disable-line no-alert
            await load();
        } catch (e) {
            window.alert(e?.response?.data?.detail || "Couldn't trigger a run — try again."); // eslint-disable-line no-alert
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-[1100px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="agents-page">
            <p className="text-overline flex items-center gap-2">
                <Bot size={12} strokeWidth={1.5} /> Scheduled Agents
            </p>
            <h1 className="font-serif mt-3" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.02em" }}>
                Screens that run <em style={{ color: "hsl(var(--hold))" }}>while you sleep</em>.
            </h1>
            <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                Configure a screener to run automatically on a schedule. Results land here in-app
                and, optionally, in your linked Telegram chat.
            </p>

            {!planIsPaid ? (
                <div
                    className="module p-8 mt-8 text-center"
                    data-testid="agents-locked-state"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                >
                    <Lock size={22} strokeWidth={1.5} className="mx-auto" style={{ color: "hsl(var(--text-muted))" }} />
                    <p className="font-mono mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                        Scheduled Agents is a Pro+ feature.
                    </p>
                    <Link
                        to="/pricing"
                        className="text-overline inline-block mt-3"
                        style={{ color: "hsl(var(--hold))" }}
                        data-testid="agents-upgrade-link"
                    >
                        Unlock Scheduled Agents →
                    </Link>
                </div>
            ) : (
                <>
                    <div className="mt-8">
                        {showCreate ? (
                            <CreateAgentForm onCreate={onCreate} busy={busy} onCancel={() => setShowCreate(false)} />
                        ) : hasEnabledAgent ? (
                            <p
                                className="text-sm font-mono module p-4"
                                style={{ color: "hsl(var(--text-muted))" }}
                                data-testid="agents-cap-notice"
                            >
                                You have an active agent already — disable it to create another (1 active agent at a time).
                            </p>
                        ) : (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="btn-quick inline-flex items-center gap-2"
                                data-testid="agent-show-create"
                            >
                                <Plus size={13} strokeWidth={1.8} /> Create agent
                            </button>
                        )}
                    </div>

                    <div className="mt-6 space-y-3" data-testid="agents-list">
                        {loadErr ? (
                            <div
                                className="module p-5 font-mono text-sm"
                                style={{ background: "hsl(var(--sell-bg))", color: "hsl(var(--sell))", border: "1px solid hsl(var(--sell))" }}
                                data-testid="agents-load-error"
                            >
                                {loadErr}
                            </div>
                        ) : loading ? (
                            <p className="text-sm font-mono py-8 text-center" style={{ color: "hsl(var(--text-muted))" }}>
                                <Loader2 size={14} className="animate-spin inline mr-2" /> Loading agents…
                            </p>
                        ) : agents.length === 0 ? (
                            <div
                                className="module p-8 text-center"
                                data-testid="agents-empty-state"
                                style={{ background: "hsl(var(--surface-elevated))" }}
                            >
                                <Bot size={24} strokeWidth={1.5} className="mx-auto" style={{ color: "hsl(var(--text-muted))" }} />
                                <p className="font-mono mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                                    No agents yet — create one above to start screening on a schedule.
                                </p>
                            </div>
                        ) : (
                            agents.map((a) => (
                                <AgentCard
                                    key={a.id}
                                    agent={a}
                                    onToggle={onToggle}
                                    onDelete={onDelete}
                                    onRunNow={onRunNow}
                                    busy={busy}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
