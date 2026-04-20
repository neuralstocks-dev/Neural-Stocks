import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Check, Loader2, X, Sparkles, Crown, Zap } from "lucide-react";

const ORDER = ["free", "pro", "elite"];

const FEATURE_MATRIX = [
    { label: "Watchlist size", key: "watchlist_limit" },
    { label: "Analyses / day", key: "analyses_per_day" },
    { label: "Analyses / week", key: "analyses_per_week" },
    { label: "Quick Top/Bottom 5 sweep", key: "quick_actions", type: "bool" },
    { label: "Public share verdicts", key: "share_verdicts", type: "bool" },
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
    const navigate = useNavigate();
    const [plans, setPlans] = useState(null);
    const [upgrading, setUpgrading] = useState(null);
    const [message, setMessage] = useState("");

    useEffect(() => {
        api.get("/plans").then((r) => setPlans(r.data));
    }, []);

    const onUpgrade = async (planKey) => {
        setUpgrading(planKey);
        setMessage("");
        try {
            const r = await api.post("/plan/upgrade", { plan: planKey });
            await refreshUser();
            setMessage(r.data.message || "Plan updated");
            setTimeout(() => setMessage(""), 4000);
        } catch (err) {
            setMessage(err?.response?.data?.detail || "Upgrade failed");
        } finally {
            setUpgrading(null);
        }
    };

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
                    verdicts as you grow. This is a demo — upgrades apply immediately, no card
                    required.
                </p>

                {message && (
                    <div className="signal-buy px-4 py-3 mt-6 font-mono text-sm" data-testid="upgrade-message">
                        {message}
                    </div>
                )}

                {!plans && (
                    <div className="py-20 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                    </div>
                )}

                {plans && (
                    <>
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
                                            <span
                                                className="font-mono hero-number"
                                                style={{ fontSize: "3rem" }}
                                            >
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
                                                Public shareable verdict pages
                                            </FeatureLi>
                                            <FeatureLi>
                                                {p.analysis_history_days >= 365
                                                    ? `${Math.round(p.analysis_history_days / 365)}-year analysis history`
                                                    : `${p.analysis_history_days}-day analysis history`}
                                            </FeatureLi>
                                        </ul>

                                        <button
                                            onClick={() => onUpgrade(key)}
                                            disabled={isCurrent || upgrading}
                                            className={isCurrent ? "btn-ghost w-full mt-8" : "btn-primary w-full mt-8"}
                                            data-testid={`upgrade-${key}-button`}
                                        >
                                            {upgrading === key ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : isCurrent ? (
                                                "Your current plan"
                                            ) : p.price_usd === 0 ? (
                                                "Downgrade to Free"
                                            ) : (
                                                `Switch to ${p.name}`
                                            )}
                                        </button>
                                    </div>
                                );
                            })}
                        </section>

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

                        <p className="text-overline mt-8" style={{ color: "hsl(var(--text-muted))", fontSize: "0.6rem" }}>
                            Demo pricing · no payment processor attached yet. Stripe checkout lands in Phase 2.
                        </p>
                    </>
                )}
            </div>
        </AppShell>
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
