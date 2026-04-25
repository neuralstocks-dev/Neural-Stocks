import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import InstallAppCard from "@/components/InstallAppCard";
import { useAuth } from "@/hooks/useAuth";
import { Settings as SettingsIcon, Send, Check, X, Loader2, Copy, Unlink, ExternalLink, Radar, Lock, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";

export default function SettingsPage() {
    const { user } = useAuth();
    const [tg, setTg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [linkCode, setLinkCode] = useState(null);
    const [botUsername, setBotUsername] = useState(null);
    const [deepLink, setDeepLink] = useState(null);
    const [polling, setPolling] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const [copied, setCopied] = useState(false);
    const [autoScan, setAutoScan] = useState(null);
    const [autoScanBusy, setAutoScanBusy] = useState(false);
    const [autoScanErr, setAutoScanErr] = useState("");
    const [digest, setDigest] = useState(null);
    const [digestBusy, setDigestBusy] = useState(false);
    const [digestErr, setDigestErr] = useState("");
    const [tgPrefs, setTgPrefs] = useState(null);
    const [tgPrefsBusy, setTgPrefsBusy] = useState(false);
    const [tgPrefsErr, setTgPrefsErr] = useState("");

    const loadTgPrefs = useCallback(async () => {
        try {
            const r = await api.get("/telegram/preferences");
            setTgPrefs(r.data);
        } catch {
            // non-fatal
        }
    }, []);

    const loadAutoScan = useCallback(async () => {
        try {
            const r = await api.get("/auth/me/auto-scan");
            setAutoScan(r.data);
        } catch {
            // non-fatal — user may not be authenticated yet
        }
    }, []);

    const loadDigest = useCallback(async () => {
        try {
            const r = await api.get("/auth/me/weekly-digest");
            setDigest(r.data);
        } catch {
            // non-fatal
        }
    }, []);

    const loadStatus = useCallback(async () => {
        try {
            const r = await api.get("/telegram/status");
            setTg(r.data);
            setBotUsername(r.data.bot_username);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus();
        loadAutoScan();
        loadDigest();
        loadTgPrefs();
    }, [loadStatus, loadAutoScan, loadDigest, loadTgPrefs]);

    const beginLink = async () => {
        setErr("");
        try {
            const r = await api.post("/telegram/link");
            setLinkCode(r.data.link_code);
            setBotUsername(r.data.bot_username);
            setDeepLink(r.data.deep_link);
            setMsg("Send the 6-digit code to the bot to finalize linking.");
        } catch (e) {
            setErr(e?.response?.data?.detail || "Failed to generate link code.");
        }
    };

    const pollForLink = async () => {
        setPolling(true);
        setErr("");
        try {
            const r = await api.post("/telegram/poll");
            if (r.data.linked) {
                setTg(r.data);
                setLinkCode(null);
                setMsg("Telegram account linked successfully!");
                setTimeout(() => setMsg(""), 4000);
                loadAutoScan();
            } else {
                setMsg("Still waiting… send the code to the bot first, then click again.");
            }
        } catch (e) {
            setErr(e?.response?.data?.detail || "Poll failed.");
        } finally {
            setPolling(false);
        }
    };

    const unlink = async () => {
        if (!window.confirm("Unlink your Telegram? You'll stop receiving push alerts there.")) return;
        await api.post("/telegram/unlink");
        setTg({ ...tg, linked: false });
        setMsg("Unlinked from Telegram.");
        loadAutoScan();
        loadTgPrefs();
    };

    const sendTest = async () => {
        setErr("");
        setMsg("");
        try {
            await api.post("/telegram/test");
            setMsg("Test notification sent — check Telegram.");
            setTimeout(() => setMsg(""), 4000);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Send failed.");
        }
    };

    const copyCode = () => {
        if (!linkCode) return;
        navigator.clipboard.writeText(linkCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const toggleAutoScan = async (nextEnabled) => {
        setAutoScanErr("");
        setAutoScanBusy(true);
        try {
            await api.post("/auth/me/auto-scan", { enabled: nextEnabled });
            await loadAutoScan();
        } catch (e) {
            setAutoScanErr(e?.response?.data?.detail || "Failed to update Auto-Scan preference.");
        } finally {
            setAutoScanBusy(false);
        }
    };

    // Defensive client-side eligibility: derive from the locally cached user
    // object so admin / paid plans NEVER see a locked card even if the
    // /me/auto-scan response is stale, cached, or comes back with a falsy
    // plan_eligible flag for any reason. Server still enforces real eligibility
    // at toggle time — this just ensures the UI doesn't render an incorrectly
    // locked state to a real paid/admin user.
    const planIsPaid =
        !!user?.is_admin ||
        !!user?.test_unlock_active ||
        ["pro", "elite", "daypass"].includes(user?.plan);
    const effectiveAutoScan = autoScan
        ? {
              ...autoScan,
              plan_eligible: autoScan.plan_eligible || planIsPaid,
          }
        : autoScan;

    const toggleDigest = async (nextEnabled) => {
        setDigestErr("");
        setDigestBusy(true);
        try {
            await api.post("/auth/me/weekly-digest", { enabled: nextEnabled });
            await loadDigest();
        } catch (e) {
            setDigestErr(e?.response?.data?.detail || "Failed to update Weekly Digest preference.");
        } finally {
            setDigestBusy(false);
        }
    };

    /**
     * Toggle a single value inside one of the Telegram preference lists.
     * `kind` is "alert_types" or "alert_modes". The full updated list is
     * sent to POST /telegram/preferences which validates the subset.
     */
    const toggleTgPref = async (kind, value) => {
        if (!tgPrefs) return;
        const current = tgPrefs[kind] || [];
        const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
        setTgPrefsErr("");
        setTgPrefsBusy(true);
        // Optimistic update so the chip flips instantly
        setTgPrefs({ ...tgPrefs, [kind]: next });
        try {
            await api.post("/telegram/preferences", { [kind]: next });
        } catch (e) {
            setTgPrefsErr(e?.response?.data?.detail || "Failed to save preference.");
            // Roll back on failure
            await loadTgPrefs();
        } finally {
            setTgPrefsBusy(false);
        }
    };

    /**
     * Update the delivery schedule for a single channel. Sends a partial
     * `alert_schedule` object so the backend merges it over existing.
     */
    const setTgChannelSchedule = async (channel, schedule) => {
        if (!tgPrefs) return;
        const nextSched = { ...(tgPrefs.alert_schedule || {}), [channel]: schedule };
        setTgPrefsErr("");
        setTgPrefsBusy(true);
        setTgPrefs({ ...tgPrefs, alert_schedule: nextSched });
        try {
            await api.post("/telegram/preferences", { alert_schedule: { [channel]: schedule } });
        } catch (e) {
            setTgPrefsErr(e?.response?.data?.detail || "Failed to save schedule.");
            await loadTgPrefs();
        } finally {
            setTgPrefsBusy(false);
        }
    };

    /**
     * Apply a partial quiet-hours update. Backend merges over existing
     * fields, so the user can flip enabled / hours / tz independently.
     */
    const setQuietHours = async (patch) => {
        if (!tgPrefs) return;
        const nextQh = { ...(tgPrefs.quiet_hours || {}), ...patch };
        setTgPrefsErr("");
        setTgPrefsBusy(true);
        setTgPrefs({ ...tgPrefs, quiet_hours: nextQh });
        try {
            await api.post("/telegram/preferences", { quiet_hours: patch });
        } catch (e) {
            setTgPrefsErr(e?.response?.data?.detail || "Failed to save quiet hours.");
            await loadTgPrefs();
        } finally {
            setTgPrefsBusy(false);
        }
    };

    return (
        <AppShell user={user}>
            <div className="max-w-[900px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="settings-page">
                <p className="text-overline flex items-center gap-2">
                    <SettingsIcon size={12} strokeWidth={1.5} /> Settings · Notifications
                </p>
                <h1
                    className="font-serif mt-3"
                    style={{
                        fontSize: "clamp(2rem, 4vw, 3rem)",
                        letterSpacing: "-0.02em",
                    }}
                >
                    Get <em style={{ color: "hsl(var(--hold))" }}>alerts</em> where you are.
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Link your Telegram to receive pattern-scan and verdict alerts as push notifications — no email
                    clutter, no extra apps.
                </p>

                {/* Telegram card */}
                <section className="module p-6 md:p-8 mt-8" data-testid="telegram-module">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-overline flex items-center gap-2">
                                <Send size={12} strokeWidth={1.5} /> Telegram Alerts
                            </p>
                            <h2
                                className="font-serif mt-2"
                                style={{ fontSize: "1.6rem", letterSpacing: "-0.01em" }}
                            >
                                {tg?.linked ? "Connected" : "Connect Telegram"}
                            </h2>
                        </div>
                        {tg?.linked && (
                            <span
                                className="text-overline px-3 py-1 inline-flex items-center gap-2"
                                style={{
                                    background: "hsl(var(--buy-bg))",
                                    color: "hsl(var(--buy))",
                                    border: "1px solid hsl(var(--buy))",
                                    borderRadius: 2,
                                    fontSize: "0.58rem",
                                }}
                                data-testid="telegram-connected-badge"
                            >
                                <Check size={12} strokeWidth={2} /> LINKED
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                            <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
                        </p>
                    ) : !tg?.configured ? (
                        <div
                            className="mt-5 p-4"
                            style={{
                                background: "hsl(var(--surface-elevated))",
                                border: "1px solid hsl(var(--border-default))",
                                borderRadius: 2,
                            }}
                            data-testid="telegram-not-configured"
                        >
                            <p className="font-mono text-xs" style={{ color: "hsl(var(--hold))" }}>
                                ⚙︎ TELEGRAM BOT NOT CONFIGURED
                            </p>
                            <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                The Neulab administrator hasn't set up a Telegram bot yet. Once they do, you'll be
                                able to connect your chat here. Email notifications continue to work normally.
                            </p>
                        </div>
                    ) : tg?.linked ? (
                        <>
                            <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                You are linked{tg.telegram_username ? ` as @${tg.telegram_username}` : ""}. By default,
                                every alert and every analysis mode is pushed to your Telegram chat. Use the filters
                                below to narrow it down.
                            </p>
                            <div className="flex items-center gap-3 mt-5 flex-wrap">
                                <button
                                    onClick={sendTest}
                                    className="btn-quick inline-flex items-center gap-2"
                                    data-testid="telegram-test-button"
                                >
                                    <Send size={12} strokeWidth={1.5} /> Send test notification
                                </button>
                                <button
                                    onClick={unlink}
                                    className="btn-quick inline-flex items-center gap-2"
                                    style={{ color: "hsl(var(--sell))" }}
                                    data-testid="telegram-unlink-button"
                                >
                                    <Unlink size={12} strokeWidth={1.5} /> Unlink
                                </button>
                            </div>

                            {/* Telegram alert filters */}
                            <div
                                className="mt-7 pt-6"
                                style={{ borderTop: "1px solid hsl(var(--border-default))" }}
                                data-testid="telegram-prefs"
                            >
                                <p
                                    className="text-overline"
                                    style={{ color: "hsl(var(--hold))" }}
                                >
                                    Filter what reaches your Telegram
                                </p>
                                <p
                                    className="text-sm mt-2 mb-5 max-w-xl"
                                    style={{ color: "hsl(var(--text-secondary))" }}
                                >
                                    These filters only affect Telegram pushes — your in-app Signal Feed at{" "}
                                    <Link
                                        to="/alerts"
                                        className="underline"
                                        style={{ color: "hsl(var(--text-primary))" }}
                                    >
                                        /alerts
                                    </Link>{" "}
                                    always shows everything.
                                </p>

                                {!tgPrefs ? (
                                    <p className="text-sm font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                        <Loader2 size={12} className="animate-spin inline mr-2" />
                                        Loading filters…
                                    </p>
                                ) : (
                                    <>
                                        {/* Alert type filters */}
                                        <p
                                            className="text-overline"
                                            style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                                        >
                                            Alert channels · delivery
                                        </p>
                                        <p
                                            className="text-xs mt-1 mb-3"
                                            style={{ color: "hsl(var(--text-muted))" }}
                                        >
                                            Toggle a channel off to silence Telegram entirely. When on, choose how
                                            it's delivered: <strong>realtime</strong> pushes the moment an alert
                                            fires, <strong>daily/weekly</strong> batch them into one consolidated
                                            digest.
                                        </p>
                                        <div className="space-y-2" data-testid="tg-alert-types-row">
                                            {[
                                                { key: "signal", label: "AI Verdicts (BUY/SELL ≥75%)" },
                                                { key: "pattern", label: "Pattern Scans" },
                                                { key: "rf_watchlist_scan", label: "RF Auto-Scan" },
                                            ].map((t) => {
                                                const active = (tgPrefs.alert_types || []).includes(t.key);
                                                const sched = tgPrefs.alert_schedule?.[t.key] || "realtime";
                                                return (
                                                    <div
                                                        key={t.key}
                                                        className="flex items-center gap-2 flex-wrap"
                                                    >
                                                        <button
                                                            onClick={() => toggleTgPref("alert_types", t.key)}
                                                            disabled={tgPrefsBusy}
                                                            data-testid={`tg-type-toggle-${t.key}`}
                                                            className="font-mono text-xs px-3 py-1.5 transition-colors flex-1 min-w-[14rem] text-left"
                                                            style={{
                                                                background: active
                                                                    ? "hsl(var(--buy-bg))"
                                                                    : "hsl(var(--surface-elevated))",
                                                                color: active
                                                                    ? "hsl(var(--buy))"
                                                                    : "hsl(var(--text-muted))",
                                                                border: `1px solid ${
                                                                    active ? "hsl(var(--buy))" : "hsl(var(--border-default))"
                                                                }`,
                                                                letterSpacing: "0.06em",
                                                            }}
                                                        >
                                                            {active ? <Check size={11} className="inline mr-1.5" strokeWidth={2.5} /> : null}
                                                            {t.label}
                                                        </button>
                                                        <select
                                                            value={sched}
                                                            disabled={!active || tgPrefsBusy}
                                                            onChange={(e) => setTgChannelSchedule(t.key, e.target.value)}
                                                            data-testid={`tg-schedule-${t.key}`}
                                                            className="font-mono text-xs px-2 py-1.5"
                                                            style={{
                                                                background: "hsl(var(--surface-elevated))",
                                                                color: active ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))",
                                                                border: "1px solid hsl(var(--border-default))",
                                                                cursor: active ? "pointer" : "not-allowed",
                                                                opacity: active ? 1 : 0.5,
                                                            }}
                                                        >
                                                            <option value="realtime">Realtime</option>
                                                            <option value="digest_daily">Daily digest</option>
                                                            <option value="digest_weekly">Weekly digest</option>
                                                        </select>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Analysis mode filters */}
                                        <p
                                            className="text-overline mt-6"
                                            style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                                        >
                                            Analysis modes
                                        </p>
                                        <p
                                            className="text-xs mt-1 mb-2"
                                            style={{ color: "hsl(var(--text-muted))" }}
                                        >
                                            Only push verdicts run in these modes. (RF Auto-Scan is unaffected — it
                                            has no mode.)
                                        </p>
                                        <div className="flex flex-wrap gap-2" data-testid="tg-alert-modes-row">
                                            {[
                                                { key: "standard", label: "Standard" },
                                                { key: "candlestick", label: "Candlestick" },
                                                { key: "hybrid", label: "Hybrid (recommended)" },
                                            ].map((m) => {
                                                const active = (tgPrefs.alert_modes || []).includes(m.key);
                                                return (
                                                    <button
                                                        key={m.key}
                                                        onClick={() => toggleTgPref("alert_modes", m.key)}
                                                        disabled={tgPrefsBusy}
                                                        data-testid={`tg-mode-toggle-${m.key}`}
                                                        className="font-mono text-xs px-3 py-1.5 transition-colors"
                                                        style={{
                                                            background: active
                                                                ? "hsl(var(--buy-bg))"
                                                                : "hsl(var(--surface-elevated))",
                                                            color: active
                                                                ? "hsl(var(--buy))"
                                                                : "hsl(var(--text-muted))",
                                                            border: `1px solid ${
                                                                active ? "hsl(var(--buy))" : "hsl(var(--border-default))"
                                                            }`,
                                                            letterSpacing: "0.06em",
                                                        }}
                                                    >
                                                        {active ? <Check size={11} className="inline mr-1.5" strokeWidth={2.5} /> : null}
                                                        {m.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {tgPrefsErr && (
                                            <p
                                                className="mt-3 text-xs font-mono"
                                                style={{ color: "hsl(var(--sell))" }}
                                                data-testid="tg-prefs-error"
                                            >
                                                <X size={11} className="inline mr-1" /> {tgPrefsErr}
                                            </p>
                                        )}

                                        {/* Quiet hours */}
                                        <div
                                            className="mt-7 pt-5"
                                            style={{ borderTop: "1px dashed hsl(var(--border-default))" }}
                                            data-testid="tg-quiet-hours"
                                        >
                                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                                <div className="min-w-0">
                                                    <p
                                                        className="text-overline"
                                                        style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                                                    >
                                                        Quiet hours
                                                    </p>
                                                    <p
                                                        className="text-xs mt-1 max-w-md"
                                                        style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                                                    >
                                                        During this window, even <em>realtime</em> alerts are silently
                                                        deferred into your next daily digest — so you don't get buzzed
                                                        at 3am when the IDX market moves.
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={!!tgPrefs.quiet_hours?.enabled}
                                                    disabled={tgPrefsBusy}
                                                    onCheckedChange={(v) => setQuietHours({ enabled: v })}
                                                    data-testid="tg-qh-enabled-toggle"
                                                />
                                            </div>
                                            {tgPrefs.quiet_hours?.enabled && (
                                                <div
                                                    className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md"
                                                    data-testid="tg-qh-window"
                                                >
                                                    <div>
                                                        <p className="text-overline" style={{ fontSize: "0.52rem", color: "hsl(var(--text-muted))" }}>
                                                            Start
                                                        </p>
                                                        <select
                                                            value={tgPrefs.quiet_hours.start_hour}
                                                            onChange={(e) => setQuietHours({ start_hour: parseInt(e.target.value, 10) })}
                                                            disabled={tgPrefsBusy}
                                                            data-testid="tg-qh-start"
                                                            className="font-mono text-xs px-2 py-1.5 mt-1 w-full"
                                                            style={{
                                                                background: "hsl(var(--surface-elevated))",
                                                                color: "hsl(var(--text-primary))",
                                                                border: "1px solid hsl(var(--border-default))",
                                                            }}
                                                        >
                                                            {Array.from({ length: 24 }, (_, h) => (
                                                                <option key={h} value={h}>
                                                                    {String(h).padStart(2, "0")}:00
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <p className="text-overline" style={{ fontSize: "0.52rem", color: "hsl(var(--text-muted))" }}>
                                                            End
                                                        </p>
                                                        <select
                                                            value={tgPrefs.quiet_hours.end_hour}
                                                            onChange={(e) => setQuietHours({ end_hour: parseInt(e.target.value, 10) })}
                                                            disabled={tgPrefsBusy}
                                                            data-testid="tg-qh-end"
                                                            className="font-mono text-xs px-2 py-1.5 mt-1 w-full"
                                                            style={{
                                                                background: "hsl(var(--surface-elevated))",
                                                                color: "hsl(var(--text-primary))",
                                                                border: "1px solid hsl(var(--border-default))",
                                                            }}
                                                        >
                                                            {Array.from({ length: 24 }, (_, h) => (
                                                                <option key={h} value={h}>
                                                                    {String(h).padStart(2, "0")}:00
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="col-span-2 sm:col-span-1">
                                                        <p className="text-overline" style={{ fontSize: "0.52rem", color: "hsl(var(--text-muted))" }}>
                                                            Timezone
                                                        </p>
                                                        <select
                                                            value={tgPrefs.quiet_hours.tz}
                                                            onChange={(e) => setQuietHours({ tz: e.target.value })}
                                                            disabled={tgPrefsBusy}
                                                            data-testid="tg-qh-tz"
                                                            className="font-mono text-xs px-2 py-1.5 mt-1 w-full"
                                                            style={{
                                                                background: "hsl(var(--surface-elevated))",
                                                                color: "hsl(var(--text-primary))",
                                                                border: "1px solid hsl(var(--border-default))",
                                                            }}
                                                        >
                                                            {[
                                                                "UTC",
                                                                "America/New_York",
                                                                "America/Los_Angeles",
                                                                "Europe/London",
                                                                "Europe/Berlin",
                                                                "Asia/Jakarta",
                                                                "Asia/Singapore",
                                                                "Asia/Tokyo",
                                                                "Australia/Sydney",
                                                            ].map((tz) => (
                                                                <option key={tz} value={tz}>
                                                                    {tz}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    ) : linkCode ? (
                        <div className="mt-6" data-testid="telegram-linking-step">
                            <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                                Step 1 · Open the bot
                            </p>
                            {deepLink ? (
                                <a
                                    href={deepLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-primary inline-flex items-center gap-2 mt-2"
                                    data-testid="telegram-deep-link"
                                >
                                    <ExternalLink size={14} strokeWidth={1.5} /> Open @{botUsername} in Telegram
                                </a>
                            ) : (
                                <p className="mt-2 text-sm font-mono">
                                    Search for the bot on Telegram and start a chat.
                                </p>
                            )}

                            <p className="text-overline mt-6" style={{ color: "hsl(var(--hold))" }}>
                                Step 2 · Send this code
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                                <div
                                    className="font-mono px-5 py-3"
                                    style={{
                                        background: "hsl(var(--surface-elevated))",
                                        border: "1px dashed hsl(var(--hold))",
                                        fontSize: "1.6rem",
                                        letterSpacing: "0.3em",
                                        color: "hsl(var(--hold))",
                                        borderRadius: 2,
                                    }}
                                    data-testid="telegram-link-code"
                                >
                                    {linkCode}
                                </div>
                                <button
                                    onClick={copyCode}
                                    className="btn-quick inline-flex items-center gap-2"
                                    data-testid="telegram-copy-code"
                                >
                                    <Copy size={12} strokeWidth={1.5} /> {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>

                            <p className="text-overline mt-6" style={{ color: "hsl(var(--hold))" }}>
                                Step 3 · Confirm
                            </p>
                            <button
                                onClick={pollForLink}
                                disabled={polling}
                                className="btn-primary inline-flex items-center gap-2 mt-2"
                                data-testid="telegram-confirm-button"
                            >
                                {polling ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={1.5} />}
                                {polling ? "Checking…" : "I've sent the code"}
                            </button>
                        </div>
                    ) : (
                        <>
                            <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                Click below to generate a one-time code. You'll send it to @{botUsername || "NeulabBot"} on
                                Telegram to finalize the connection.
                            </p>
                            <button
                                onClick={beginLink}
                                className="btn-primary inline-flex items-center gap-2 mt-5"
                                data-testid="telegram-begin-link-button"
                            >
                                <Send size={14} strokeWidth={1.5} /> Connect Telegram
                            </button>
                        </>
                    )}

                    {msg && (
                        <p
                            className="mt-4 text-sm font-mono"
                            style={{ color: "hsl(var(--buy))" }}
                            data-testid="telegram-success-msg"
                        >
                            {msg}
                        </p>
                    )}
                    {err && (
                        <p
                            className="mt-4 text-sm font-mono"
                            style={{ color: "hsl(var(--sell))" }}
                            data-testid="telegram-error-msg"
                        >
                            <X size={12} className="inline mr-1" /> {err}
                        </p>
                    )}
                </section>

                {/* Watchlist Auto-Scan card */}
                <section className="module p-6 md:p-8 mt-4" data-testid="auto-scan-module">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-overline flex items-center gap-2">
                                <Radar size={12} strokeWidth={1.5} /> Watchlist Auto-Scan
                            </p>
                            <h2
                                className="font-serif mt-2"
                                style={{ fontSize: "1.6rem", letterSpacing: "-0.01em" }}
                            >
                                Daily RF pre-filter · Telegram push
                            </h2>
                            <p className="mt-3 text-sm max-w-xl" style={{ color: "hsl(var(--text-secondary))" }}>
                                Once a day, Neulab runs the Random-Forest model over every ticker on your watchlist.
                                If the model shows <strong>strong conviction</strong> (|P − 50%| &gt; 15pp), you'll get
                                a push on Telegram. This is an <em>RF-only</em> alert — not a full Claude verdict. Tap
                                Analyze in the app for the multi-lens report before acting.
                            </p>
                        </div>
                        {effectiveAutoScan && (
                            <div className="shrink-0">
                                <Switch
                                    checked={!!effectiveAutoScan?.enabled}
                                    disabled={autoScanBusy || !effectiveAutoScan?.plan_eligible || !effectiveAutoScan?.telegram_linked}
                                    onCheckedChange={toggleAutoScan}
                                    data-testid="auto-scan-toggle"
                                />
                            </div>
                        )}
                    </div>

                    {!effectiveAutoScan ? (
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                            <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
                        </p>
                    ) : !effectiveAutoScan.plan_eligible ? (
                        <div
                            className="mt-5 p-4 flex items-start gap-3"
                            style={{
                                background: "hsl(var(--surface-elevated))",
                                border: "1px solid hsl(var(--border-default))",
                                borderRadius: 2,
                            }}
                            data-testid="auto-scan-plan-locked"
                        >
                            <Lock size={14} strokeWidth={1.5} style={{ color: "hsl(var(--hold))", marginTop: 2 }} />
                            <div>
                                <p className="font-mono text-xs" style={{ color: "hsl(var(--hold))" }}>
                                    PRO / ELITE / WEEK-PASS FEATURE
                                </p>
                                <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Auto-Scan is available on paid plans.{" "}
                                    <Link
                                        to="/pricing"
                                        className="underline"
                                        style={{ color: "hsl(var(--buy))" }}
                                        data-testid="auto-scan-upgrade-link"
                                    >
                                        View plans →
                                    </Link>
                                </p>
                            </div>
                        </div>
                    ) : !effectiveAutoScan.telegram_linked ? (
                        <div
                            className="mt-5 p-4"
                            style={{
                                background: "hsl(var(--surface-elevated))",
                                border: "1px solid hsl(var(--border-default))",
                                borderRadius: 2,
                            }}
                            data-testid="auto-scan-telegram-required"
                        >
                            <p className="font-mono text-xs" style={{ color: "hsl(var(--hold))" }}>
                                ⚙︎ CONNECT TELEGRAM FIRST
                            </p>
                            <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                Auto-Scan pushes alerts to Telegram. Link your Telegram account above to enable this
                                feature.
                            </p>
                        </div>
                    ) : effectiveAutoScan.enabled ? (
                        <div className="mt-5" data-testid="auto-scan-enabled-stats">
                            <p className="text-overline" style={{ color: "hsl(var(--buy))" }}>
                                <Check size={12} strokeWidth={2} className="inline mr-2" /> Active
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-4 max-w-md">
                                <div>
                                    <p className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                        LAST SCAN
                                    </p>
                                    <p className="text-sm mt-1 font-mono">
                                        {effectiveAutoScan.last_run_at
                                            ? new Date(effectiveAutoScan.last_run_at).toLocaleString()
                                            : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                        ALERTS SENT (LAST RUN)
                                    </p>
                                    <p className="text-sm mt-1 font-mono" data-testid="auto-scan-last-alerts">
                                        {typeof effectiveAutoScan.last_alerts_sent === "number"
                                            ? effectiveAutoScan.last_alerts_sent
                                            : "—"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p
                            className="mt-5 text-sm font-mono"
                            style={{ color: "hsl(var(--text-muted))" }}
                            data-testid="auto-scan-off-hint"
                        >
                            Toggle on to start receiving daily RF-only watchlist alerts.
                        </p>
                    )}

                    {autoScanErr && (
                        <p
                            className="mt-4 text-sm font-mono"
                            style={{ color: "hsl(var(--sell))" }}
                            data-testid="auto-scan-error-msg"
                        >
                            <X size={12} className="inline mr-1" /> {autoScanErr}
                        </p>
                    )}
                </section>

                {/* Weekly RF Digest card */}
                <section className="module p-6 md:p-8 mt-4" data-testid="weekly-digest-module">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-overline flex items-center gap-2">
                                <Mail size={12} strokeWidth={1.5} /> Weekly Digest Email
                            </p>
                            <h2
                                className="font-serif mt-2"
                                style={{ fontSize: "1.6rem", letterSpacing: "-0.01em" }}
                            >
                                Sunday recap · Top RF edges
                            </h2>
                            <p className="mt-3 text-sm max-w-xl" style={{ color: "hsl(var(--text-secondary))" }}>
                                Every Sunday evening, we email you the{" "}
                                <strong>{digest?.is_paid ? "top 5" : "top 3"}</strong>{" "}
                                strongest BUY/SELL edges the Random-Forest model sees on
                                your watchlist — no Telegram required. Tap any ticker to
                                pull the full Claude verdict.
                                {!digest?.is_paid && (
                                    <>
                                        {" "}Want daily pushes instead of weekly?{" "}
                                        <Link
                                            to="/pricing"
                                            className="underline"
                                            style={{ color: "hsl(var(--buy))" }}
                                            data-testid="weekly-digest-upgrade-link"
                                        >
                                            Upgrade to Pro for Auto-Scan →
                                        </Link>
                                    </>
                                )}
                            </p>
                        </div>
                        {digest && (
                            <div className="shrink-0">
                                <Switch
                                    checked={!!digest?.enabled}
                                    disabled={digestBusy}
                                    onCheckedChange={toggleDigest}
                                    data-testid="weekly-digest-toggle"
                                />
                            </div>
                        )}
                    </div>

                    {!digest ? (
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                            <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
                        </p>
                    ) : digest.enabled ? (
                        <div className="mt-5" data-testid="weekly-digest-enabled-stats">
                            <p className="text-overline" style={{ color: "hsl(var(--buy))" }}>
                                <Check size={12} strokeWidth={2} className="inline mr-2" /> Active · Sunday evenings
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-4 max-w-md">
                                <div>
                                    <p className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                        LAST DIGEST
                                    </p>
                                    <p className="text-sm mt-1 font-mono">
                                        {digest.last_run_at
                                            ? new Date(digest.last_run_at).toLocaleString()
                                            : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                        SIGNALS IN LAST DIGEST
                                    </p>
                                    <p className="text-sm mt-1 font-mono" data-testid="weekly-digest-last-count">
                                        {typeof digest.last_signal_count === "number"
                                            ? digest.last_signal_count
                                            : "—"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p
                            className="mt-5 text-sm font-mono"
                            style={{ color: "hsl(var(--text-muted))" }}
                            data-testid="weekly-digest-off-hint"
                        >
                            Toggle on to get your first digest this Sunday evening.
                        </p>
                    )}

                    {digestErr && (
                        <p
                            className="mt-4 text-sm font-mono"
                            style={{ color: "hsl(var(--sell))" }}
                            data-testid="weekly-digest-error-msg"
                        >
                            <X size={12} className="inline mr-1" /> {digestErr}
                        </p>
                    )}
                </section>

                {/* Email info */}
                <section className="module p-6 md:p-8 mt-4" data-testid="email-module">
                    <p className="text-overline">Email</p>
                    <h2 className="font-serif mt-2" style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
                        {user?.email}
                    </h2>
                    <p className="mt-3 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                        Billing receipts and account notifications are sent to this address.
                    </p>
                </section>

                {/* Install as app (PWA) */}
                <InstallAppCard />
            </div>
        </AppShell>
    );
}
