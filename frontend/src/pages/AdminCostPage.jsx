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
import { useEffect, useState, useMemo, useRef } from "react";
import { Navigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Wallet, TrendingDown, AlertTriangle, Loader2, RefreshCw, ExternalLink, Clock, Mail, MailCheck, Bell, BellOff } from "lucide-react";

const _user = () => {
    try {
        return JSON.parse(localStorage.getItem("sai_user") || "{}");
    } catch {
        return {};
    }
};

// Anchor staleness gates. Same psychology as "Last analyzed N days ago" —
// projections drift the longer it's been since a real-world refresh, so we
// nudge the admin to re-paste the latest balance.
const ANCHOR_STALE_DAYS = 7;       // amber: should refresh soon
const ANCHOR_VERY_STALE_DAYS = 14; // red: definitely refresh

function _ageDays(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    return Math.floor(ms / 86_400_000);
}

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
    // Weekly email reminder preference. Stored server-side in
    // db.app_settings._id="cost_anchor_reminder" so it survives across
    // sessions/devices. Toggled by the admin only.
    const [reminderEnabled, setReminderEnabled] = useState(false);
    const [reminderRecipient, setReminderRecipient] = useState("");
    const [reminderSaving, setReminderSaving] = useState(false);
    // Telegram low-balance alert — independent of the weekly email,
    // fires real-time when projected verdicts drop below threshold.
    const [tgAlert, setTgAlert] = useState({
        enabled: false,
        threshold: 10,
        telegram_linked: false,
        last_sent_at: null,
    });
    const [tgSaving, setTgSaving] = useState(false);
    // Ref to focus the anchor input when the admin returns from Emergent
    // (we listen for the visibilitychange event to detect the return).
    const anchorInputRef = useRef(null);
    const expectingReturnRef = useRef(false);

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
        // Pull current reminder preference once
        api.get("/admin/cost/reminder")
            .then((r) => {
                setReminderEnabled(!!r.data?.enabled);
                if (r.data?.recipient) setReminderRecipient(r.data.recipient);
            })
            .catch(() => {/* fine — defaults to false */});
        api.get("/admin/cost/tg-alert")
            .then((r) => setTgAlert((s) => ({ ...s, ...r.data })))
            .catch(() => {/* fine — defaults to disabled */});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days, isAdmin]);

    // When admin returns from the Emergent profile tab, auto-focus the
    // anchor input + select existing value so they can immediately paste
    // the new balance — saves 2-3 clicks per refresh cycle.
    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === "visible" && expectingReturnRef.current) {
                expectingReturnRef.current = false;
                setTimeout(() => {
                    anchorInputRef.current?.focus();
                    anchorInputRef.current?.select();
                }, 250);
            }
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, []);

    const openEmergent = () => {
        // Mark the return so the visibilitychange listener knows to focus.
        expectingReturnRef.current = true;
        window.open("https://app.emergent.sh/", "_blank", "noopener,noreferrer");
    };

    const toggleReminder = async () => {
        const next = !reminderEnabled;
        setReminderSaving(true);
        try {
            const body = { enabled: next };
            if (reminderRecipient && reminderRecipient.includes("@")) {
                body.recipient = reminderRecipient;
            }
            await api.post("/admin/cost/reminder", body);
            setReminderEnabled(next);
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to update reminder");
        } finally {
            setReminderSaving(false);
        }
    };

    const saveReminderRecipient = async () => {
        if (!reminderRecipient || !reminderRecipient.includes("@")) {
            setError("Enter a valid email address");
            return;
        }
        setReminderSaving(true);
        try {
            await api.post("/admin/cost/reminder", {
                enabled: reminderEnabled,
                recipient: reminderRecipient,
            });
            setError("");
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to save recipient");
        } finally {
            setReminderSaving(false);
        }
    };

    const sendTestReminder = async () => {
        try {
            const r = await api.post("/admin/cost/reminder/test-send");
            if (r.data?.sent) {
                setError("");
                window.alert(`Test email sent to ${r.data?.recipient}. Check your inbox.`);
            } else {
                const reason = r.data?.reason || "unknown";
                const detail = r.data?.error || "";
                window.alert(
                    `Reminder NOT sent (${reason}).` +
                        (detail ? `\n\n${detail}` : "") +
                        `\n\nNote: Resend's free tier only allows sending to your own verified Resend account email. Verify a domain at resend.com/domains to send to other recipients.`
                );
            }
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Test send failed");
        }
    };

    const toggleTgAlert = async () => {
        const next = !tgAlert.enabled;
        setTgSaving(true);
        try {
            await api.post("/admin/cost/tg-alert", {
                enabled: next,
                threshold: tgAlert.threshold,
            });
            setTgAlert((s) => ({ ...s, enabled: next }));
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to update Telegram alert");
        } finally {
            setTgSaving(false);
        }
    };

    const saveTgThreshold = async () => {
        const n = parseInt(tgAlert.threshold, 10);
        if (!Number.isFinite(n) || n < 1) {
            setError("Threshold must be a positive integer");
            return;
        }
        setTgSaving(true);
        try {
            await api.post("/admin/cost/tg-alert", {
                enabled: tgAlert.enabled,
                threshold: n,
            });
            setError("");
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to save threshold");
        } finally {
            setTgSaving(false);
        }
    };

    const sendTestTgAlert = async () => {
        try {
            const r = await api.post("/admin/cost/tg-alert/test-send");
            if (r.data?.sent) {
                setError("");
                window.alert(`Test Telegram alert pushed (${r.data?.verdicts_left} verdicts left). Check your Telegram chat.`);
            } else {
                const reason = r.data?.reason || "unknown";
                const hint =
                    reason === "telegram_send_failed"
                        ? "\n\nIs your Telegram chat linked? Open the dashboard, click the bell icon, and link the bot first."
                        : reason === "no_anchor"
                            ? "\n\nSet an anchor balance first."
                            : "";
                window.alert(`Telegram alert NOT sent (${reason}).${hint}`);
            }
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Test send failed");
        }
    };

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
    const anchorAge = _ageDays(anchor?.top_up_at);
    const anchorStale = anchorAge != null && anchorAge >= ANCHOR_STALE_DAYS;
    const anchorVeryStale = anchorAge != null && anchorAge >= ANCHOR_VERY_STALE_DAYS;
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
                        per AI verdict ·{" "}
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
