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
    { label: "Standard AI analysis", key: "__always", type: "bool" },
    { label: "Candlestick & Hybrid (AI + Candlestick) modes", key: "quick_actions", type: "bool" },
    { label: "Watchlist pattern scan (15 candlestick patterns)", key: "quick_actions", type: "bool" },
    { label: "Quick batch sweep (Top / Bottom 3)", key: "quick_actions", type: "bool" },
    { label: "Public share verdicts", key: "share_verdicts", type: "bool" },
    { label: "Shares / day", key: "share_per_day" },
    { label: "Analysis history retention", key: "analysis_history_days", suffix: " days" },
];

function renderValue(plan, feat) {
    // Synthetic "always on" rows (standard AI is available to everyone)
    if (feat.key === "__always") {
        return (
            <div className="flex justify-end">
                <Check size={16} strokeWidth={1.5} style={{ color: "hsl(var(--buy))" }} />
            </div>
        );
    }
    const v = plan[feat.key];
    if (feat.type === "bool") {
        return (
            <div className="flex justify-end">
                {v ? (
                    <Check size={16} strokeWidth={1.5} style={{ color: "hsl(var(--buy))" }} />
                ) : (
                    <X size={16} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
                )}
            </div>
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
    const [quota, setQuota] = useState(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [cycle, setCycle] = useState("monthly"); // "monthly" | "yearly"

    useEffect(() => {
        (async () => {
            try {
                const [plansRes, cfgRes, quotaRes] = await Promise.all([
                    api.get("/plans"),
                    api.get("/billing/config"),
                    api.get("/quota"),
                ]);
                setPlans(plansRes.data);
                setBillingConfig(cfgRes.data);
                setQuota(quotaRes.data);
            } catch (err) {
                setError(err?.response?.data?.detail || "Failed to load pricing");
            }
        })();
    }, []);

    const downgradeToFree = async () => {
        setError(""); setMessage(""); setProcessing("free");
        try {
            if (user?.plan !== "free") await api.post("/billing/cancel");
            await refreshUser();
            setMessage("You are now on the Free plan.");
            setTimeout(() => setMessage(""), 5000);
        } catch (err) {
            setError(err?.response?.data?.detail || "Downgrade failed");
        } finally { setProcessing(null); }
    };

    const cancelSubscription = async () => {
        if (!window.confirm("Cancel your PayPal subscription? You'll keep full access until the end of your current billing period, then revert to Free. No further charges.")) return;
        setCancelling(true); setError(""); setMessage("");
        try {
            const r = await api.post("/billing/cancel");
            // Refresh quota to pick up subscription_status=CANCELLED + cancels_at
            const quotaRes = await api.get("/quota");
            setQuota(quotaRes.data);
            await refreshUser();
            setMessage(r.data.message);
            setTimeout(() => setMessage(""), 8000);
        } catch (err) {
            setError(err?.response?.data?.detail || "Cancel failed");
        } finally { setCancelling(false); }
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

    const priceFor = (planKey, p) => {
        if (planKey === "free") return 0;
        return cycle === "yearly" ? p.price_yearly : p.price_usd;
    };

    const discountPct = plans?.pro?.annual_discount_pct || 20;

    return (
        <AppShell>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="pricing-page">
                <p className="text-overline">Pricing · Subscription tiers</p>
                <h1 className="font-serif hero-number mt-3" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>
                    Pick your edge.
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Start free. Scale your watchlist, unlock quick batch sweeps, and shareable
                    verdicts as you grow. Billed via PayPal — cancel anytime.
                </p>

                {billingConfig?.env === "sandbox" && (
                    <div className="mt-6 px-4 py-3 font-mono text-xs"
                        style={{
                            border: "1px solid hsl(var(--hold))",
                            color: "hsl(var(--hold))",
                            background: "hsla(38, 45%, 45%, 0.06)",
                            borderRadius: 2,
                        }}
                        data-testid="sandbox-banner">
                        <ShieldCheck size={12} className="inline mr-2" strokeWidth={1.5} />
                        SANDBOX MODE · Use a PayPal sandbox buyer account. No real charge.
                    </div>
                )}

                {/* Test-unlock / Admin banner: shown when user has unlocked all features without paying */}
                {(quota?.test_unlock_active || quota?.is_admin) && (
                    <div
                        className="mt-4 px-5 py-4"
                        style={{
                            border: "1px solid hsl(var(--hold))",
                            background: "hsla(38, 45%, 45%, 0.08)",
                            borderRadius: 2,
                        }}
                        data-testid="test-unlock-banner"
                    >
                        <div className="flex items-start gap-3">
                            <Crown size={14} strokeWidth={1.5} style={{ color: "hsl(var(--hold))", marginTop: 2 }} />
                            <div>
                                <p className="text-overline mb-1" style={{ color: "hsl(var(--hold))" }}>
                                    {quota.is_admin ? "Admin account · all features unlocked" : "Admin test-unlock active"}
                                </p>
                                <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-primary))" }}>
                                    {quota.is_admin ? (
                                        <>
                                            You are signed in as an <strong>admin</strong>. Subscription payments are <strong>not active</strong> for your account — all features across <strong>Free, Pro, and Elite tiers are unlocked</strong>. Free tier behaves the same as Elite, and Pro behaves the same as Elite.
                                        </>
                                    ) : (
                                        <>
                                            Your account has an <strong>admin-granted test unlock</strong>. Subscription payments are <strong>not active</strong> — all features across <strong>Free, Pro, and Elite tiers are unlocked</strong>. Free tier behaves the same as Elite, and Pro behaves the same as Elite.
                                            {quota.test_unlock_expires_at && quota.test_unlock_expires_at !== "forever" && (
                                                <> Test unlock expires <span className="font-mono">{new Date(quota.test_unlock_expires_at).toLocaleString()}</span>.</>
                                            )}
                                            {quota.test_unlock_expires_at === "forever" && <> Test unlock has no expiry.</>}
                                        </>
                                    )}
                                </p>
                                <p className="text-xs mt-2 font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                    Subscribe buttons below are informational only while unlocked.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Cancelled-at-period-end banner */}
                {quota?.subscription_status === "CANCELLED" && quota?.subscription_cancels_at && (
                    <div
                        className="mt-4 px-5 py-4"
                        style={{
                            border: "1px solid hsl(var(--sell))",
                            background: "hsla(0, 65%, 50%, 0.06)",
                            borderRadius: 2,
                        }}
                        data-testid="subscription-cancelled-banner"
                    >
                        <p className="text-overline mb-1" style={{ color: "hsl(var(--sell))" }}>
                            Subscription cancelled · access ending soon
                        </p>
                        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--text-primary))" }}>
                            Your {quota.plan_name} subscription is cancelled. You keep full access until{" "}
                            <span className="font-mono" style={{ color: "hsl(var(--hold))" }}>
                                {new Date(quota.subscription_cancels_at).toLocaleString()}
                            </span>
                            , then revert to Free. You will not be charged again. Re-subscribe anytime to keep your access.
                        </p>
                    </div>
                )}

                {/* Monthly / Yearly toggle */}
                {plans && (
                    <div className="mt-8 flex items-center justify-center gap-0" data-testid="cycle-toggle">
                        <div
                            className="inline-flex"
                            style={{
                                border: "1px solid hsl(var(--border-default))",
                                borderRadius: 2,
                                padding: 3,
                                background: "hsl(var(--surface-elevated))",
                            }}
                        >
                            <CycleTab active={cycle === "monthly"} onClick={() => setCycle("monthly")} testid="cycle-monthly">
                                Monthly
                            </CycleTab>
                            <CycleTab active={cycle === "yearly"} onClick={() => setCycle("yearly")} testid="cycle-yearly">
                                Yearly
                                <span
                                    className="ml-2 text-overline"
                                    style={{
                                        color: cycle === "yearly" ? "hsl(0 0% 8%)" : "hsl(var(--buy))",
                                        fontSize: "0.56rem",
                                        fontWeight: cycle === "yearly" ? 800 : 500,
                                    }}
                                    data-testid="yearly-discount-badge"
                                >
                                    SAVE {Math.round(discountPct)}%
                                </span>
                            </CycleTab>
                        </div>
                    </div>
                )}

                {message && (
                    <div className="signal-buy px-4 py-3 mt-6 font-mono text-sm" data-testid="upgrade-message">{message}</div>
                )}
                {error && (
                    <div className="signal-sell px-4 py-3 mt-6 font-mono text-sm" data-testid="upgrade-error">{error}</div>
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
                                // CURRENT badge follows the user's actual base plan (not effective plan from admin/unlock).
                                const basePlan = quota?.base_plan || user?.plan || "free";
                                const isCurrent = basePlan === key;
                                const price = priceFor(key, p);
                                const icon =
                                    key === "elite" ? <Crown size={16} strokeWidth={1.5} /> :
                                    key === "pro" ? <Zap size={16} strokeWidth={1.5} /> :
                                    <Sparkles size={16} strokeWidth={1.5} />;
                                const accent =
                                    key === "elite" ? "hsl(var(--hold))" :
                                    key === "pro" ? "hsl(var(--buy))" :
                                    "hsl(var(--text-secondary))";
                                return (
                                    <div key={key}
                                        className="module p-6 md:p-8 flex flex-col"
                                        style={{
                                            borderColor: isCurrent ? accent : undefined,
                                            borderWidth: isCurrent ? 2 : 1,
                                        }}
                                        data-testid={`plan-card-${key}`}>
                                        <div className="flex items-center justify-between">
                                            <p className="text-overline flex items-center gap-2" style={{ color: accent }}>
                                                {icon} {p.tag}
                                            </p>
                                            {isCurrent && (
                                                <span className="text-overline font-mono px-2 py-0.5"
                                                    style={{
                                                        border: "1px solid " + accent,
                                                        color: accent,
                                                        borderRadius: 2,
                                                        fontSize: "0.56rem",
                                                    }}>
                                                    CURRENT
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="font-serif mt-4" style={{ fontSize: "2.4rem", letterSpacing: "-0.02em" }}>
                                            {p.name}
                                        </h3>
                                        <div className="mt-4 flex items-baseline gap-2">
                                            <span className="font-mono hero-number" style={{ fontSize: "3rem" }}>
                                                ${price.toFixed(2)}
                                            </span>
                                            <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                                                / {cycle === "yearly" ? "yr" : "mo"}
                                            </span>
                                        </div>
                                        {cycle === "yearly" && key !== "free" && (
                                            <p className="text-xs mt-1 font-mono" style={{ color: "hsl(var(--buy))" }}>
                                                Save ${(p.price_usd * 12 - p.price_yearly).toFixed(2)} vs monthly
                                            </p>
                                        )}

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
                                            <FeatureLi>Standard AI analysis mode</FeatureLi>
                                            <FeatureLi>Candlestick & Hybrid analysis modes</FeatureLi>
                                            <FeatureLi enabled={p.quick_actions}>
                                                Watchlist pattern scan (15 patterns)
                                            </FeatureLi>
                                            <FeatureLi enabled={p.quick_actions}>
                                                Quick batch sweep (Top / Bottom 3)
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

                                        {/* Uniform CTA slot — same min-height across all tiers for visual balance */}
                                        <div className="mt-8 flex flex-col justify-end" style={{ minHeight: 150 }}>
                                            {(() => {
                                                const hasPaid = quota?.has_paypal_subscription;
                                                const onTestUnlock = quota?.test_unlock_active;
                                                // For the Free card:
                                                if (key === "free") {
                                                    if (isCurrent && !hasPaid && !onTestUnlock) {
                                                        return (
                                                            <CTAButton variant="current" testid={`current-${key}-button`}>
                                                                Your current plan
                                                            </CTAButton>
                                                        );
                                                    }
                                                    return (
                                                        <p
                                                            className="text-overline text-center"
                                                            style={{
                                                                color: "hsl(var(--text-muted))",
                                                                fontSize: "0.58rem",
                                                                lineHeight: 1.6,
                                                            }}
                                                            data-testid="free-tier-info"
                                                        >
                                                            {onTestUnlock
                                                                ? "All features currently unlocked via test unlock."
                                                                : "Always free. Cancel a paid plan to revert to Free."}
                                                        </p>
                                                    );
                                                }
                                                // Pro & Elite cards:
                                                // If paid subscriber on this tier: show Cancel (or "Cancels on" if already cancelled)
                                                if (hasPaid && quota?.base_plan === key) {
                                                    if (quota?.subscription_status === "CANCELLED") {
                                                        return (
                                                            <div
                                                                className="w-full font-mono text-center"
                                                                style={{
                                                                    background: "hsl(var(--surface-elevated))",
                                                                    border: "1px solid hsl(var(--sell))",
                                                                    color: "hsl(var(--sell))",
                                                                    height: 98,
                                                                    borderRadius: 2,
                                                                    letterSpacing: "0.04em",
                                                                    textTransform: "uppercase",
                                                                    fontSize: "0.7rem",
                                                                    padding: "20px 12px",
                                                                }}
                                                                data-testid={`cancelled-${key}-notice`}
                                                            >
                                                                Cancelled
                                                                <div className="mt-2 text-[0.6rem]" style={{ color: "hsl(var(--text-muted))", textTransform: "none" }}>
                                                                    access until {new Date(quota.subscription_cancels_at).toLocaleDateString()}
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <button
                                                            onClick={cancelSubscription}
                                                            disabled={cancelling}
                                                            className="w-full font-mono text-sm transition-all"
                                                            style={{
                                                                background: "hsl(var(--surface-elevated))",
                                                                border: "1px solid hsl(var(--sell))",
                                                                color: "hsl(var(--sell))",
                                                                height: 98,
                                                                borderRadius: 2,
                                                                letterSpacing: "0.04em",
                                                                textTransform: "uppercase",
                                                                fontSize: "0.75rem",
                                                                fontWeight: 600,
                                                            }}
                                                            data-testid={`cancel-${key}-button`}
                                                        >
                                                            {cancelling ? (
                                                                <Loader2 size={14} className="animate-spin mx-auto" />
                                                            ) : (
                                                                <>
                                                                    Cancel Subscription
                                                                    <div className="mt-1 text-[0.58rem]" style={{ color: "hsl(var(--text-muted))", textTransform: "none", letterSpacing: 0 }}>
                                                                        access continues until end of billing period
                                                                    </div>
                                                                </>
                                                            )}
                                                        </button>
                                                    );
                                                }
                                                // Otherwise: show PayPal subscribe block (Pro or Elite, for any user not paying on this tier)
                                                return (
                                                    <PayPalSubscribeButton
                                                        planKey={key}
                                                        cycle={cycle}
                                                        planId={billingConfig.plan_ids[`${key}_${cycle}`]}
                                                        planName={p.name}
                                                        processing={processing === `${key}_${cycle}`}
                                                        setProcessing={(v) => setProcessing(v ? `${key}_${cycle}` : null)}
                                                        onSuccess={(msg) => {
                                                            setMessage(msg);
                                                            refreshUser();
                                                            api.get("/quota").then((r) => setQuota(r.data));
                                                            setTimeout(() => setMessage(""), 6000);
                                                        }}
                                                        onError={(m) => setError(m)}
                                                    />
                                                );
                                            })()}
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
                        <h3 className="font-serif mt-2 mb-6" style={{ fontSize: "1.8rem", letterSpacing: "-0.01em" }}>
                            Side-by-side.
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        <th className="text-left text-overline py-3"></th>
                                        {ORDER.map((key) => (
                                            <th key={key} className="text-right text-overline py-3 px-4"
                                                style={{ color: "hsl(var(--text-secondary))" }}>
                                                {plans[key].name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {FEATURE_MATRIX.map((feat) => (
                                        <tr key={feat.key} style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                                            <td className="py-3 pr-4" style={{ color: "hsl(var(--text-secondary))" }}>{feat.label}</td>
                                            {ORDER.map((key) => (
                                                <td key={key} className="py-3 px-4 text-right"
                                                    style={{ color: "hsl(var(--text-primary))" }}>
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
                    Neural Stock Intelligence&trade; is an AI-assisted analysis tool. Content is for educational and informational
                    purposes only and is not investment advice. Payment processing by PayPal. Cancel
                    anytime — no refunds for partial billing cycles.
                </p>
            </div>
        </AppShell>
    );
}

function CycleTab({ active, onClick, children, testid }) {
    return (
        <button
            onClick={onClick}
            className="px-5 py-2 transition-colors"
            style={{
                background: active ? "hsl(38 92% 50%)" : "transparent",
                color: active ? "hsl(0 0% 8%)" : "hsl(var(--text-secondary))",
                borderRadius: 2,
                letterSpacing: "0.04em",
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: "0.75rem",
                fontWeight: active ? 700 : 500,
            }}
            data-testid={testid}
        >
            {children}
        </button>
    );
}

function CTAButton({ variant = "ghost", onClick, disabled, children, testid }) {
    const cls = variant === "current" ? "btn-ghost" : variant === "primary" ? "btn-primary" : "btn-ghost";
    return (
        <button
            onClick={onClick}
            disabled={disabled || variant === "current"}
            className={`${cls} w-full`}
            style={{ height: 42 }}
            data-testid={testid}
        >
            {children}
        </button>
    );
}

function PayPalSubscribeButton({ planKey, cycle, planId, planName, processing, setProcessing, onSuccess, onError }) {
    return (
        <div className="relative" data-testid={`paypal-${planKey}-${cycle}-button-wrap`} key={`${planKey}-${cycle}-${planId}`}>
            {processing && (
                <div className="absolute inset-0 grid place-items-center z-10 font-mono text-xs"
                    style={{ background: "rgba(11,11,11,0.75)", color: "hsl(var(--hold))" }}>
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
                forceReRender={[planId]}
                createSubscription={(data, actions) => actions.subscription.create({ plan_id: planId })}
                onApprove={async (data) => {
                    setProcessing(true);
                    try {
                        const r = await api.post("/billing/activate", {
                            subscription_id: data.subscriptionID,
                            plan: planKey,
                            cycle,
                        });
                        onSuccess(r.data.message || `${planName} activated.`);
                    } catch (err) {
                        onError(err?.response?.data?.detail || "Activation failed");
                    } finally { setProcessing(false); }
                }}
                onError={(err) => onError(err?.message || "PayPal error")}
                onCancel={() => onError("Checkout cancelled")}
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
