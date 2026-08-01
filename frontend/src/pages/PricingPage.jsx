import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Check, Loader2, X, Sparkles, Crown, Zap, ShieldCheck, Clock, Building2 } from "lucide-react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

const ORDER = ["free", "pro", "elite"];

const FEATURE_MATRIX = [
    { label: "Watchlist size", key: "watchlist_limit" },
    { label: "Analyses", key: "__analyses_quota" },
    { label: "Standard AI analysis", key: "__always", type: "bool" },
    { label: "Candlestick & Hybrid analysis modes", key: "__always", type: "bool" },
    { label: "Watchlist pattern scan (15 candlestick patterns)", key: "quick_actions", type: "bool" },
    { label: "Quick batch sweep (Top / Bottom 3)", key: "quick_actions", type: "bool" },
    { label: "Public share verdicts", key: "share_verdicts", type: "bool" },
    { label: "Shares / day", key: "share_per_day" },
    { label: "Personal backtest · Live track record vs SPY / IDX", key: "personal_backtest", type: "bool" },
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
    // Analyses quota unit differs by tier now (Free is monthly, everyone
    // else is daily(+weekly)) -- render per-plan instead of one generic
    // number/"Unlimited" column so Free's null day/week don't misread as
    // unlimited.
    if (feat.key === "__analyses_quota") {
        if (plan.analyses_per_month != null) {
            return <span className="font-mono">{plan.analyses_per_month} / month</span>;
        }
        if (plan.analyses_per_day != null) {
            const weekPart = plan.analyses_per_week != null ? ` · ${plan.analyses_per_week}/wk` : "";
            return <span className="font-mono">{plan.analyses_per_day}/day{weekPart}</span>;
        }
        return <span className="font-mono" style={{ color: "hsl(var(--hold))" }}>Unlimited</span>;
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
    const [stripeConfig, setStripeConfig] = useState(null);
    const [quota, setQuota] = useState(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(null);
    const [stripeProcessing, setStripeProcessing] = useState(null);
    const [cancelling, setCancelling] = useState(false);
    const [cycle, setCycle] = useState("monthly"); // "monthly" | "yearly"

    useEffect(() => {
        (async () => {
            try {
                const [plansRes, cfgRes, stripeCfgRes, quotaRes] = await Promise.all([
                    api.get("/plans"),
                    api.get("/billing/config"),
                    api.get("/billing/stripe/config").catch(() => ({ data: null })),
                    api.get("/quota"),
                ]);
                setPlans(plansRes.data);
                setBillingConfig(cfgRes.data);
                setStripeConfig(stripeCfgRes.data);
                setQuota(quotaRes.data);
            } catch (err) {
                setError(err?.response?.data?.detail || "Failed to load pricing");
            }
        })();
    }, []);

    // Handle the browser bouncing back from a Stripe Checkout redirect.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("stripe_session_id");
        const stripeFlag = params.get("stripe");
        if (sessionId) {
            (async () => {
                setError(""); setMessage("Confirming payment…");
                try {
                    const r = await api.post("/billing/stripe/confirm", { session_id: sessionId });
                    if (r.data.ok) {
                        setMessage(r.data.message || "Payment confirmed.");
                        await refreshUser();
                        const q = await api.get("/quota");
                        setQuota(q.data);
                    } else {
                        setError(r.data.message || "Payment not completed yet.");
                    }
                } catch (err) {
                    setError(err?.response?.data?.detail || "Could not confirm Stripe payment");
                } finally {
                    setTimeout(() => setMessage(""), 8000);
                    window.history.replaceState({}, "", window.location.pathname);
                }
            })();
        } else if (stripeFlag === "cancelled") {
            setError("Stripe checkout cancelled — no charge was made.");
            window.history.replaceState({}, "", window.location.pathname);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const downgradeToFree = async () => {
        setError(""); setMessage(""); setProcessing("free");
        try {
            if (user?.plan !== "free") {
                await api.post(quota?.payment_provider === "stripe" ? "/billing/stripe/cancel" : "/billing/cancel");
            }
            await refreshUser();
            setMessage("You are now on the Free plan.");
            setTimeout(() => setMessage(""), 5000);
        } catch (err) {
            setError(err?.response?.data?.detail || "Downgrade failed");
        } finally { setProcessing(null); }
    };

    const cancelSubscription = async () => {
        const viaStripe = quota?.payment_provider === "stripe";
        if (!window.confirm(`Cancel your ${viaStripe ? "Stripe" : "PayPal"} subscription? You'll keep full access until the end of your current billing period, then revert to Free. No further charges.`)) return;
        setCancelling(true); setError(""); setMessage("");
        try {
            const r = await api.post(viaStripe ? "/billing/stripe/cancel" : "/billing/cancel");
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

    const startStripeCheckout = async (planKey, planCycle) => {
        setError(""); setStripeProcessing(`${planKey}_${planCycle}`);
        try {
            const r = await api.post("/billing/stripe/checkout", { plan: planKey, cycle: planCycle });
            window.location.href = r.data.checkout_url;
        } catch (err) {
            setError(err?.response?.data?.detail || "Stripe checkout failed");
            setStripeProcessing(null);
        }
    };

    const [daypassStripeProcessing, setDaypassStripeProcessing] = useState(false);
    const startStripeDaypassCheckout = async () => {
        setError(""); setDaypassStripeProcessing(true);
        try {
            const r = await api.post("/billing/stripe/daypass/checkout");
            window.location.href = r.data.checkout_url;
        } catch (err) {
            setError(err?.response?.data?.detail || "Stripe checkout failed");
            setDaypassStripeProcessing(false);
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

    const priceFor = (planKey, p) => {
        if (planKey === "free") return 0;
        return cycle === "yearly" ? p.price_yearly : p.price_usd;
    };

    const discountPct = plans?.pro?.annual_discount_pct || 20;
    const daypass = plans?.daypass;
    const promoActive = plans?.pro?.promo_active || plans?.elite?.promo_active;
    const promoLabel = plans?.pro?.promo_label || "";

    const [daypassProcessing, setDaypassProcessing] = useState(false);

    return (
        <>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="pricing-page">
                <p className="text-overline">Pricing · Subscription tiers</p>
                <h1 className="font-serif hero-number mt-3" style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}>
                    Pick your edge.
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Start free. Scale your watchlist, unlock quick batch sweeps, and shareable
                    verdicts as you grow. Pay via PayPal or card (Stripe) — cancel anytime.
                </p>

                {/* Promo banner */}
                {promoActive && (
                    <div
                        className="mt-6 px-5 py-4 flex items-center gap-4"
                        style={{
                            border: "2px solid hsl(var(--buy))",
                            background: "hsla(142,55%,45%,0.06)",
                            borderRadius: 2,
                        }}
                        data-testid="promo-banner"
                    >
                        <Sparkles size={18} strokeWidth={1.5} style={{ color: "hsl(var(--buy))" }} />
                        <div>
                            <p className="text-overline" style={{ color: "hsl(var(--buy))", fontSize: "0.6rem" }}>
                                Limited-time promotion
                            </p>
                            <p className="text-sm mt-1" style={{ color: "hsl(var(--text-primary))" }}>
                                <strong>{promoLabel || "Promo active"}</strong>
                                {plans?.pro?.promo_discount_pct > 0 && <> · Pro <strong style={{ color: "hsl(var(--buy))" }}>{Math.round(plans.pro.promo_discount_pct)}% off</strong></>}
                                {plans?.elite?.promo_discount_pct > 0 && <> · Elite <strong style={{ color: "hsl(var(--buy))" }}>{Math.round(plans.elite.promo_discount_pct)}% off</strong></>}
                                {" first month, then regular price applies. Cancel anytime."}
                            </p>
                        </div>
                    </div>
                )}

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

                {stripeConfig?.mode === "test" && (
                    <div className="mt-3 px-4 py-3 font-mono text-xs"
                        style={{
                            border: "1px solid #635BFF",
                            color: "#635BFF",
                            background: "rgba(99,91,255,0.06)",
                            borderRadius: 2,
                        }}
                        data-testid="stripe-test-mode-banner">
                        <ShieldCheck size={12} className="inline mr-2" strokeWidth={1.5} />
                        STRIPE TEST MODE · Card 4242 4242 4242 4242, any future expiry/CVC. No real charge.
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
                        {/* IDX differentiator banner — unique-in-market callout */}
                        <section
                            className="mt-10 px-5 py-4 md:px-6 md:py-5 flex items-start gap-4"
                            style={{
                                border: "1px solid hsl(var(--buy))",
                                background: "hsla(145,45%,55%,0.06)",
                                borderRadius: 2,
                            }}
                            data-testid="idx-differentiator-banner"
                        >
                            <Building2 size={18} strokeWidth={1.5} style={{ color: "hsl(var(--buy))", flexShrink: 0 }} className="mt-1" />
                            <div className="flex-1 min-w-0">
                                <p className="text-overline" style={{ color: "hsl(var(--buy))" }}>
                                    New · For IDX investors
                                </p>
                                <h3 className="font-serif text-xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    The only platform showing live director-level accumulation signals for the IDX
                                </h3>
                                <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Every Indonesian stock verdict now includes a <strong>Bandarmology panel</strong>{" "}
                                    computed from the official IDX / KSEI insider-filing feed — directors,
                                    commissioners, and major shareholders. Know who's actually buying before
                                    you do. {" "}
                                    <Link
                                        to="/technical#bandarmology"
                                        className="underline decoration-dotted underline-offset-4"
                                        style={{ color: "hsl(var(--text-primary))" }}
                                        data-testid="bandarmology-methodology-link"
                                    >
                                        See how we compute it →
                                    </Link>
                                </p>
                            </div>
                        </section>

                        <section className="grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-4 mt-6">
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
                                        <div className="mt-4 flex items-baseline gap-2 flex-wrap">
                                            <span className="font-mono hero-number" style={{ fontSize: "3rem" }}>
                                                ${price.toFixed(2)}
                                            </span>
                                            <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                                                / {cycle === "yearly" ? "yr" : "mo"}
                                            </span>
                                            {/* Promo strikethrough on monthly only (yearly already discounts on top) */}
                                            {cycle === "monthly" && p.promo_discount_pct > 0 && p.price_usd_original > p.price_usd && (
                                                <div className="flex items-baseline gap-2 ml-2" data-testid={`promo-strike-${key}`}>
                                                    <span
                                                        className="font-mono"
                                                        style={{
                                                            fontSize: "1.1rem",
                                                            color: "hsl(var(--text-muted))",
                                                            textDecoration: "line-through",
                                                        }}
                                                    >
                                                        ${p.price_usd_original.toFixed(2)}
                                                    </span>
                                                    <span
                                                        className="text-overline font-mono px-1.5 py-0.5"
                                                        style={{
                                                            background: "hsl(var(--buy))",
                                                            color: "hsl(0 0% 8%)",
                                                            fontSize: "0.6rem",
                                                            fontWeight: 700,
                                                            borderRadius: 2,
                                                        }}
                                                    >
                                                        SAVE {Math.round(p.promo_discount_pct)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {cycle === "monthly" && p.promo_discount_pct > 0 && p.promo_label && (
                                            <p
                                                className="text-xs mt-1 font-mono italic"
                                                style={{ color: "hsl(var(--buy))" }}
                                                data-testid={`promo-label-${key}`}
                                            >
                                                ✨ {p.promo_label}
                                            </p>
                                        )}
                                        {cycle === "monthly" && p.promo_discount_pct > 0 && (
                                            <p
                                                className="text-[11px] mt-1.5 font-mono leading-snug"
                                                style={{ color: "hsl(var(--text-muted))" }}
                                                data-testid={`promo-disclaimer-${key}`}
                                            >
                                                First month <span style={{color:"hsl(var(--buy))"}}>${Number(p.price_usd).toFixed(2)}</span>,
                                                then <span style={{color:"hsl(var(--text-primary))"}}>${Number(p.price_usd_original).toFixed(2)}/mo</span>. Cancel anytime.
                                            </p>
                                        )}
                                        {cycle === "yearly" && key !== "free" && (
                                            <p className="text-xs mt-1 font-mono" style={{ color: "hsl(var(--buy))" }}>
                                                Save ${(p.price_usd * 12 - p.price_yearly).toFixed(2)} vs monthly
                                            </p>
                                        )}

                                        <ul className="mt-6 space-y-3 flex-1">
                                            {p.analyses_per_month != null ? (
                                                <FeatureLi>{`${p.analyses_per_month} analyses per month`}</FeatureLi>
                                            ) : (
                                                <>
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
                                                </>
                                            )}
                                            <FeatureLi>
                                                {p.watchlist_display
                                                    ? `${p.watchlist_display} watchlist`
                                                    : `${p.watchlist_limit} stock watchlist`}
                                            </FeatureLi>
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
                                            <FeatureLi enabled={p.personal_backtest}>
                                                Personal backtest &middot; P&amp;L vs SPY / IDX
                                            </FeatureLi>
                                        </ul>

                                        {/* Uniform CTA slot — same min-height across all tiers for visual balance */}
                                        <div className="mt-8 flex flex-col justify-end" style={{ minHeight: 190 }}>
                                            {(() => {
                                                const hasPaid = quota?.has_paypal_subscription || quota?.has_stripe_subscription;
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
                                                // Otherwise: show PayPal + Stripe subscribe options (Pro or Elite, for any user not paying on this tier)
                                                return (
                                                    <>
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
                                                        {stripeConfig?.configured && (
                                                            <>
                                                                <div className="flex items-center gap-2 my-2">
                                                                    <div style={{ flex: 1, height: 1, background: "hsl(var(--border-divider))" }} />
                                                                    <span className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "0.55rem" }}>or</span>
                                                                    <div style={{ flex: 1, height: 1, background: "hsl(var(--border-divider))" }} />
                                                                </div>
                                                                <StripeCheckoutButton
                                                                    processing={stripeProcessing === `${key}_${cycle}`}
                                                                    testid={`stripe-${key}-${cycle}-button`}
                                                                    onClick={() => startStripeCheckout(key, cycle)}
                                                                />
                                                            </>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    </PayPalScriptProvider>
                )}

                {/* Week Pass — one-time purchase.
                    Deliberately decoupled from `paypalOptions` (which requires plan_ids
                    for subscriptions). Daypass only needs client_id — it uses
                    Orders v2 (capture intent), not subscriptions. If plan_ids lookup
                    503s, daypass should still render. */}
                {plans && billingConfig?.client_id && daypass && (
                    <PayPalScriptProvider
                        options={{
                            "client-id": billingConfig.client_id,
                            intent: "capture",
                            currency: "USD",
                            components: "buttons",
                        }}
                        deferLoading={false}
                    >
                        <section
                            className="module mt-6 md:mt-10 p-6 md:p-10 grid grid-cols-12 gap-6 items-start"
                            data-testid="daypass-card"
                            style={{
                                borderColor: "hsl(var(--hold))",
                                borderWidth: 1,
                                background: "hsla(38,45%,45%,0.04)",
                            }}
                        >
                            <div className="col-span-12 md:col-span-7">
                                <p className="text-overline flex items-center gap-2" style={{ color: "hsl(var(--hold))" }}>
                                    <Clock size={14} strokeWidth={1.5} /> Week Pass · One-time payment
                                </p>
                                <h3 className="font-serif mt-3" style={{ fontSize: "2.2rem", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                                    {daypass.duration_days}-day access.<br />
                                    <em style={{ color: "hsl(var(--hold))" }}>No subscription, no auto-renew.</em>
                                </h3>
                                <p className="mt-4 text-sm leading-relaxed max-w-xl" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Pay once, unlock full analysis power for {daypass.duration_days} days. Ideal for testing the platform, evaluating
                                    a specific trade thesis, or holding capacity when you need it.
                                </p>

                                <ul className="mt-6 space-y-3 max-w-lg">
                                    <FeatureLi>
                                        {daypass.analyses_per_day === null
                                            ? "Unlimited analyses"
                                            : `${daypass.analyses_per_day} analyses per day`}
                                    </FeatureLi>
                                    <FeatureLi>
                                        {daypass.analyses_per_week === null
                                            ? "No weekly cap"
                                            : `${daypass.analyses_per_week} analyses per week`}
                                    </FeatureLi>
                                    <FeatureLi>{daypass.watchlist_limit} stock watchlist</FeatureLi>
                                    <FeatureLi>Standard AI analysis mode</FeatureLi>
                                    <FeatureLi>Candlestick &amp; Hybrid analysis modes</FeatureLi>
                                    <FeatureLi enabled={daypass.quick_actions}>
                                        Watchlist pattern scan (15 patterns)
                                    </FeatureLi>
                                    <FeatureLi>
                                        {daypass.share_per_day === null
                                            ? "Unlimited share verdicts"
                                            : `${daypass.share_per_day} share verdicts / day`}
                                    </FeatureLi>
                                    <FeatureLi enabled={daypass.quick_actions}>
                                        Quick batch sweep (Top / Bottom 3)
                                    </FeatureLi>
                                </ul>
                            </div>

                            <div className="col-span-12 md:col-span-5">
                                <div
                                    className="p-6 md:p-8"
                                    style={{
                                        background: "hsl(var(--surface))",
                                        border: "1px solid hsl(var(--border-default))",
                                    }}
                                >
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-mono hero-number" style={{ fontSize: "3rem" }}>
                                            ${Number(daypass.price_usd).toFixed(2)}
                                        </span>
                                        <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                                            one-time
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1 font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                        ~ ${(Number(daypass.price_usd) / Math.max(daypass.duration_days, 1)).toFixed(2)} / day
                                    </p>

                                    {/* Active day-pass banner */}
                                    {quota?.daypass_active && quota?.daypass_expires_at ? (
                                        <div
                                            className="mt-6 px-4 py-3 text-center"
                                            style={{
                                                border: "1px solid hsl(var(--buy))",
                                                background: "hsla(142,55%,45%,0.08)",
                                                borderRadius: 2,
                                            }}
                                            data-testid="daypass-active-indicator"
                                        >
                                            <p className="text-overline" style={{ color: "hsl(var(--buy))", fontSize: "0.6rem" }}>
                                                Active · Week Pass
                                            </p>
                                            <p className="text-sm mt-1 font-mono">
                                                Until {new Date(quota.daypass_expires_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="mt-6 relative" data-testid="daypass-paypal-wrap">
                                            {daypassProcessing && (
                                                <div
                                                    className="absolute inset-0 grid place-items-center z-10 font-mono text-xs"
                                                    style={{ background: "rgba(11,11,11,0.75)", color: "hsl(var(--hold))" }}
                                                >
                                                    <Loader2 size={16} className="animate-spin" />&nbsp; Activating…
                                                </div>
                                            )}
                                            <PayPalButtons
                                                style={{
                                                    layout: "vertical",
                                                    color: "silver",
                                                    shape: "rect",
                                                    label: "buynow",
                                                    height: 42,
                                                }}
                                                fundingSource={undefined}
                                                disabled={daypassProcessing}
                                                forceReRender={[daypass.price_usd, daypass.duration_days]}
                                                createOrder={async () => {
                                                    setError("");
                                                    try {
                                                        const r = await api.post("/billing/daypass/order");
                                                        return r.data.order_id;
                                                    } catch (err) {
                                                        setError(err?.response?.data?.detail || "Failed to create order");
                                                        throw err;
                                                    }
                                                }}
                                                onApprove={async (data) => {
                                                    setDaypassProcessing(true);
                                                    try {
                                                        const r = await api.post("/billing/daypass/capture", {
                                                            order_id: data.orderID,
                                                        });
                                                        setMessage(r.data.message || "Week Pass activated.");
                                                        await refreshUser();
                                                        const q = await api.get("/quota");
                                                        setQuota(q.data);
                                                        setTimeout(() => setMessage(""), 8000);
                                                    } catch (err) {
                                                        setError(err?.response?.data?.detail || "Week Pass activation failed");
                                                    } finally {
                                                        setDaypassProcessing(false);
                                                    }
                                                }}
                                                onError={(err) => setError(err?.message || "PayPal error")}
                                                onCancel={() => setError("Checkout cancelled")}
                                            />
                                            {stripeConfig?.configured && (
                                                <>
                                                    <div className="flex items-center gap-2 my-2">
                                                        <div style={{ flex: 1, height: 1, background: "hsl(var(--border-divider))" }} />
                                                        <span className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "0.55rem" }}>or</span>
                                                        <div style={{ flex: 1, height: 1, background: "hsl(var(--border-divider))" }} />
                                                    </div>
                                                    <StripeCheckoutButton
                                                        processing={daypassStripeProcessing}
                                                        testid="stripe-daypass-button"
                                                        onClick={startStripeDaypassCheckout}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
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
                                        <tr key={feat.label} style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
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

                {/* PayPal trust badge — reassures buyers this is a real, secure checkout */}
                <div
                    className="mt-10 flex items-center justify-center gap-3 py-5"
                    style={{ borderTop: "1px solid hsl(var(--border-divider))", borderBottom: "1px solid hsl(var(--border-divider))" }}
                    data-testid="paypal-trust-badge"
                >
                    <span className="font-mono text-[10px]" style={{ color: "hsl(var(--text-muted))", letterSpacing: "0.08em" }}>
                        SECURE CHECKOUT POWERED BY
                    </span>
                    <span
                        aria-label="PayPal"
                        style={{
                            fontFamily: "'Helvetica Neue', Arial, sans-serif",
                            fontWeight: 700,
                            fontStyle: "italic",
                            fontSize: "1.15rem",
                            letterSpacing: "-0.01em",
                        }}
                    >
                        <span style={{ color: "#253B80" }}>Pay</span>
                        <span style={{ color: "#179BD7" }}>Pal</span>
                    </span>
                </div>

                <p className="text-overline mt-8 max-w-3xl leading-relaxed" style={{ color: "hsl(var(--text-muted))", fontSize: "0.62rem" }}>
                    Neural Stock Intelligence&trade; is an AI-assisted analysis tool. Content is for educational and informational
                    purposes only and is not investment advice. Payment processing by PayPal or Stripe. Cancel
                    anytime — no refunds for partial billing cycles.
                </p>
            </div>
        </>
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

function StripeCheckoutButton({ processing, onClick, testid }) {
    return (
        <button
            onClick={onClick}
            disabled={processing}
            className="w-full font-mono text-xs transition-all flex items-center justify-center gap-1.5"
            style={{
                height: 42,
                border: "1px solid hsl(var(--border-default))",
                background: "hsl(var(--surface-elevated))",
                color: "hsl(var(--text-primary))",
                borderRadius: 2,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                fontWeight: 600,
            }}
            data-testid={testid}
        >
            {processing ? (
                <Loader2 size={14} className="animate-spin" />
            ) : (
                <>
                    Pay with Card
                    <span style={{ color: "#635BFF", fontWeight: 800, fontStyle: "italic", textTransform: "none", letterSpacing: "-0.01em" }}>
                        Stripe
                    </span>
                </>
            )}
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
