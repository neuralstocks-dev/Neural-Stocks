import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    PieChart,
    Plus,
    Trash2,
    TrendingUp,
    TrendingDown,
    Pencil,
    X,
    ArrowUpRight,
    Loader2,
    Save,
    CalendarIcon,
} from "lucide-react";

function fmtMoney(v, currency = "USD") {
    if (v === null || v === undefined) return "—";
    const sym = { USD: "$", SGD: "S$", HKD: "HK$", GBP: "£", EUR: "€", JPY: "¥" }[currency] || "";
    const abs = Math.abs(v);
    const formatted = abs.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    return `${v < 0 ? "-" : ""}${sym}${formatted}`;
}

function fmtPct(v) {
    if (v === null || v === undefined) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
}

function signColor(v) {
    if (v === null || v === undefined) return "hsl(var(--text-muted))";
    if (v > 0) return "hsl(var(--buy))";
    if (v < 0) return "hsl(var(--sell))";
    return "hsl(var(--text-muted))";
}

function AddPositionForm({ onAdd, busy }) {
    const [form, setForm] = useState({ ticker: "", shares: "", avg_cost: "", purchase_date: "" });
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        setErr("");
        if (!form.ticker.trim() || !form.shares || !form.avg_cost) {
            setErr("Ticker, shares, and cost are required.");
            return;
        }
        try {
            await onAdd({
                ticker: form.ticker.trim().toUpperCase(),
                shares: Number(form.shares),
                avg_cost: Number(form.avg_cost),
                purchase_date: form.purchase_date || undefined,
            });
            setForm({ ticker: "", shares: "", avg_cost: "", purchase_date: "" });
        } catch (e2) {
            setErr(e2?.response?.data?.detail || "Failed to add position.");
        }
    };

    const inputStyle = {
        background: "hsl(var(--surface-elevated))",
        border: "1px solid hsl(var(--border-default))",
        color: "hsl(var(--text-primary))",
        borderRadius: 2,
    };

    return (
        <form onSubmit={submit} className="module p-5" data-testid="add-position-form">
            <p className="text-overline mb-3 flex items-center gap-2">
                <Plus size={12} strokeWidth={1.5} /> Add position
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <input
                    type="text"
                    placeholder="Ticker (AAPL)"
                    value={form.ticker}
                    onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                    className="px-3 py-2 font-mono text-sm"
                    style={inputStyle}
                    data-testid="position-ticker-input"
                />
                <input
                    type="number"
                    step="any"
                    placeholder="Shares"
                    value={form.shares}
                    onChange={(e) => setForm({ ...form, shares: e.target.value })}
                    className="px-3 py-2 font-mono text-sm"
                    style={inputStyle}
                    data-testid="position-shares-input"
                />
                <input
                    type="number"
                    step="any"
                    placeholder="Avg cost"
                    value={form.avg_cost}
                    onChange={(e) => setForm({ ...form, avg_cost: e.target.value })}
                    className="px-3 py-2 font-mono text-sm"
                    style={inputStyle}
                    data-testid="position-cost-input"
                />
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="px-3 py-2 font-mono text-sm inline-flex items-center justify-between"
                            style={inputStyle}
                            data-testid="position-date-input"
                        >
                            <span style={{ color: form.purchase_date ? "hsl(var(--text-primary))" : "hsl(var(--text-muted))" }}>
                                {form.purchase_date || "Purchase date"}
                            </span>
                            <CalendarIcon size={14} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-auto p-0"
                        align="start"
                        style={{
                            background: "hsl(var(--surface))",
                            border: "1px solid hsl(var(--border-default))",
                            borderRadius: 2,
                        }}
                    >
                        <Calendar
                            mode="single"
                            selected={form.purchase_date ? new Date(form.purchase_date) : undefined}
                            onSelect={(d) => {
                                if (!d) return;
                                const iso = d.toISOString().slice(0, 10);
                                setForm((prev) => ({ ...prev, purchase_date: iso }));
                            }}
                            disabled={(d) => d > new Date()}
                            data-testid="position-date-calendar"
                        />
                    </PopoverContent>
                </Popover>
                <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary"
                    data-testid="position-add-button"
                >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={1.5} />}
                    {busy ? "Adding…" : "Add"}
                </button>
            </div>
            {err && (
                <p className="mt-2 text-xs" style={{ color: "hsl(var(--sell))" }} data-testid="add-position-error">
                    {err}
                </p>
            )}
        </form>
    );
}

function EditRow({ p, onSave, onCancel, busy }) {
    const [shares, setShares] = useState(p.shares);
    const [avgCost, setAvgCost] = useState(p.avg_cost);
    const save = async () => {
        await onSave({ shares: Number(shares), avg_cost: Number(avgCost) });
    };
    const inputStyle = {
        background: "hsl(var(--surface-elevated))",
        border: "1px solid hsl(var(--border-default))",
        color: "hsl(var(--text-primary))",
        borderRadius: 2,
        width: "100%",
    };
    return (
        <tr style={{ background: "hsla(38, 45%, 45%, 0.06)" }} data-testid={`edit-row-${p.ticker}`}>
            <td className="py-2 px-4 font-mono text-sm">{p.ticker}</td>
            <td className="py-2 px-4" colSpan={1}>
                <input type="number" step="any" value={shares} onChange={(e) => setShares(e.target.value)} className="px-2 py-1 font-mono text-xs" style={inputStyle} data-testid={`edit-shares-${p.ticker}`} />
            </td>
            <td className="py-2 px-4" colSpan={1}>
                <input type="number" step="any" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} className="px-2 py-1 font-mono text-xs" style={inputStyle} data-testid={`edit-cost-${p.ticker}`} />
            </td>
            <td colSpan={6} className="py-2 px-4 text-right">
                <button onClick={save} disabled={busy} className="btn-quick inline-flex items-center gap-1 mr-2" data-testid={`save-edit-${p.ticker}`}>
                    <Save size={12} /> Save
                </button>
                <button onClick={onCancel} className="btn-quick inline-flex items-center gap-1" data-testid={`cancel-edit-${p.ticker}`}>
                    <X size={12} /> Cancel
                </button>
            </td>
        </tr>
    );
}

export default function PortfolioPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null); // position id
    const [busyEdit, setBusyEdit] = useState(false);

    const refresh = async () => {
        try {
            const r = await api.get("/portfolio");
            setData(r.data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const addPosition = async (body) => {
        setAdding(true);
        try {
            await api.post("/portfolio", body);
            await refresh();
        } finally {
            setAdding(false);
        }
    };

    const deletePosition = async (id) => {
        if (!window.confirm("Remove this position?")) return;
        await api.delete(`/portfolio/${id}`);
        await refresh();
    };

    const saveEdit = async (updates) => {
        setBusyEdit(true);
        try {
            await api.put(`/portfolio/${editing}`, updates);
            setEditing(null);
            await refresh();
        } finally {
            setBusyEdit(false);
        }
    };

    const positions = data?.positions || [];
    const currency = data?.currency || "USD";

    const metrics = useMemo(() => {
        if (!data) return [];
        return [
            { label: "Cost basis", value: fmtMoney(data.total_cost_basis, currency), sub: `${positions.length} positions` },
            { label: "Market value", value: fmtMoney(data.total_market_value, currency), sub: `Live · refreshes on reload` },
            {
                label: "Unrealized P&L",
                value: fmtMoney(data.total_unrealized_pl, currency),
                sub: fmtPct(data.total_unrealized_pl_pct),
                color: signColor(data.total_unrealized_pl),
            },
            {
                label: "Day change",
                value: fmtMoney(data.total_day_change, currency),
                sub: fmtPct(data.total_day_change_pct),
                color: signColor(data.total_day_change),
            },
        ];
    }, [data, positions.length, currency]);

    return (
        <>
            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16" data-testid="portfolio-page">
                <p className="text-overline flex items-center gap-2">
                    <PieChart size={12} strokeWidth={1.5} /> Portfolio · Live P&L
                </p>
                <h1
                    className="font-serif mt-3"
                    style={{
                        fontSize: "clamp(2.2rem, 4.5vw, 3.6rem)",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.04,
                    }}
                >
                    What you own, <em style={{ color: "hsl(var(--hold))" }}>marked to market</em>.
                </h1>
                <p className="mt-4 max-w-2xl text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    Enter your holdings once. Neural Stock Intelligence™ computes live market value, unrealized P&L, and allocation
                    continuously against the latest prices. This data is private to your account.
                </p>

                {/* Top metrics */}
                <section className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-4 mt-8">
                    {metrics.map((m) => (
                        <div
                            key={m.label}
                            className="module p-5 md:p-6"
                            data-testid={`portfolio-metric-${m.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                        >
                            <p className="text-overline">{m.label}</p>
                            <p
                                className="font-serif mt-2"
                                style={{
                                    fontSize: "1.75rem",
                                    letterSpacing: "-0.01em",
                                    color: m.color || "hsl(var(--text-primary))",
                                }}
                            >
                                {m.value}
                            </p>
                            <p
                                className="text-xs mt-1 font-mono"
                                style={{ color: m.color || "hsl(var(--text-muted))" }}
                            >
                                {m.sub}
                            </p>
                        </div>
                    ))}
                </section>

                <div className="mt-6">
                    <AddPositionForm onAdd={addPosition} busy={adding} />
                </div>

                {/* Positions table */}
                <section className="module mt-4" data-testid="portfolio-table">
                    {loading ? (
                        <div className="py-16 text-center" style={{ color: "hsl(var(--text-muted))" }}>
                            <Loader2 size={24} className="animate-spin mx-auto" />
                            <p className="mt-3 text-overline">Loading portfolio…</p>
                        </div>
                    ) : positions.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="font-serif" style={{ fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
                                No positions yet.
                            </p>
                            <p className="mt-2 text-sm" style={{ color: "hsl(var(--text-secondary))" }}>
                                Add your first holding above to see live P&L.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        {["Ticker", "Shares", "Avg cost", "Current", "Market value", "Unrealized P&L", "Day Δ", "Alloc", ""].map((h) => (
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
                                    {positions.map((p) => {
                                        if (editing === p.id) {
                                            return (
                                                <EditRow
                                                    key={p.id}
                                                    p={p}
                                                    onSave={saveEdit}
                                                    onCancel={() => setEditing(null)}
                                                    busy={busyEdit}
                                                />
                                            );
                                        }
                                        return (
                                            <tr
                                                key={p.id}
                                                style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                                                data-testid={`portfolio-row-${p.ticker}`}
                                            >
                                                <td className="py-3 px-4">
                                                    <Link
                                                        to={`/analysis/${p.ticker}`}
                                                        className="font-mono font-medium inline-flex items-center gap-1.5 hover:text-[hsl(var(--hold))] transition-colors"
                                                    >
                                                        {p.ticker}
                                                        <ArrowUpRight size={12} strokeWidth={1.5} />
                                                    </Link>
                                                    {p.name && (
                                                        <div
                                                            className="text-xs mt-0.5"
                                                            style={{ color: "hsl(var(--text-secondary))" }}
                                                        >
                                                            {p.name}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 font-mono">{p.shares.toLocaleString()}</td>
                                                <td className="py-3 px-4 font-mono">{fmtMoney(p.avg_cost, p.currency)}</td>
                                                <td className="py-3 px-4 font-mono">
                                                    {fmtMoney(p.current_price, p.currency)}
                                                </td>
                                                <td className="py-3 px-4 font-mono">
                                                    {fmtMoney(p.market_value, p.currency)}
                                                </td>
                                                <td
                                                    className="py-3 px-4 font-mono"
                                                    style={{ color: signColor(p.unrealized_pl) }}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        {p.unrealized_pl > 0 ? (
                                                            <TrendingUp size={12} strokeWidth={1.8} />
                                                        ) : p.unrealized_pl < 0 ? (
                                                            <TrendingDown size={12} strokeWidth={1.8} />
                                                        ) : null}
                                                        <span>{fmtMoney(p.unrealized_pl, p.currency)}</span>
                                                    </div>
                                                    <div className="text-xs" style={{ opacity: 0.7 }}>
                                                        {fmtPct(p.unrealized_pl_pct)}
                                                    </div>
                                                </td>
                                                <td
                                                    className="py-3 px-4 font-mono"
                                                    style={{ color: signColor(p.day_change) }}
                                                >
                                                    <div>{fmtMoney(p.day_change, p.currency)}</div>
                                                    <div className="text-xs" style={{ opacity: 0.7 }}>
                                                        {fmtPct(p.day_change_pct)}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 font-mono text-xs">
                                                    {p.allocation_pct?.toFixed(1)}%
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setEditing(p.id)}
                                                            className="text-xs inline-flex items-center gap-1"
                                                            style={{ color: "hsl(var(--text-secondary))" }}
                                                            data-testid={`edit-${p.ticker}`}
                                                            title="Edit position"
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => deletePosition(p.id)}
                                                            className="text-xs inline-flex items-center gap-1"
                                                            style={{ color: "hsl(var(--sell))" }}
                                                            data-testid={`delete-${p.ticker}`}
                                                            title="Delete position"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </>
    );
}
