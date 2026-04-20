import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldCheck, Clock, RotateCcw, Search, Trash2, BellOff, DollarSign, CheckSquare, Square } from "lucide-react";
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
    const [savingPrice, setSavingPrice] = useState(false);
    const [selectedLogins, setSelectedLogins] = useState(new Set());
    const [loginBusy, setLoginBusy] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [u, l, pr] = await Promise.all([
                api.get("/admin/users"),
                api.get("/admin/logins"),
                api.get("/admin/pricing"),
            ]);
            setUsers(u.data || []);
            setLogins(l.data || []);
            setPricing(pr.data || null);
            setProForm(String(pr.data?.pro_monthly ?? ""));
            setEliteForm(String(pr.data?.elite_monthly ?? ""));
            setDiscountForm(String(pr.data?.annual_discount_pct ?? ""));
            setSelectedLogins(new Set());
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

    const savePricing = async () => {
        setError("");
        setMessage("");
        const pro = parseFloat(proForm);
        const elite = parseFloat(eliteForm);
        const discount = parseFloat(discountForm);
        if (!(pro > 0) || !(elite > 0)) {
            setError("Prices must be positive numbers");
            return;
        }
        if (!(discount >= 0) || discount > 90) {
            setError("Annual discount must be between 0 and 90");
            return;
        }
        setSavingPrice(true);
        try {
            const r = await api.put("/admin/pricing", {
                pro_price: pro,
                elite_price: elite,
                annual_discount_pct: discount,
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
                            {pricing && (
                                <div
                                    className="px-5 md:px-6 pb-5 font-mono text-xs"
                                    style={{ color: "hsl(var(--text-muted))" }}
                                >
                                    Live: Pro ${pricing.pro_monthly.toFixed(2)}/mo (${pricing.pro_yearly.toFixed(2)}/yr) · Elite ${pricing.elite_monthly.toFixed(2)}/mo (${pricing.elite_yearly.toFixed(2)}/yr) · Annual discount {Math.round(pricing.annual_discount_pct)}%
                                </div>
                            )}
                        </section>

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
                                        style={{ width: 280 }}
                                        data-testid="admin-search-input"
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                    <thead>
                                        <tr>
                                            {["Email", "Plan", "Unlock", "Logins", "Last login", "Actions"].map(
                                                (h) => (
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
                                                )
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((u) => {
                                            const unlocked = !!u.test_unlock_expires_at;
                                            return (
                                                <tr
                                                    key={u.id}
                                                    style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                                    data-testid={`user-row-${u.email}`}
                                                >
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
                                                <td colSpan="6" className="py-10 text-center text-[hsl(var(--text-muted))]">
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
