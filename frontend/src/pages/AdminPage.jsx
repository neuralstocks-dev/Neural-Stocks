import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { Loader2, ShieldCheck, Clock, RotateCcw, Search, Trash2, BellOff, DollarSign, CheckSquare, Square, AlertTriangle, Sparkles } from "lucide-react";
import { timeAgo } from "@/lib/format";

const DURATIONS = [
    { v: "1h", label: "1 hour" },
    { v: "2h", label: "2 hours" },
    { v: "4h", label: "4 hours" },
    { v: "12h", label: "12 hours" },
    { v: "1d", label: "1 day" },
    { v: "3d", label: "3 days" },
    { v: "1w", label: "1 week" },
    { v: "2w", label: "2 weeks" },
    { v: "3w", label: "3 weeks" },
    { v: "4w", label: "4 weeks" },
    { v: "forever", label: "Forever" },
];

function remaining(expiresAt) {
    if (!expiresAt) return null;
    if (expiresAt === "forever") return "∞ forever";
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return "expired";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    return `${Math.floor(sec / 86400)}d`;
}

export default function AdminPage() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [logins, setLogins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null); // user_id
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [pendingDuration, setPendingDuration] = useState({}); // user_id -> duration value
    const [pricing, setPricing] = useState(null);
    const [proForm, setProForm] = useState("");
    const [eliteForm, setEliteForm] = useState("");
    const [discountForm, setDiscountForm] = useState("");
    const [promoProForm, setPromoProForm] = useState("");
    const [promoEliteForm, setPromoEliteForm] = useState("");
    const [promoLabelForm, setPromoLabelForm] = useState("");
    const [daypassPriceForm, setDaypassPriceForm] = useState("");
    const [daypassDurationForm, setDaypassDurationForm] = useState("");
    const [savingPrice, setSavingPrice] = useState(false);
    const [selectedLogins, setSelectedLogins] = useState(new Set());
    const [loginBusy, setLoginBusy] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState(new Set());
    const [userBulkBusy, setUserBulkBusy] = useState(false);
    const [tierLimits, setTierLimits] = useState(null);
    const [tierLimitsForm, setTierLimitsForm] = useState(null);
    const [savingLimits, setSavingLimits] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [u, l, pr, tl] = await Promise.all([
                api.get("/admin/users"),
                api.get("/admin/logins"),
                api.get("/admin/pricing"),
                api.get("/admin/tier-limits"),
            ]);
            setUsers(u.data || []);
            setLogins(l.data || []);
            setPricing(pr.data || null);
            setProForm(String(pr.data?.pro_monthly_original ?? pr.data?.pro_monthly ?? ""));
            setEliteForm(String(pr.data?.elite_monthly_original ?? pr.data?.elite_monthly ?? ""));
            setDiscountForm(String(pr.data?.annual_discount_pct ?? ""));
            setPromoProForm(String(pr.data?.promo_pro_discount_pct || ""));
            setPromoEliteForm(String(pr.data?.promo_elite_discount_pct || ""));
            setPromoLabelForm(String(pr.data?.promo_label || ""));
            setDaypassPriceForm(String(pr.data?.daypass_price ?? ""));
            setDaypassDurationForm(String(pr.data?.daypass_duration_days ?? ""));
            setSelectedLogins(new Set());
            setSelectedUsers(new Set());
            setTierLimits(tl.data || null);
            // Initialize form strings (empty string = unlimited)
            if (tl.data) {
                const toStr = (v) => (v === null || v === undefined ? "" : String(v));
                setTierLimitsForm({
                    free: {
                        analyses_per_day: toStr(tl.data.free.analyses_per_day),
                        analyses_per_week: toStr(tl.data.free.analyses_per_week),
                        share_per_day: toStr(tl.data.free.share_per_day),
                    },
                    pro: {
                        analyses_per_day: toStr(tl.data.pro.analyses_per_day),
                        analyses_per_week: toStr(tl.data.pro.analyses_per_week),
                        share_per_day: toStr(tl.data.pro.share_per_day),
                    },
                    elite: {
                        analyses_per_day: toStr(tl.data.elite.analyses_per_day),
                        analyses_per_week: toStr(tl.data.elite.analyses_per_week),
                        share_per_day: toStr(tl.data.elite.share_per_day),
                    },
                    daypass: {
                        analyses_per_day: toStr(tl.data.daypass?.analyses_per_day),
                        analyses_per_week: toStr(tl.data.daypass?.analyses_per_week),
                        share_per_day: toStr(tl.data.daypass?.share_per_day),
                        watchlist_limit: toStr(tl.data.daypass?.watchlist_limit),
                    },
                });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return users;
        return users.filter(
            (u) =>
                (u.email || "").toLowerCase().includes(q) ||
                (u.full_name || "").toLowerCase().includes(q)
        );
    }, [users, query]);

    if (user && !user.is_admin) return <Navigate to="/dashboard" replace />;

    const unlock = async (uid, duration) => {
        if (!duration) return;
        setError("");
        setMessage("");
        setBusy(uid);
        try {
            const r = await api.post(`/admin/users/${uid}/unlock`, { duration });
            setMessage(r.data.message);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Unlock failed");
        } finally {
            setBusy(null);
        }
    };

    const reset = async (uid) => {
        setError("");
        setMessage("");
        setBusy(uid);
        try {
            const r = await api.post(`/admin/users/${uid}/reset`);
            setMessage(r.data.message);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Reset failed");
        } finally {
            setBusy(null);
        }
    };

    const deleteUser = async (uid, email) => {
        if (!window.confirm(`Permanently delete ${email} and ALL their data (watchlist, analyses, alerts, shares)? This cannot be undone.`)) return;
        setError("");
        setMessage("");
        setBusy(uid);
        try {
            const r = await api.delete(`/admin/users/${uid}`);
            setMessage(r.data.message);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Delete failed");
        } finally {
            setBusy(null);
        }
    };

    const clearAlerts = async (uid, email) => {
        if (!window.confirm(`Remove all alerts for ${email}?`)) return;
        setError("");
        setMessage("");
        setBusy(uid);
        try {
            const r = await api.delete(`/admin/users/${uid}/alerts`);
            setMessage(r.data.message);
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Clear alerts failed");
        } finally {
            setBusy(null);
        }
    };

    const saveTierLimits = async () => {
        setError("");
        setMessage("");
        setSavingLimits(true);
        try {
            const payload = { free: {}, pro: {}, elite: {}, daypass: {} };
            const KEYS = {
                free: ["analyses_per_day", "analyses_per_week", "share_per_day"],
                pro: ["analyses_per_day", "analyses_per_week", "share_per_day"],
                elite: ["analyses_per_day", "analyses_per_week", "share_per_day"],
                daypass: ["analyses_per_day", "analyses_per_week", "share_per_day", "watchlist_limit"],
            };
            for (const tier of ["free", "pro", "elite", "daypass"]) {
                for (const k of KEYS[tier]) {
                    const raw = tierLimitsForm[tier][k];
                    if (raw === "" || raw === null || raw === undefined) {
                        payload[tier][k] = null; // unlimited
                    } else {
                        const n = parseInt(raw, 10);
                        if (!Number.isFinite(n) || n < 0) {
                            setError(`${tier} · ${k} must be a non-negative integer or blank for unlimited`);
                            setSavingLimits(false);
                            return;
                        }
                        payload[tier][k] = n;
                    }
                }
            }
            const r = await api.put("/admin/tier-limits", payload);
            setMessage(r.data.message);
            setTierLimits(r.data.limits);
        } catch (err) {
            setError(err?.response?.data?.detail || "Tier limits update failed");
        } finally {
            setSavingLimits(false);
        }
    };

    const updateTierLimit = (tier, key, value) => {
        setTierLimitsForm((prev) => ({
            ...prev,
            [tier]: { ...prev[tier], [key]: value },
        }));
    };

    const savePricing = async () => {
        setError("");
        setMessage("");
        const pro = parseFloat(proForm);
        const elite = parseFloat(eliteForm);
        const discount = parseFloat(discountForm);
        const promoPro = parseFloat(promoProForm) || 0;
        const promoElite = parseFloat(promoEliteForm) || 0;
        const daypassP = parseFloat(daypassPriceForm);
        const daypassD = parseInt(daypassDurationForm, 10);
        if (!(pro > 0) || !(elite > 0)) {
            setError("Prices must be positive numbers");
            return;
        }
        if (!(discount >= 0) || discount > 90) {
            setError("Annual discount must be between 0 and 90");
            return;
        }
        if (promoPro < 0 || promoPro > 90 || promoElite < 0 || promoElite > 90) {
            setError("Promo discount must be between 0 and 90");
            return;
        }
        if (!(daypassP >= 0) || daypassP > 9999) {
            setError("Day Pass price must be a non-negative number ≤ 9999");
            return;
        }
        if (!Number.isInteger(daypassD) || daypassD < 1 || daypassD > 365) {
            setError("Day Pass duration must be between 1 and 365 days");
            return;
        }
        setSavingPrice(true);
        try {
            const r = await api.put("/admin/pricing", {
                pro_price: pro,
                elite_price: elite,
                annual_discount_pct: discount,
                promo_pro_discount_pct: promoPro,
                promo_elite_discount_pct: promoElite,
                promo_label: promoLabelForm || "",
                daypass_price: daypassP,
                daypass_duration_days: daypassD,
            });
            setMessage(r.data.message);
            setPricing(r.data.prices);
        } catch (err) {
            setError(err?.response?.data?.detail || "Pricing update failed");
        } finally {
            setSavingPrice(false);
        }
    };

    const toggleLogin = (id) => {
        const next = new Set(selectedLogins);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedLogins(next);
    };

    const toggleAllLogins = () => {
        if (selectedLogins.size === logins.length) setSelectedLogins(new Set());
        else setSelectedLogins(new Set(logins.map((l) => l.id)));
    };

    const deleteSelectedLogins = async () => {
        if (selectedLogins.size === 0) return;
        if (!window.confirm(`Delete ${selectedLogins.size} selected login event${selectedLogins.size > 1 ? "s" : ""}?`)) return;
        setLoginBusy(true); setError(""); setMessage("");
        try {
            const r = await api.post("/admin/logins/delete", { ids: Array.from(selectedLogins) });
            setMessage(r.data.message);
            setSelectedLogins(new Set());
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Delete failed");
        } finally { setLoginBusy(false); }
    };

    const clearAllLogins = async () => {
        if (!window.confirm(`Clear ALL ${logins.length} login events? This cannot be undone.`)) return;
        setLoginBusy(true); setError(""); setMessage("");
        try {
            const r = await api.delete("/admin/logins");
            setMessage(r.data.message);
            setSelectedLogins(new Set());
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Clear failed");
        } finally { setLoginBusy(false); }
    };

    const toggleUser = (id) => {
        const next = new Set(selectedUsers);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedUsers(next);
    };
    // Deletable = non-admin users that match the current search filter
    const deletable = filtered.filter((u) => !u.is_admin);
    const toggleAllUsers = () => {
        if (selectedUsers.size >= deletable.length && deletable.length > 0) setSelectedUsers(new Set());
        else setSelectedUsers(new Set(deletable.map((u) => u.id)));
    };

    const deleteSelectedUsers = async () => {
        if (selectedUsers.size === 0) return;
        // Flag paid subscribers for extra visibility
        const selectedEmails = users
            .filter((u) => selectedUsers.has(u.id))
            .map((u) => u.email);
        const paidSelected = users.filter(
            (u) => selectedUsers.has(u.id) && u.plan && u.plan !== "free"
        );
        let warning = `You are about to permanently delete ${selectedUsers.size} user${selectedUsers.size > 1 ? "s" : ""}:\n\n• ${selectedEmails.slice(0, 10).join("\n• ")}`;
        if (selectedEmails.length > 10) warning += `\n... and ${selectedEmails.length - 10} more`;
        warning += `\n\nThis will:\n• Cascade delete watchlist, analyses, alerts, shares, timeline recos\n• Auto-cancel any active PayPal subscription`;
        if (paidSelected.length > 0) {
            warning += `\n\n⚠️ ${paidSelected.length} user${paidSelected.length > 1 ? "s are" : " is"} on a PAID plan (${paidSelected.map((u) => `${u.email} · ${u.plan}`).join(", ")}).\n\nVerify you have:\n  1. Cancelled their PayPal subscription (auto-attempted, but confirm in PayPal dashboard)\n  2. Refunded any outstanding partial period if applicable\n  3. Documented the cancellation in your records\n\nProceed with deletion?`;
        } else {
            warning += `\n\nProceed with deletion?`;
        }
        if (!window.confirm(warning)) return;

        setUserBulkBusy(true); setError(""); setMessage("");
        try {
            const r = await api.post("/admin/users/delete", { ids: Array.from(selectedUsers) });
            setMessage(r.data.message);
            setSelectedUsers(new Set());
            await loadAll();
        } catch (err) {
            setError(err?.response?.data?.detail || "Bulk delete failed");
        } finally { setUserBulkBusy(false); }
    };

    return (
        <AppShell>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="admin-page">
                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                    <ShieldCheck size={12} className="inline mr-1" strokeWidth={1.5} /> Admin console
                </p>
                <h1
                    className="font-serif hero-number mt-3"
                    style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)" }}
                >
                    User administration.
                </h1>
                <p className="mt-3 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Grant any user a timed <em className="italic" style={{ color: "hsl(var(--hold))" }}>Elite test-unlock</em>.
                    Reset any user back to Free. Users must log out and log back in to see the change.
                </p>

                <div className="mt-5 flex flex-wrap gap-3" data-testid="admin-quick-links">
                    <Link
                        to="/admin/paypal-smoke-test"
                        className="btn-ghost text-sm"
                        style={{ borderColor: "hsl(var(--hold))" }}
                        data-testid="link-paypal-smoke-test"
                    >
                        PayPal smoke test ($1 diagnostic) →
                    </Link>
                </div>

                {message && (
                    <div className="signal-buy px-4 py-3 mt-6 font-mono text-sm" data-testid="admin-message">
                        {message}
                    </div>
                )}
                {error && (
                    <div className="signal-sell px-4 py-3 mt-6 font-mono text-sm" data-testid="admin-error">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="py-20 text-center">
                        <Loader2 className="animate-spin mx-auto" size={22} />
                    </div>
                )}

                {!loading && (
                    <>
                        {/* Pricing editor */}
                        <section className="module mt-10" data-testid="admin-pricing-module">
                            <div className="p-5 md:p-6" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                                    <DollarSign size={12} className="inline mr-1" strokeWidth={1.5} /> Subscription pricing
                                </p>
                                <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                    Monthly plan pricing (USD)
                                </h2>
                                <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Saving rotates PayPal billing plans. New checkouts use the updated price;
                                    existing subscribers stay on their current price until they re-subscribe.
                                </p>
                            </div>
                            <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <label className="flex flex-col gap-2">
                                    <span className="text-overline">Pro / month</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>$</span>
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={proForm}
                                            onChange={(e) => setProForm(e.target.value)}
                                            className="input-base font-mono"
                                            data-testid="admin-price-pro-input"
                                        />
                                    </div>
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-overline">Elite / month</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>$</span>
                                        <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={eliteForm}
                                            onChange={(e) => setEliteForm(e.target.value)}
                                            className="input-base font-mono"
                                            data-testid="admin-price-elite-input"
                                        />
                                    </div>
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-overline">Annual discount</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            max="90"
                                            step="1"
                                            value={discountForm}
                                            onChange={(e) => setDiscountForm(e.target.value)}
                                            className="input-base font-mono"
                                            data-testid="admin-discount-input"
                                        />
                                        <span className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>%</span>
                                    </div>
                                </label>
                                <button
                                    onClick={savePricing}
                                    disabled={savingPrice}
                                    className="btn-primary"
                                    data-testid="admin-save-pricing-button"
                                >
                                    {savingPrice ? <Loader2 size={14} className="animate-spin" /> : "Save pricing"}
                                </button>
                            </div>

                            {/* Promo discount (highlighted on user pricing page) */}
                            <div
                                className="px-5 md:px-6 pb-5 pt-3"
                                style={{ borderTop: "1px dashed hsl(var(--border-divider))" }}
                            >
                                <p className="text-overline mb-3" style={{ color: "hsl(var(--buy))" }}>
                                    <Sparkles size={11} className="inline mr-1" strokeWidth={1.5} /> Promo discount (monthly)
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <label className="flex flex-col gap-2">
                                        <span className="text-overline" style={{ fontSize: "0.58rem" }}>Pro promo %</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                max="90"
                                                step="1"
                                                value={promoProForm}
                                                onChange={(e) => setPromoProForm(e.target.value)}
                                                placeholder="0"
                                                className="input-base font-mono"
                                                data-testid="admin-promo-pro-input"
                                            />
                                            <span className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>%</span>
                                        </div>
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-overline" style={{ fontSize: "0.58rem" }}>Elite promo %</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                max="90"
                                                step="1"
                                                value={promoEliteForm}
                                                onChange={(e) => setPromoEliteForm(e.target.value)}
                                                placeholder="0"
                                                className="input-base font-mono"
                                                data-testid="admin-promo-elite-input"
                                            />
                                            <span className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>%</span>
                                        </div>
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-overline" style={{ fontSize: "0.58rem" }}>Label (optional)</span>
                                        <input
                                            type="text"
                                            maxLength={80}
                                            value={promoLabelForm}
                                            onChange={(e) => setPromoLabelForm(e.target.value)}
                                            placeholder="Launch Week"
                                            className="input-base"
                                            data-testid="admin-promo-label-input"
                                        />
                                    </label>
                                </div>
                                <p className="text-xs mt-2 font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                    Set 0% to disable. Active promos show a strikethrough + badge on the user Pricing page and rotate PayPal plans to the discounted monthly price.
                                </p>
                            </div>

                            {/* Day Pass (one-time) */}
                            <div
                                className="px-5 md:px-6 pb-5 pt-3"
                                style={{ borderTop: "1px dashed hsl(var(--border-divider))" }}
                            >
                                <p className="text-overline mb-3" style={{ color: "hsl(var(--hold))" }}>
                                    <Clock size={11} className="inline mr-1" strokeWidth={1.5} /> Day Pass · one-time purchase
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <label className="flex flex-col gap-2">
                                        <span className="text-overline" style={{ fontSize: "0.58rem" }}>Price (USD)</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono" style={{ color: "hsl(var(--text-muted))" }}>$</span>
                                            <input
                                                type="number"
                                                min="0.01"
                                                max="9999"
                                                step="0.01"
                                                value={daypassPriceForm}
                                                onChange={(e) => setDaypassPriceForm(e.target.value)}
                                                placeholder="5.00"
                                                className="input-base font-mono"
                                                data-testid="admin-daypass-price-input"
                                            />
                                        </div>
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-overline" style={{ fontSize: "0.58rem" }}>Access duration (days)</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="365"
                                            step="1"
                                            value={daypassDurationForm}
                                            onChange={(e) => setDaypassDurationForm(e.target.value)}
                                            placeholder="7"
                                            className="input-base font-mono"
                                            data-testid="admin-daypass-duration-input"
                                        />
                                    </label>
                                </div>
                                <p className="text-xs mt-2 font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                    Quotas (analyses/day, analyses/week, shares/day, watchlist size) are edited in the Tier limits table below.
                                    Features: Standard/Candlestick/Hybrid AI + 15-pattern scan are always enabled. Quick batch sweep is disabled.
                                </p>
                            </div>
                            {pricing && (
                                <div
                                    className="px-5 md:px-6 pb-5 font-mono text-xs"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    Live: Pro ${pricing.pro_monthly.toFixed(2)}/mo{pricing.promo_active && pricing.promo_pro_discount_pct > 0 && <> <span style={{color:"hsl(var(--buy))"}}>(was ${pricing.pro_monthly_original.toFixed(2)}, {Math.round(pricing.promo_pro_discount_pct)}% off)</span></>} · Elite ${pricing.elite_monthly.toFixed(2)}/mo{pricing.promo_active && pricing.promo_elite_discount_pct > 0 && <> <span style={{color:"hsl(var(--buy))"}}>(was ${pricing.elite_monthly_original.toFixed(2)}, {Math.round(pricing.promo_elite_discount_pct)}% off)</span></>} · Annual {Math.round(pricing.annual_discount_pct)}% · Day Pass ${Number(pricing.daypass_price).toFixed(2)} / {pricing.daypass_duration_days}d
                                </div>
                            )}
                        </section>

                        {/* Tier limits editor */}
                        {tierLimitsForm && (
                            <section className="module mt-6 md:mt-10" data-testid="admin-tier-limits-module">
                                <div
                                    className="p-5 md:p-6"
                                    style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                >
                                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                                        <Sparkles size={12} className="inline mr-1" strokeWidth={1.5} /> Tier limits
                                    </p>
                                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                        Per-tier quotas
                                    </h2>
                                    <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                        Adjust the daily &amp; weekly analysis caps plus daily share-verdict caps for Free, Pro, Elite, and the one-time Day Pass (includes watchlist size).
                                        Leave a field empty to mark that limit as <span style={{ color: "hsl(var(--hold))" }}>Unlimited</span>.
                                    </p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr>
                                                <th
                                                    className="text-left text-overline py-3 px-5"
                                                    style={{
                                                        background: "hsl(var(--surface-elevated))",
                                                        fontSize: "0.56rem",
                                                    }}
                                                >
                                                    Tier
                                                </th>
                                                {["Analyses / day", "Analyses / week", "Shares / day", "Watchlist"].map((h) => (
                                                    <th
                                                        key={h}
                                                        className="text-left text-overline py-3 px-4"
                                                        style={{
                                                            background: "hsl(var(--surface-elevated))",
                                                            fontSize: "0.56rem",
                                                        }}
                                                    >
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {["free", "pro", "elite", "daypass"].map((tier) => {
                                                const tierColor =
                                                    tier === "elite"
                                                        ? "hsl(var(--hold))"
                                                        : tier === "pro"
                                                        ? "hsl(var(--buy))"
                                                        : tier === "daypass"
                                                        ? "hsl(var(--hold))"
                                                        : "hsl(var(--text-secondary))";
                                                const KEYS = tier === "daypass"
                                                    ? ["analyses_per_day", "analyses_per_week", "share_per_day", "watchlist_limit"]
                                                    : ["analyses_per_day", "analyses_per_week", "share_per_day"];
                                                return (
                                                    <tr
                                                        key={tier}
                                                        style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                                        data-testid={`tier-limits-row-${tier}`}
                                                    >
                                                        <td className="py-3 px-5">
                                                            <span
                                                                className="font-serif text-base capitalize"
                                                                style={{ color: tierColor }}
                                                            >
                                                                {tier === "daypass" ? "Day Pass" : tier}
                                                            </span>
                                                        </td>
                                                        {["analyses_per_day", "analyses_per_week", "share_per_day", "watchlist_limit"].map((k) => {
                                                            if (!KEYS.includes(k)) {
                                                                return <td key={k} className="py-3 px-4" style={{ color: "hsl(var(--text-muted))" }}>—</td>;
                                                            }
                                                            return (
                                                                <td key={k} className="py-3 px-4">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="1"
                                                                        value={tierLimitsForm[tier][k] ?? ""}
                                                                        onChange={(e) => updateTierLimit(tier, k, e.target.value)}
                                                                        placeholder={k === "watchlist_limit" ? "e.g. 5" : "Unlimited"}
                                                                        className="input-base font-mono"
                                                                        style={{ width: 140 }}
                                                                        data-testid={`tier-limit-${tier}-${k}`}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div
                                    className="px-5 md:px-6 py-4 flex items-center justify-between gap-3 flex-wrap"
                                    style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                >
                                    <p className="font-mono text-xs" style={{ color: "hsl(var(--text-muted))" }}>
                                        Applied to all users from next request — no restart needed.
                                    </p>
                                    <button
                                        onClick={saveTierLimits}
                                        disabled={savingLimits}
                                        className="btn-primary"
                                        data-testid="admin-save-tier-limits-button"
                                    >
                                        {savingLimits ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            "Save tier limits"
                                        )}
                                    </button>
                                </div>
                            </section>
                        )}


                        {/* Users table */}
                        <section className="module mt-6 md:mt-10" data-testid="admin-users-module">
                            <div
                                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                            >
                                <div>
                                    <p className="text-overline">Users · {users.length}</p>
                                    <h2 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                        Registered accounts
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={toggleAllUsers}
                                        disabled={deletable.length === 0 || userBulkBusy}
                                        className="btn-ghost !py-1 !px-3 !text-xs flex items-center gap-2"
                                        data-testid="users-select-all-button"
                                    >
                                        {selectedUsers.size > 0 && selectedUsers.size >= deletable.length ? (
                                            <CheckSquare size={12} strokeWidth={1.5} />
                                        ) : (
                                            <Square size={12} strokeWidth={1.5} />
                                        )}
                                        {selectedUsers.size >= deletable.length && deletable.length > 0
                                            ? "Deselect all"
                                            : "Select all"}
                                    </button>
                                    <button
                                        onClick={deleteSelectedUsers}
                                        disabled={selectedUsers.size === 0 || userBulkBusy}
                                        className="btn-ghost !py-1 !px-3 !text-xs"
                                        style={{ color: selectedUsers.size > 0 ? "hsl(var(--sell))" : undefined }}
                                        data-testid="users-remove-selected-button"
                                    >
                                        {userBulkBusy ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Trash2 size={12} strokeWidth={1.5} className="inline mr-1" />
                                                Remove selected ({selectedUsers.size})
                                            </>
                                        )}
                                    </button>
                                    <div className="relative">
                                        <Search
                                            size={14}
                                            strokeWidth={1.5}
                                            className="absolute left-3 top-1/2 -translate-y-1/2"
                                            style={{ color: "hsl(var(--text-muted))" }}
                                        />
                                        <input
                                            type="text"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            placeholder="Search email or name"
                                            className="input-base pl-9 font-mono"
                                            style={{ width: 240 }}
                                            data-testid="admin-search-input"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div
                                className="px-5 md:px-6 py-3 text-xs flex items-start gap-2"
                                style={{
                                    background: "hsla(38, 45%, 45%, 0.05)",
                                    borderBottom: "1px solid hsl(var(--border-divider))",
                                    color: "hsl(var(--hold))",
                                }}
                                data-testid="users-paid-warning"
                            >
                                <AlertTriangle size={12} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                                <span style={{ color: "hsl(var(--text-secondary))" }}>
                                    Before removing, verify any <span style={{ color: "hsl(var(--hold))" }}>paid subscribers</span> have had their PayPal subscription cancelled and billing adjustments made. Bulk delete auto-cancels active PayPal subs, but always confirm in your PayPal dashboard. Admins cannot be removed.
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            {["", "Email", "Plan", "Analyses / day", "Unlock", "Logins", "Last login", "Actions"].map(
                                                (h, idx) => (
                                                    <th
                                                        key={h || `col-${idx}`}
                                                        className="text-left text-overline py-3 px-4"
                                                        style={{
                                                            background: "hsl(var(--surface-elevated))",
                                                            fontSize: "0.56rem",
                                                            width: idx === 0 ? 40 : undefined,
                                                        }}
                                                    >
                                                        {h}
                                                    </th>
                                                )
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((u) => {
                                            const unlocked = !!u.test_unlock_expires_at;
                                            const checked = selectedUsers.has(u.id);
                                            return (
                                                <tr
                                                    key={u.id}
                                                    style={{
                                                        borderTop: "1px solid hsl(var(--border-divider))",
                                                        background: checked ? "hsla(38, 45%, 45%, 0.06)" : undefined,
                                                    }}
                                                    data-testid={`user-row-${u.email}`}
                                                >
                                                    <td className="py-3 px-4">
                                                        {!u.is_admin && (
                                                            <button
                                                                onClick={() => toggleUser(u.id)}
                                                                className="inline-flex"
                                                                data-testid={`user-checkbox-${u.email}`}
                                                            >
                                                                {checked ? (
                                                                    <CheckSquare size={14} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                                                                ) : (
                                                                    <Square size={14} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
                                                                )}
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="font-mono text-sm">{u.email}</div>
                                                        <div
                                                            className="text-xs mt-0.5"
                                                            style={{ color: "hsl(var(--text-secondary))" }}
                                                        >
                                                            {u.full_name || "—"}
                                                            {u.is_admin && (
                                                                <span
                                                                    className="ml-2 text-overline"
                                                                    style={{
                                                                        color: "hsl(var(--hold))",
                                                                        fontSize: "0.54rem",
                                                                    }}
                                                                >
                                                                    ADMIN
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span
                                                            className="font-mono text-xs px-2 py-0.5"
                                                            style={{
                                                                border:
                                                                    "1px solid " +
                                                                    (u.plan === "elite"
                                                                        ? "hsl(var(--hold))"
                                                                        : u.plan === "pro"
                                                                        ? "hsl(var(--buy))"
                                                                        : "hsl(var(--border-default))"),
                                                                color:
                                                                    u.plan === "elite"
                                                                        ? "hsl(var(--hold))"
                                                                        : u.plan === "pro"
                                                                        ? "hsl(var(--buy))"
                                                                        : "hsl(var(--text-secondary))",
                                                                borderRadius: 2,
                                                            }}
                                                        >
                                                            {(u.plan || "free").toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs" data-testid={`user-analyses-${u.email}`}>
                                                        {(() => {
                                                            // Admin or active test-unlock → effectively Elite → treat as unlimited
                                                            const effUnlimited =
                                                                u.is_admin ||
                                                                u.test_unlock_active ||
                                                                u.analyses_day_limit === null ||
                                                                u.analyses_day_limit === undefined;
                                                            const used = typeof u.analyses_today === "number" ? u.analyses_today : 0;
                                                            if (effUnlimited) {
                                                                return (
                                                                    <span style={{ color: "hsl(var(--hold))" }}>
                                                                        {used} / ∞
                                                                    </span>
                                                                );
                                                            }
                                                            const limit = u.analyses_day_limit;
                                                            const atCap = used >= limit;
                                                            return (
                                                                <span style={{ color: atCap ? "hsl(var(--sell))" : "hsl(var(--text-secondary))" }}>
                                                                    {used} / {limit}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs">
                                                        {unlocked ? (
                                                            <span style={{ color: "hsl(var(--hold))" }}>
                                                                <Clock size={10} className="inline mr-1" />
                                                                {remaining(u.test_unlock_expires_at)}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: "hsl(var(--text-muted))" }}>—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-xs">{u.login_count}</td>
                                                    <td className="py-3 px-4 font-mono text-xs" style={{ color: "hsl(var(--text-secondary))" }}>
                                                        {u.last_login_at ? timeAgo(u.last_login_at) : "—"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center gap-2">
                                                            <select
                                                                value={pendingDuration[u.id] || "1h"}
                                                                onChange={(e) =>
                                                                    setPendingDuration({
                                                                        ...pendingDuration,
                                                                        [u.id]: e.target.value,
                                                                    })
                                                                }
                                                                className="input-base !py-1 !px-2 font-mono text-xs"
                                                                style={{ width: 110 }}
                                                                data-testid={`duration-select-${u.email}`}
                                                            >
                                                                {DURATIONS.map((d) => (
                                                                    <option key={d.v} value={d.v}>
                                                                        {d.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                onClick={() =>
                                                                    unlock(u.id, pendingDuration[u.id] || "1h")
                                                                }
                                                                className="btn-ghost !py-1 !px-2 !text-xs"
                                                                disabled={busy === u.id}
                                                                data-testid={`unlock-${u.email}-button`}
                                                            >
                                                                {busy === u.id ? (
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                ) : (
                                                                    "Unlock"
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => reset(u.id)}
                                                                className="btn-ghost !py-1 !px-2 !text-xs"
                                                                disabled={busy === u.id}
                                                                title="Reset to Free"
                                                                data-testid={`reset-${u.email}-button`}
                                                            >
                                                                <RotateCcw size={12} strokeWidth={1.5} />
                                                            </button>
                                                            <button
                                                                onClick={() => clearAlerts(u.id, u.email)}
                                                                className="btn-ghost !py-1 !px-2 !text-xs"
                                                                disabled={busy === u.id}
                                                                title="Remove alert list"
                                                                data-testid={`clear-alerts-${u.email}-button`}
                                                            >
                                                                <BellOff size={12} strokeWidth={1.5} />
                                                            </button>
                                                            {!u.is_admin && (
                                                                <button
                                                                    onClick={() => deleteUser(u.id, u.email)}
                                                                    className="btn-ghost !py-1 !px-2 !text-xs"
                                                                    disabled={busy === u.id}
                                                                    title="Delete user & all data"
                                                                    style={{ color: "hsl(var(--sell))" }}
                                                                    data-testid={`delete-${u.email}-button`}
                                                                >
                                                                    <Trash2 size={12} strokeWidth={1.5} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filtered.length === 0 && (
                                            <tr>
                                                <td colSpan="8" className="py-10 text-center text-[hsl(var(--text-muted))]">
                                                    No users match "{query}"
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {/* Login events */}
                        <section className="module mt-6 md:mt-8" data-testid="admin-logins-module">
                            <div
                                className="p-5 md:p-6 flex items-center justify-between flex-wrap gap-3"
                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                            >
                                <div>
                                    <p className="text-overline">Recent sign-ins · {logins.length}</p>
                                    <h3 className="font-serif text-xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                                        Login events
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={toggleAllLogins}
                                        disabled={logins.length === 0 || loginBusy}
                                        className="btn-ghost !py-1 !px-3 !text-xs flex items-center gap-2"
                                        data-testid="logins-select-all-button"
                                    >
                                        {selectedLogins.size > 0 && selectedLogins.size === logins.length ? (
                                            <CheckSquare size={12} strokeWidth={1.5} />
                                        ) : (
                                            <Square size={12} strokeWidth={1.5} />
                                        )}
                                        {selectedLogins.size === logins.length && logins.length > 0
                                            ? "Deselect all"
                                            : "Select all"}
                                    </button>
                                    <button
                                        onClick={deleteSelectedLogins}
                                        disabled={selectedLogins.size === 0 || loginBusy}
                                        className="btn-ghost !py-1 !px-3 !text-xs"
                                        data-testid="logins-delete-selected-button"
                                    >
                                        {loginBusy ? (
                                            <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                            `Delete selected (${selectedLogins.size})`
                                        )}
                                    </button>
                                    <button
                                        onClick={clearAllLogins}
                                        disabled={logins.length === 0 || loginBusy}
                                        className="btn-ghost !py-1 !px-3 !text-xs"
                                        style={{ color: "hsl(var(--sell))" }}
                                        data-testid="logins-clear-all-button"
                                    >
                                        <Trash2 size={12} strokeWidth={1.5} className="inline mr-1" />
                                        Clear all
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto">
                                {logins.map((l) => {
                                    const selected = selectedLogins.has(l.id);
                                    return (
                                        <div
                                            key={l.id}
                                            className="py-3 px-5 md:px-6 flex items-center gap-3 text-sm cursor-pointer hover:bg-[hsl(var(--surface-elevated))]"
                                            style={{
                                                borderBottom: "1px solid hsl(var(--border-divider))",
                                                background: selected ? "hsla(38, 45%, 45%, 0.08)" : undefined,
                                            }}
                                            onClick={() => toggleLogin(l.id)}
                                            data-testid={`login-event-${l.id}`}
                                        >
                                            {selected ? (
                                                <CheckSquare size={14} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                                            ) : (
                                                <Square size={14} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
                                            )}
                                            <div className="flex-1 flex items-center justify-between">
                                                <div>
                                                    <span className="font-mono text-sm">{l.email}</span>
                                                    <span
                                                        className="ml-3 text-overline"
                                                        style={{
                                                            fontSize: "0.56rem",
                                                            color:
                                                                l.method === "google"
                                                                    ? "hsl(var(--buy))"
                                                                    : "hsl(var(--text-secondary))",
                                                        }}
                                                    >
                                                        via {l.method}
                                                    </span>
                                                </div>
                                                <span
                                                    className="text-overline"
                                                    style={{
                                                        color: "hsl(var(--text-muted))",
                                                        fontSize: "0.56rem",
                                                    }}
                                                >
                                                    {timeAgo(l.at)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {logins.length === 0 && (
                                    <p className="p-8 text-center text-[hsl(var(--text-muted))] text-sm">
                                        No sign-ins recorded yet.
                                    </p>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </AppShell>
    );
}
