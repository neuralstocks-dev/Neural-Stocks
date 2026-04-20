import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Check, Loader2, X, Sparkles, Crown, Zap, ShieldCheck } from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

const ORDER = ["free", "pro", "elite"];

const FEATURE_MATRIX = [
    { label: "Watchlist size", key: "watchlist_limit" },
    { label: "Analyses / day", key: "analyses_per_day" },
    { label: "Analyses / week", key: "analyses_per_week" },
    { label: "Quick Top/Bottom 5 sweep", key: "quick_actions", type: "bool" },
    { label: "Public share verdicts", key: "share_verdicts", type: "bool" },
    { label: "Shares / day", key: "share_per_day" },
    { label: "Analysis history retention", key: "analysis_history_days", suffix: " days" },
];

function renderValue(plan, feat) {
    const v = plan[feat.key];
    if (feat.type === "bool") {
        return v ? (
            <Check size={16} strokeWidth={1.5} style={{ color: "hsl(var(--buy))" }} />
        ) : (
            <X size={16} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
        );
    }
    if (v === null || v === undefined) {
        return <span className="font-mono" style={{ color: "hsl(var(--hold))" }}>Unlimited</span>;
    }
    return <span className="font-mono">{v}{feat.suffix || ""}</span>;
}

export default function PricingPage() {
    const { user, refreshUser } = useAuth();
    const [plans, setPlans] = useState(null);
    const [billingConfig, setBillingConfig] = useState(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(null); // planKey
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [plansRes, cfgRes] = await Promise.all([
                    api.get("/plans"),
                    api.get("/billing/config"),
                ]);
                setPlans(plansRes.data);
                setBillingConfig(cfgRes.data);
            } catch (err) {
                setError(err?.response?.data?.detail || "Failed to load pricing");
            }
        })();
    }, []);

    const downgradeToFree = async () => {
        setError("");
        setMessage("");
        setProcessing("free");
        try {
            if (user?.plan !== "free") {
                // Cancel PayPal subscription if active
                await api.post("/billing/cancel");
            }
            await refreshUser();
            setMessage("You are now on the Free plan. Subscription cancelled.");
            setTimeout(() => setMessage(""), 5000);
        } catch (err) {
            setError(err?.response?.data?.detail || "Downgrade failed");
        } finally {
            setProcessing(null);
        }
    };

    const cancelSubscription = async () => {
        if (!window.confirm("Cancel your subscription and downgrade to Free?")) return;
        setCancelling(true);
        setError("");
        setMessage("");
        try {
            const r = await api.post("/billing/cancel");
            await refreshUser();
            setMessage(r.data.message);
            setTimeout(() => setMessage(""), 5000);
        } catch (err) {
            setError(err?.response?.data?.detail || "Cancel failed");
        } finally {
            setCancelling(false);
        }
    };

    const paypalOptions = useMemo(() => {
        if (!billingConfig?.client_id) return null;
        return {
            "client-id": billingConfig.client_id,
            vault: true,
            intent: "subscription",
            currency: "USD",
            "disable-funding": "credit",
        };
    }, [billingConfig]);

    return (
        <AppShell>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="pricing-page">
                <p className="text-overline">Pricing · Subscription tiers</p>
                <h1
                    className="font-serif hero-number mt-3"
                    style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}
                >
                    Pick your edge.
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Start free. Scale your watchlist, unlock quick batch sweeps, and shareable
                    verdicts as you grow. Paid plans billed monthly via PayPal — cancel anytime.
                </p>

                {billingConfig?.env === "sandbox" && (
                    <div
                        className="mt-6 px-4 py-3 font-mono text-xs"
                        style={{
                            border: "1px solid hsl(var(--hold))",
                            color: "hsl(var(--hold))",
                            background: "hsla(38, 45%, 45%, 0.06)",
                            borderRadius: 2,
                        }}
                        data-testid="sandbox-banner"
                    >
                        <ShieldCheck size={12} className="inline mr-2" strokeWidth={1.5} />
                        SANDBOX MODE · Use a PayPal sandbox buyer account. No real charge.
                    </div>
                )}

                {message && (
                    <div className="signal-buy px-4 py-3 mt-6 font-mono text-sm" data-testid="upgrade-message">
                        {message}
                    </div>
                )}
                {error && (
                    <div className="signal-sell px-4 py-3 mt-6 font-mono text-sm" data-testid="upgrade-error">
                        {error}
                    </div>
                )}

                {(!plans || !billingConfig) && !error && (
                    <div className="py-20 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                    </div>
                )}

                {plans && billingConfig && paypalOptions && (
                    <PayPalScriptProvider options={paypalOptions}>
                        <section className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 mt-10">
                            {ORDER.map((key) => {
                                const p = plans[key];
                                const isCurrent = (user?.plan || "free") === key;
                                const icon =
                                    key === "elite" ? (
                                        <Crown size={16} strokeWidth={1.5} />
                                    ) : key === "pro" ? (
                                        <Zap size={16} strokeWidth={1.5} />
                                    ) : (
                                        <Sparkles size={16} strokeWidth={1.5} />
                                    );
                                const accent =
                                    key === "elite"
                                        ? "hsl(var(--hold))"
                                        : key === "pro"
                                        ? "hsl(var(--buy))"
                                        : "hsl(var(--text-secondary))";
                                return (
                                    <div
                                        key={key}
                                        className="module p-6 md:p-8 flex flex-col"
                                        style={{
                                            borderColor: isCurrent ? accent : undefined,
                                            borderWidth: isCurrent ? 2 : 1,
                                        }}
                                        data-testid={`plan-card-${key}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <p className="text-overline flex items-center gap-2" style={{ color: accent }}>
                                                {icon} {p.tag}
                                            </p>
                                            {isCurrent && (
                                                <span
                                                    className="text-overline font-mono px-2 py-0.5"
                                                    style={{
                                                        border: "1px solid " + accent,
                                                        color: accent,
                                                        borderRadius: 2,
                                                        fontSize: "0.56rem",
                                                    }}
                                                >
                                                    CURRENT
                                                </span>
                                            )}
                                        </div>
                                        <h3
                                            className="font-serif mt-4"
                                            style={{ fontSize: "2.4rem", letterSpacing: "-0.02em" }}
                                        >
                                            {p.name}
                                        </h3>
                                        <div className="mt-4 flex items-baseline gap-2">
                                            <span className="font-mono hero-number" style={{ fontSize: "3rem" }}>
                                                ${p.price_usd.toFixed(2)}
                                            </span>
                                            <span
                                                className="text-overline"
                                                style={{ color: "hsl(var(--text-muted))" }}
                                            >
                                                / mo
                                            </span>
                                        </div>

                                        <ul className="mt-6 space-y-3 flex-1">
                                            <FeatureLi>
                                                {p.analyses_per_day === null
                                                    ? "Unlimited analyses"
                                                    : `${p.analyses_per_day} analyses per day`}
                                            </FeatureLi>
                                            <FeatureLi>
                                                {p.analyses_per_week === null
                                                    ? "No weekly cap"
                                                    : `${p.analyses_per_week} analyses per week`}
                                            </FeatureLi>
                                            <FeatureLi>{p.watchlist_limit} stock watchlist</FeatureLi>
                                            <FeatureLi enabled={p.quick_actions}>
                                                Quick batch sweep (Top / Bottom 5)
                                            </FeatureLi>
                                            <FeatureLi enabled={p.share_verdicts}>
                                                {p.share_per_day === null
                                                    ? "Unlimited share verdicts"
                                                    : `${p.share_per_day} share verdicts / day`}
                                            </FeatureLi>
                                            <FeatureLi>
                                                {p.analysis_history_days >= 365
                                                    ? `${Math.round(p.analysis_history_days / 365)}-year analysis history`
                                                    : `${p.analysis_history_days}-day analysis history`}
                                            </FeatureLi>
                                        </ul>

                                        <div className="mt-8">
                                            {isCurrent ? (
                                                key !== "free" ? (
                                                    <button
                                                        onClick={cancelSubscription}
                                                        disabled={cancelling}
                                                        className="btn-ghost w-full"
                                                        data-testid={`cancel-${key}-button`}
                                                    >
                                                        {cancelling ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            "Cancel subscription"
                                                        )}
                                                    </button>
                                                ) : (
                                                    <button disabled className="btn-ghost w-full" data-testid={`current-${key}-button`}>
                                                        Your current plan
                                                    </button>
                                                )
                                            ) : key === "free" ? (
                                                <button
                                                    onClick={downgradeToFree}
                                                    disabled={processing === "free"}
                                                    className="btn-ghost w-full"
                                                    data-testid="downgrade-free-button"
                                                >
                                                    {processing === "free" ? (
                                                        <Loader2 size={14} className="animate-spin" />
                                                    ) : (
                                                        "Downgrade to Free"
                                                    )}
                                                </button>
                                            ) : (
                                                <PayPalSubscribeButton
                                                    planKey={key}
                                                    planId={billingConfig.plan_ids[key]}
                                                    planName={p.name}
                                                    processing={processing === key}
                                                    setProcessing={(v) => setProcessing(v ? key : null)}
                                                    onSuccess={(msg) => {
                                                        setMessage(msg);
                                                        refreshUser();
                                                        setTimeout(() => setMessage(""), 6000);
                                                    }}
                                                    onError={(m) => setError(m)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    </PayPalScriptProvider>
                )}

                {plans && (
                    <section className="module mt-6 md:mt-10 p-5 md:p-8" data-testid="feature-matrix">
                        <p className="text-overline">Feature matrix</p>
                        <h3
                            className="font-serif mt-2 mb-6"
                            style={{ fontSize: "1.8rem", letterSpacing: "-0.01em" }}
                        >
                            Side-by-side.
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        <th className="text-left text-overline py-3"></th>
                                        {ORDER.map((key) => (
                                            <th
                                                key={key}
                                                className="text-right text-overline py-3 px-4"
                                                style={{ color: "hsl(var(--text-secondary))" }}
                                            >
                                                {plans[key].name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {FEATURE_MATRIX.map((feat) => (
                                        <tr
                                            key={feat.key}
                                            style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                        >
                                            <td className="py-3 pr-4" style={{ color: "hsl(var(--text-secondary))" }}>
                                                {feat.label}
                                            </td>
                                            {ORDER.map((key) => (
                                                <td
                                                    key={key}
                                                    className="py-3 px-4 text-right"
                                                    style={{ color: "hsl(var(--text-primary))" }}
                                                >
                                                    {renderValue(plans[key], feat)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                <p className="text-overline mt-8 max-w-3xl leading-relaxed" style={{ color: "hsl(var(--text-muted))", fontSize: "0.62rem" }}>
                    Neural is an AI-assisted analysis tool. Content is for educational and informational
                    purposes only and is not investment advice. Payment processing by PayPal. Cancel
                    anytime — no refunds for partial months.
                </p>
            </div>
        </AppShell>
    );
}

function PayPalSubscribeButton({ planKey, planId, planName, processing, setProcessing, onSuccess, onError }) {
    return (
        <div className="relative" data-testid={`paypal-${planKey}-button-wrap`}>
            {processing && (
                <div
                    className="absolute inset-0 grid place-items-center z-10 font-mono text-xs"
                    style={{ background: "rgba(11,11,11,0.75)", color: "hsl(var(--hold))" }}
                >
                    <Loader2 size={16} className="animate-spin" />
                </div>
            )}
            <PayPalButtons
                style={{
                    layout: "vertical",
                    color: "gold",
                    shape: "rect",
                    label: "subscribe",
                    height: 42,
                }}
                disabled={processing}
                createSubscription={(data, actions) => {
                    return actions.subscription.create({
                        plan_id: planId,
                    });
                }}
                onApprove={async (data) => {
                    setProcessing(true);
                    try {
                        const r = await api.post("/billing/activate", {
                            subscription_id: data.subscriptionID,
                            plan: planKey,
                        });
                        onSuccess(r.data.message || `${planName} activated.`);
                    } catch (err) {
                        onError(err?.response?.data?.detail || "Activation failed");
                    } finally {
                        setProcessing(false);
                    }
                }}
                onError={(err) => {
                    onError(err?.message || "PayPal error");
                }}
                onCancel={() => {
                    onError("Checkout cancelled");
                }}
            />
        </div>
    );
}

function FeatureLi({ children, enabled = true }) {
    return (
        <li className="flex items-start gap-3 text-sm" style={{ color: enabled ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))" }}>
            {enabled ? (
                <Check size={14} strokeWidth={1.5} style={{ color: "hsl(var(--buy))", marginTop: 3 }} />
            ) : (
                <X size={14} strokeWidth={1.5} style={{ marginTop: 3 }} />
            )}
            <span style={{ textDecoration: enabled ? "none" : "line-through" }}>{children}</span>
        </li>
    );
}
