import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import InstallAppCard from "@/components/InstallAppCard";
import { useAuth } from "@/hooks/useAuth";
import { Settings as SettingsIcon, Send, Check, X, Loader2, Copy, Unlink, ExternalLink, Radar, Lock } from "lucide-react";
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

    const loadAutoScan = useCallback(async () => {
        try {
            const r = await api.get("/auth/me/auto-scan");
            setAutoScan(r.data);
        } catch {
            // non-fatal — user may not be authenticated yet
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
    }, [loadStatus, loadAutoScan]);

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
                                You are linked{tg.telegram_username ? ` as @${tg.telegram_username}` : ""}. All
                                pattern alerts and verdict notifications will be pushed to your Telegram chat.
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
                        {autoScan && (
                            <div className="shrink-0">
                                <Switch
                                    checked={!!autoScan?.enabled}
                                    disabled={autoScanBusy || !autoScan?.plan_eligible || !autoScan?.telegram_linked}
                                    onCheckedChange={toggleAutoScan}
                                    data-testid="auto-scan-toggle"
                                />
                            </div>
                        )}
                    </div>

                    {!autoScan ? (
                        <p className="mt-4 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                            <Loader2 size={14} className="animate-spin inline mr-2" /> Loading…
                        </p>
                    ) : !autoScan.plan_eligible ? (
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
                    ) : !autoScan.telegram_linked ? (
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
                    ) : autoScan.enabled ? (
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
                                        {autoScan.last_run_at
                                            ? new Date(autoScan.last_run_at).toLocaleString()
                                            : "—"}
                                    </p>
                                </div>
                                <div>
                                    <p className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                        ALERTS SENT (LAST RUN)
                                    </p>
                                    <p className="text-sm mt-1 font-mono" data-testid="auto-scan-last-alerts">
                                        {typeof autoScan.last_alerts_sent === "number"
                                            ? autoScan.last_alerts_sent
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
