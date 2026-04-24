import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import InstallAppCard from "@/components/InstallAppCard";
import { useAuth } from "@/hooks/useAuth";
import { Settings as SettingsIcon, Send, Check, X, Loader2, Copy, Unlink, ExternalLink } from "lucide-react";

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
    }, [loadStatus]);

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
