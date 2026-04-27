/**
 * PayPalWebhookCard — admin console module that surfaces PayPal webhook
 * health: which webhook ID is configured, whether PayPal recognises it,
 * what URL it's pointed at, which events are subscribed vs available,
 * recent received events with verify status, and a one-click "Subscribe
 * to all events" action. Read-heavy, one narrow action.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Webhook,
    ShieldCheck,
    ShieldAlert,
    ShieldOff,
    RefreshCw,
    ExternalLink,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ListChecks,
    Copy,
} from "lucide-react";
import api from "@/lib/api";

const DEFAULT_CURATED = [
    "BILLING.SUBSCRIPTION.ACTIVATED",
    "BILLING.SUBSCRIPTION.CANCELLED",
    "BILLING.SUBSCRIPTION.SUSPENDED",
    "BILLING.SUBSCRIPTION.EXPIRED",
    "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
    "PAYMENT.SALE.COMPLETED",
    "CHECKOUT.ORDER.APPROVED",
    "PAYMENT.CAPTURE.COMPLETED",
];

export default function PayPalWebhookCard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);
    const [subscribing, setSubscribing] = useState(false);
    const [subscribeMsg, setSubscribeMsg] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await api.get("/admin/paypal/webhook-diagnostics");
            setData(res.data);
        } catch (e) {
            setErr(e?.response?.data?.detail || e?.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const expectedWebhookUrl = useMemo(() => {
        const base = (data?.public_app_url || "").replace(/\/+$/, "");
        return base ? `${base}/api/billing/webhook` : null;
    }, [data]);

    const subscribedSet = useMemo(() => new Set(data?.registered?.event_types || []), [data]);
    const missingCurated = useMemo(
        () => DEFAULT_CURATED.filter((n) => !subscribedSet.has(n)),
        [subscribedSet]
    );

    const status = useMemo(() => {
        if (!data) return { tone: "neutral", label: "LOADING" };
        if (!data.webhook_id_configured) return { tone: "warn", label: "NOT CONFIGURED" };
        if (data.registered_error) return { tone: "bad", label: "NOT REGISTERED IN PAYPAL" };
        if (data.registered && missingCurated.length > 0) return { tone: "warn", label: "MISSING EVENTS" };
        if (data.registered) return { tone: "good", label: "HEALTHY" };
        return { tone: "neutral", label: "UNKNOWN" };
    }, [data, missingCurated]);

    const urlMismatch = useMemo(() => {
        if (!data?.registered?.url || !expectedWebhookUrl) return false;
        const a = data.registered.url.replace(/\/+$/, "");
        const b = expectedWebhookUrl.replace(/\/+$/, "");
        return a !== b;
    }, [data, expectedWebhookUrl]);

    const subscribeAll = async () => {
        setSubscribing(true);
        setSubscribeMsg(null);
        try {
            const res = await api.post("/admin/paypal/webhook/subscribe-events", { subscribe_all: true });
            setSubscribeMsg({ tone: "good", text: `Subscribed to ${res.data.applied_count} events.` });
            await load();
        } catch (e) {
            setSubscribeMsg({
                tone: "bad",
                text: e?.response?.data?.detail || e?.message || "Subscribe failed",
            });
        } finally {
            setSubscribing(false);
        }
    };

    const subscribeCurated = async () => {
        setSubscribing(true);
        setSubscribeMsg(null);
        try {
            const res = await api.post("/admin/paypal/webhook/subscribe-events", { event_types: DEFAULT_CURATED });
            setSubscribeMsg({ tone: "good", text: `Subscribed to ${res.data.applied_count} curated events.` });
            await load();
        } catch (e) {
            setSubscribeMsg({
                tone: "bad",
                text: e?.response?.data?.detail || e?.message || "Subscribe failed",
            });
        } finally {
            setSubscribing(false);
        }
    };

    const copy = (text) => {
        if (!text) return;
        try { navigator.clipboard.writeText(text); } catch { /* noop */ }
    };

    return (
        <section
            className="module mt-6 md:mt-10"
            data-testid="paypal-webhook-card"
        >
            <div
                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            >
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Webhook size={12} strokeWidth={1.5} /> PayPal · Webhook health
                    </p>
                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        Lifecycle event sync
                    </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <StatusChip tone={status.tone} label={status.label} />
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        className="btn-ghost !py-1.5 !px-3 !text-xs flex items-center gap-2 min-h-[32px]"
                        data-testid="webhook-refresh-button"
                    >
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </div>

            <div className="p-5 md:p-6 space-y-5">
                {err && (
                    <p className="text-sm" style={{ color: "hsl(var(--sell))" }}>
                        {err}
                    </p>
                )}

                {!loading && data && (
                    <>
                        {/* Config grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <KV label="Environment" value={data.env?.toUpperCase()} testId="webhook-env" />
                            <KV
                                label="Webhook ID"
                                value={data.webhook_id || "—"}
                                mono
                                copyable
                                onCopy={() => copy(data.webhook_id)}
                                testId="webhook-id"
                            />
                            <KV
                                label="Public App URL"
                                value={data.public_app_url || "—"}
                                mono
                                testId="webhook-public-url"
                            />
                            <KV
                                label="Events · subscribed / available"
                                value={
                                    data.registered
                                        ? `${data.registered.event_types.length} / ${data.available_event_types.length}`
                                        : "—"
                                }
                                testId="webhook-event-counts"
                            />
                        </div>

                        {/* Expected webhook URL — what to paste in PayPal dashboard */}
                        {expectedWebhookUrl && (
                            <div
                                className="p-4"
                                style={{
                                    background: "hsl(var(--surface-elevated))",
                                    border: "1px solid hsl(var(--border-default))",
                                    borderRadius: 2,
                                }}
                            >
                                <p className="text-overline mb-2">Expected webhook URL (paste into PayPal dashboard)</p>
                                <div className="flex items-center gap-2 font-mono text-xs">
                                    <code
                                        className="flex-1 px-3 py-2"
                                        style={{
                                            background: "hsl(var(--surface-base))",
                                            border: "1px solid hsl(var(--border-divider))",
                                            borderRadius: 2,
                                            wordBreak: "break-all",
                                        }}
                                    >
                                        {expectedWebhookUrl}
                                    </code>
                                    <button
                                        type="button"
                                        onClick={() => copy(expectedWebhookUrl)}
                                        className="btn-ghost !py-2 !px-3 !text-xs flex items-center gap-1.5"
                                        data-testid="copy-webhook-url"
                                    >
                                        <Copy size={12} /> Copy
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* PayPal registration state */}
                        {data.registered_error ? (
                            <div
                                className="p-4 text-sm leading-relaxed"
                                style={{
                                    background: "hsla(0,55%,55%,0.06)",
                                    border: "1px solid hsl(var(--sell))",
                                    borderRadius: 2,
                                    color: "hsl(var(--text-primary))",
                                }}
                                data-testid="webhook-not-registered-warning"
                            >
                                <p className="flex items-center gap-2 mb-2" style={{ color: "hsl(var(--sell))" }}>
                                    <XCircle size={14} strokeWidth={2} />
                                    <strong>PayPal does not recognise this webhook ID in the {data.env?.toUpperCase()} environment.</strong>
                                </p>
                                <p className="font-mono text-xs mb-3" style={{ color: "hsl(var(--text-muted))" }}>
                                    {data.registered_error}
                                </p>
                                <p className="text-xs leading-relaxed">
                                    Likely causes: (a) the webhook ID was created under sandbox but this server is live (or vice versa),
                                    (b) the webhook was deleted from the PayPal dashboard, (c) a typo was introduced in{" "}
                                    <code>backend/.env</code> <code>PAYPAL_WEBHOOK_ID</code>. Fix: either create a new webhook at{" "}
                                    <a
                                        href="https://developer.paypal.com/dashboard/applications/live"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline decoration-dotted inline-flex items-center gap-1"
                                        style={{ color: "hsl(var(--accent-primary))" }}
                                    >
                                        PayPal · Apps &amp; Credentials <ExternalLink size={10} />
                                    </a>
                                    , paste the URL above into the webhook, copy the new webhook ID, and update{" "}
                                    <code>PAYPAL_WEBHOOK_ID</code> in <code>backend/.env</code> (then restart backend).
                                </p>
                            </div>
                        ) : data.registered ? (
                            <div
                                className="p-4 text-sm leading-relaxed"
                                style={{
                                    background: urlMismatch ? "hsla(40,80%,55%,0.06)" : "hsla(142,55%,45%,0.04)",
                                    border: `1px solid ${urlMismatch ? "hsl(var(--hold))" : "hsl(var(--buy))"}`,
                                    borderRadius: 2,
                                }}
                                data-testid="webhook-registered-block"
                            >
                                <p className="flex items-center gap-2 mb-2" style={{ color: urlMismatch ? "hsl(var(--hold))" : "hsl(var(--buy))" }}>
                                    {urlMismatch ? <AlertTriangle size={14} strokeWidth={2} /> : <CheckCircle2 size={14} strokeWidth={2} />}
                                    <strong>
                                        {urlMismatch
                                            ? "Webhook is registered, but points at a different URL than PUBLIC_APP_URL."
                                            : "Webhook is registered with PayPal and pointed at the correct URL."}
                                    </strong>
                                </p>
                                <p className="text-xs font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                    PayPal → <span style={{ color: "hsl(var(--text-primary))" }}>{data.registered.url}</span>
                                </p>
                                {urlMismatch && (
                                    <p className="text-xs mt-2">
                                        To fix: go to the PayPal dashboard, edit this webhook, and set its URL to{" "}
                                        <code>{expectedWebhookUrl}</code>.
                                    </p>
                                )}
                            </div>
                        ) : null}

                        {/* Subscribed events */}
                        {data.registered && (
                            <div>
                                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                                    <p className="text-overline flex items-center gap-2">
                                        <ListChecks size={12} strokeWidth={1.5} /> Subscribed events · {data.registered.event_types.length}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={subscribeCurated}
                                            disabled={subscribing}
                                            className="btn-ghost !py-1.5 !px-3 !text-xs min-h-[32px]"
                                            data-testid="subscribe-curated-events"
                                        >
                                            {subscribing ? "Subscribing…" : `Subscribe curated (${DEFAULT_CURATED.length})`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={subscribeAll}
                                            disabled={subscribing}
                                            className="btn-ghost !py-1.5 !px-3 !text-xs min-h-[32px]"
                                            data-testid="subscribe-all-events"
                                        >
                                            {subscribing ? "Subscribing…" : `Subscribe ALL (${data.available_event_types.length})`}
                                        </button>
                                    </div>
                                </div>

                                {subscribeMsg && (
                                    <p
                                        className="text-xs mb-3"
                                        style={{ color: subscribeMsg.tone === "good" ? "hsl(var(--buy))" : "hsl(var(--sell))" }}
                                    >
                                        {subscribeMsg.text}
                                    </p>
                                )}

                                {missingCurated.length > 0 && (
                                    <div
                                        className="p-3 mb-3 text-xs"
                                        style={{
                                            background: "hsla(40,80%,55%,0.06)",
                                            border: "1px solid hsl(var(--hold))",
                                            borderRadius: 2,
                                        }}
                                    >
                                        <p className="mb-1" style={{ color: "hsl(var(--hold))" }}>
                                            <strong>Missing {missingCurated.length} curated event(s) — renewals / cancellations may not sync:</strong>
                                        </p>
                                        <p className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                            {missingCurated.join(" · ")}
                                        </p>
                                    </div>
                                )}

                                <div
                                    className="font-mono text-xs p-3 max-h-40 overflow-y-auto"
                                    style={{
                                        background: "hsl(var(--surface-base))",
                                        border: "1px solid hsl(var(--border-divider))",
                                        borderRadius: 2,
                                        color: "hsl(var(--text-secondary))",
                                    }}
                                    data-testid="webhook-subscribed-list"
                                >
                                    {data.registered.event_types.length === 0
                                        ? "— (none)"
                                        : data.registered.event_types.join("  ·  ")}
                                </div>
                            </div>
                        )}

                        {/* Recent events + stats */}
                        <div>
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                <p className="text-overline">Recent events · {data.stats.total} total</p>
                                <div className="flex items-center gap-3 text-xs font-mono">
                                    <span style={{ color: "hsl(var(--buy))" }}>
                                        <ShieldCheck size={10} className="inline mr-1" /> {data.stats.verified} verified
                                    </span>
                                    <span style={{ color: "hsl(var(--sell))" }}>
                                        <ShieldOff size={10} className="inline mr-1" /> {data.stats.unverified} unverified
                                    </span>
                                </div>
                            </div>
                            {data.recent_events.length === 0 ? (
                                <p className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                    No webhook events received yet. Once your production domain is live and PayPal starts pushing
                                    real events, they'll appear here.
                                </p>
                            ) : (
                                <div
                                    className="overflow-x-auto"
                                    style={{
                                        background: "hsl(var(--surface-base))",
                                        border: "1px solid hsl(var(--border-divider))",
                                        borderRadius: 2,
                                    }}
                                >
                                    <table className="w-full font-mono text-xs" data-testid="webhook-recent-events">
                                        <thead>
                                            <tr style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                                <Th>Event</Th>
                                                <Th>Subscription</Th>
                                                <Th>Received</Th>
                                                <Th>Verified</Th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.recent_events.map((ev) => (
                                                <tr
                                                    key={ev.id}
                                                    style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                                >
                                                    <Td>{ev.event_type}</Td>
                                                    <Td>{ev.subscription_id || "—"}</Td>
                                                    <Td>{(ev.received_at || "").replace("T", " ").slice(0, 19)}</Td>
                                                    <Td>
                                                        {ev.verified ? (
                                                            <span style={{ color: "hsl(var(--buy))" }}>
                                                                <ShieldCheck size={11} className="inline mr-1" /> yes
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: "hsl(var(--sell))" }}>
                                                                <ShieldAlert size={11} className="inline mr-1" /> no
                                                            </span>
                                                        )}
                                                    </Td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

function KV({ label, value, mono, copyable, onCopy, testId }) {
    return (
        <div data-testid={testId}>
            <p className="text-overline mb-1" style={{ fontSize: "0.56rem" }}>{label}</p>
            <p
                className={`${mono ? "font-mono" : ""} text-sm leading-snug break-all`}
                style={{ color: "hsl(var(--text-primary))" }}
            >
                {value}
                {copyable && value && value !== "—" && (
                    <button
                        type="button"
                        onClick={onCopy}
                        className="ml-2 opacity-60 hover:opacity-100 transition-opacity inline-flex align-middle"
                        title="Copy"
                    >
                        <Copy size={11} />
                    </button>
                )}
            </p>
        </div>
    );
}

function StatusChip({ tone, label }) {
    const palette = {
        good: { c: "hsl(var(--buy))", bg: "hsl(var(--buy-bg))" },
        warn: { c: "hsl(var(--hold))", bg: "hsl(var(--hold-bg))" },
        bad: { c: "hsl(var(--sell))", bg: "hsl(var(--sell-bg))" },
        neutral: { c: "hsl(var(--text-muted))", bg: "hsl(var(--surface-elevated))" },
    }[tone] || { c: "hsl(var(--text-muted))", bg: "hsl(var(--surface-elevated))" };
    return (
        <span
            className="font-mono inline-flex items-center gap-1.5 px-2 py-1"
            style={{
                color: palette.c,
                background: palette.bg,
                border: `1px solid ${palette.c}`,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                borderRadius: 2,
            }}
            data-testid="webhook-status-chip"
        >
            {label}
        </span>
    );
}

function Th({ children }) {
    return (
        <th
            className="px-3 py-2 text-left text-overline"
            style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem", fontWeight: 500 }}
        >
            {children}
        </th>
    );
}

function Td({ children }) {
    return (
        <td className="px-3 py-2 align-top" style={{ color: "hsl(var(--text-primary))" }}>
            {children}
        </td>
    );
}
