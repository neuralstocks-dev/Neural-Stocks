/**
 * PayPal Smoke Test — admin-only diagnostic page.
 *
 * Purpose: prove the full PayPal Live round-trip end-to-end with a real card
 * (cheap $1/mo plan) before trusting the production billing flow.
 * Flow:
 *   1. GET /api/billing/smoke-test/plan  → returns client_id + $1 plan_id
 *   2. Render <PayPalButtons>, user approves with any card
 *   3. onApprove  → POST /api/billing/smoke-test/activate {subscription_id}
 *      Backend fetches the subscription with our Live creds and returns the
 *      full PayPal payload for inspection. Does NOT change the user's plan.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import AppShell from "@/components/AppShell";
import api from "@/lib/api";
import { Loader2, AlertTriangle, CheckCircle2, ArrowLeft, Shield, Copy } from "lucide-react";

export default function PaypalSmokeTestPage() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [history, setHistory] = useState([]);

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const [planR, histR] = await Promise.all([
                api.get("/billing/smoke-test/plan"),
                api.get("/billing/smoke-test/history"),
            ]);
            setConfig(planR.data);
            setHistory(histR.data.results || []);
        } catch (err) {
            setError(err?.response?.data?.detail || "Failed to load smoke-test plan");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const paypalOptions = useMemo(() => {
        if (!config?.client_id) return null;
        return {
            "client-id": config.client_id,
            vault: true,
            intent: "subscription",
            currency: "USD",
        };
    }, [config]);

    const copyJson = (obj) => {
        try {
            navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
        } catch { /* noop */ }
    };

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="smoke-test-page">
                <Link
                    to="/admin"
                    className="text-overline inline-flex items-center gap-2 mb-6"
                    style={{ color: "hsl(var(--text-muted))" }}
                    data-testid="back-to-admin"
                >
                    <ArrowLeft size={12} strokeWidth={1.5} /> Admin
                </Link>

                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                    <Shield size={11} strokeWidth={1.5} className="inline mr-1" /> Admin diagnostic
                </p>
                <h1
                    className="font-serif mt-3"
                    style={{ fontSize: "clamp(2rem, 4vw, 2.8rem)", letterSpacing: "-0.02em", lineHeight: 1.05 }}
                >
                    PayPal smoke test.<br />
                    <em style={{ color: "hsl(var(--hold))" }}>$1/mo diagnostic plan.</em>
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-relaxed" style={{ color: "hsl(var(--text-secondary))" }}>
                    Prove the full PayPal Live round-trip with a real card. On approval the server will
                    fetch the subscription from PayPal Live and surface the raw response here so we can see
                    exactly what comes back. <strong>Your plan will NOT be changed.</strong> After the test,
                    cancel the $1 recurring subscription from your PayPal account.
                </p>

                {/* Status strip */}
                <div
                    className="module mt-8 p-5 grid grid-cols-2 md:grid-cols-4 gap-5 text-xs font-mono"
                    data-testid="config-strip"
                >
                    <KV label="Environment" value={config?.env?.toUpperCase() || "—"} accent={config?.env === "live" ? "buy" : "hold"} />
                    <KV label="Client ID" value={config?.client_id ? config.client_id.slice(0, 10) + "…" : "—"} />
                    <KV label="Plan ID" value={config?.plan_id || "—"} />
                    <KV label="Price" value={config?.price != null ? `$${config.price}/mo` : "—"} />
                </div>

                {loading && (
                    <div className="mt-8 flex items-center gap-2 text-sm" style={{ color: "hsl(var(--text-muted))" }}>
                        <Loader2 size={14} className="animate-spin" /> Loading smoke-test plan…
                    </div>
                )}

                {error && (
                    <div
                        className="mt-6 p-4 flex items-start gap-3 text-sm"
                        style={{ border: "1px solid hsl(var(--sell))", background: "hsla(0,55%,55%,0.05)" }}
                        data-testid="error-banner"
                    >
                        <AlertTriangle size={16} strokeWidth={1.5} style={{ color: "hsl(var(--sell))", marginTop: 2 }} />
                        <div>
                            <p className="font-mono text-overline mb-1" style={{ color: "hsl(var(--sell))", fontSize: "0.6rem" }}>Error</p>
                            <p>{error}</p>
                        </div>
                    </div>
                )}

                {/* PayPal button */}
                {config?.plan_id && paypalOptions && (
                    <section className="mt-10" data-testid="smoke-paypal-section">
                        <p className="text-overline mb-3">Step 1 · Checkout</p>
                        <div
                            className="module p-6 md:p-8 max-w-md relative"
                            style={{ background: "hsl(var(--surface))" }}
                        >
                            {processing && (
                                <div
                                    className="absolute inset-0 grid place-items-center z-10 text-xs font-mono"
                                    style={{ background: "rgba(11,11,11,0.75)", color: "hsl(var(--hold))" }}
                                >
                                    <Loader2 size={18} className="animate-spin" />&nbsp; Verifying with PayPal…
                                </div>
                            )}
                            <p className="text-sm mb-4" style={{ color: "hsl(var(--text-secondary))" }}>
                                <strong>$1.00 USD / month.</strong>{" "}
                                Subscribe below with any card (Wise, Visa, Mastercard, Amex) or a PayPal account.
                                The yellow button uses a PayPal login; the button below it is guest-checkout card pay.
                            </p>
                            <PayPalScriptProvider options={paypalOptions}>
                                <PayPalButtons
                                    style={{
                                        layout: "vertical",
                                        color: "gold",
                                        shape: "rect",
                                        label: "subscribe",
                                        height: 42,
                                    }}
                                    disabled={processing}
                                    forceReRender={[config.plan_id]}
                                    createSubscription={(data, actions) =>
                                        actions.subscription.create({ plan_id: config.plan_id })
                                    }
                                    onApprove={async (data) => {
                                        setProcessing(true);
                                        setError("");
                                        setResult(null);
                                        try {
                                            const r = await api.post("/billing/smoke-test/activate", {
                                                subscription_id: data.subscriptionID,
                                            });
                                            setResult(r.data);
                                            // Refresh history after successful test
                                            try {
                                                const h = await api.get("/billing/smoke-test/history");
                                                setHistory(h.data.results || []);
                                            } catch { /* noop */ }
                                        } catch (err) {
                                            const status = err?.response?.status;
                                            const body = err?.response?.data;
                                            setError(
                                                `/billing/smoke-test/activate ${status || "?"} — ` +
                                                (typeof body === "string" ? body : (body?.detail || JSON.stringify(body || err?.message || "unknown")))
                                            );
                                        } finally { setProcessing(false); }
                                    }}
                                    onError={(err) => setError(`PayPal SDK error: ${err?.message || "unknown"}`)}
                                    onCancel={() => setError("Checkout cancelled by user")}
                                />
                            </PayPalScriptProvider>
                        </div>
                    </section>
                )}

                {/* Result */}
                {result && (
                    <section className="mt-10" data-testid="smoke-result-section">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: "hsl(var(--buy))" }} />
                            <p className="text-overline">Step 2 · PayPal Response</p>
                        </div>
                        <div
                            className="module p-6"
                            style={{ background: "hsl(var(--surface))" }}
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono mb-4">
                                <KV label="Subscription ID" value={result.subscription_id} />
                                <KV label="PayPal status" value={result.paypal_status} accent={result.paypal_status === "ACTIVE" ? "buy" : "hold"} />
                                <KV label="Plan ID" value={result.plan_id || "—"} />
                            </div>
                            {result.note && (
                                <p
                                    className="text-xs mt-3 p-3"
                                    style={{
                                        background: "hsla(38,45%,45%,0.06)",
                                        border: "1px solid hsl(var(--hold))",
                                        color: "hsl(var(--text-primary))",
                                    }}
                                >
                                    {result.note}
                                </p>
                            )}
                            <div className="mt-5">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-overline" style={{ fontSize: "0.55rem" }}>Raw PayPal payload</p>
                                    <button
                                        onClick={() => copyJson(result.raw)}
                                        className="text-overline flex items-center gap-1"
                                        style={{ fontSize: "0.55rem", color: "hsl(var(--text-muted))" }}
                                        data-testid="copy-raw"
                                    >
                                        <Copy size={10} strokeWidth={1.5} /> Copy JSON
                                    </button>
                                </div>
                                <pre
                                    className="text-[11px] overflow-auto p-4 font-mono"
                                    style={{
                                        background: "hsl(var(--surface-elevated))",
                                        border: "1px solid hsl(var(--border-divider))",
                                        maxHeight: 480,
                                        lineHeight: 1.5,
                                    }}
                                    data-testid="raw-payload"
                                >
                                    {JSON.stringify(result.raw, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </section>
                )}

                {/* Recent smoke tests */}
                {history.length > 0 && (
                    <section className="mt-10" data-testid="smoke-history-section">
                        <p className="text-overline mb-3">Recent diagnostics</p>
                        <div className="module overflow-hidden">
                            <table className="w-full text-xs font-mono">
                                <thead>
                                    <tr style={{ background: "hsl(var(--surface))", borderBottom: "1px solid hsl(var(--border-default))" }}>
                                        <th className="text-left py-2 px-4 text-overline" style={{ fontSize: "0.55rem" }}>When</th>
                                        <th className="text-left py-2 px-4 text-overline" style={{ fontSize: "0.55rem" }}>Admin</th>
                                        <th className="text-left py-2 px-4 text-overline" style={{ fontSize: "0.55rem" }}>Sub ID</th>
                                        <th className="text-left py-2 px-4 text-overline" style={{ fontSize: "0.55rem" }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((h) => (
                                        <tr key={h.id} style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                            <td className="py-2 px-4" style={{ color: "hsl(var(--text-muted))" }}>
                                                {(h.created_at || "").slice(0, 19).replace("T", " ")}
                                            </td>
                                            <td className="py-2 px-4">{h.admin_email || "—"}</td>
                                            <td className="py-2 px-4">{h.subscription_id}</td>
                                            <td className="py-2 px-4" style={{ color: h.paypal_status === "ACTIVE" ? "hsl(var(--buy))" : "hsl(var(--hold))" }}>
                                                {h.paypal_status || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </AppShell>
    );
}

function KV({ label, value, accent }) {
    const color = accent === "buy"
        ? "hsl(var(--buy))"
        : accent === "hold"
            ? "hsl(var(--hold))"
            : "hsl(var(--text-primary))";
    return (
        <div>
            <p
                className="text-overline mb-1"
                style={{ fontSize: "0.52rem", color: "hsl(var(--text-muted))" }}
            >
                {label}
            </p>
            <p style={{ color, wordBreak: "break-all" }}>{value || "—"}</p>
        </div>
    );
}
