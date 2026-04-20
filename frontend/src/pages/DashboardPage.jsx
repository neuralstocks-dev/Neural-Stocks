import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import AppShell from "@/components/AppShell";
import AddStockModal from "@/components/AddStockModal";
import Sparkline from "@/components/Sparkline";
import SignalBadge from "@/components/SignalBadge";
import { useAuth } from "@/hooks/useAuth";
import { formatPrice, formatPct, timeAgo } from "@/lib/format";
import {
    ArrowUpRight,
    Bell,
    Plus,
    RefreshCw,
    Sparkles,
    Trash2,
    TrendingDown,
    TrendingUp,
    Loader2,
    Lock,
} from "lucide-react";

function WatchlistRow({ item, sparkline, onRemove, onAnalyze, analyzing }) {
    const q = item.quote || {};
    const up = (q.change_pct ?? 0) >= 0;
    return (
        <div
            className="rise-in grid grid-cols-12 items-center gap-2 py-5 md:py-6 px-4 md:px-6 group"
            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
            data-testid={`watchlist-card-${item.ticker}`}
        >
            <div className="col-span-12 md:col-span-3 flex items-center gap-3">
                <div>
                    <div className="font-mono text-lg font-medium tracking-tight">{item.ticker}</div>
                    <div className="text-xs text-[hsl(var(--text-secondary))] mt-0.5 line-clamp-1">
                        {item.name || "—"}
                    </div>
                    <span
                        className="text-overline mt-1 inline-block"
                        style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                    >
                        {item.category || "other"}
                    </span>
                </div>
            </div>

            <div className="col-span-6 md:col-span-3">
                <div className="font-mono text-2xl md:text-[1.75rem] leading-none hero-number">
                    {q.price != null ? formatPrice(q.price, q.currency) : "—"}
                </div>
                <div
                    className="flex items-center gap-1 mt-1 font-mono text-xs"
                    style={{ color: up ? "hsl(var(--buy))" : "hsl(var(--sell))" }}
                >
                    {up ? (
                        <TrendingUp size={12} strokeWidth={1.75} />
                    ) : (
                        <TrendingDown size={12} strokeWidth={1.75} />
                    )}
                    {q.change != null ? `${up ? "+" : ""}${q.change.toFixed(2)}` : "—"}
                    <span className="opacity-70 ml-1">
                        {q.change_pct != null ? formatPct(q.change_pct) : ""}
                    </span>
                </div>
            </div>

            <div className="hidden md:flex md:col-span-3 items-center">
                <Sparkline data={sparkline} width={180} height={38} color="trend" />
            </div>

            <div className="col-span-3 md:col-span-2">
                {item.latest_analysis?.recommendation ? (
                    <div>
                        <SignalBadge signal={item.latest_analysis.recommendation} />
                        <div className="text-overline mt-1" style={{ fontSize: "0.56rem" }}>
                            {item.latest_analysis.confidence_score}% conf · {timeAgo(item.latest_analysis.created_at)}
                        </div>
                    </div>
                ) : (
                    <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                        No analysis
                    </span>
                )}
            </div>

            <div className="col-span-3 md:col-span-1 flex items-center justify-end gap-1">
                <button
                    onClick={() => onAnalyze(item.ticker)}
                    className="btn-ghost !py-1.5 !px-2 !text-xs"
                    title="Analyze now"
                    disabled={analyzing}
                    data-testid={`analyze-${item.ticker}-button`}
                >
                    {analyzing ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : (
                        <Sparkles size={12} strokeWidth={1.5} />
                    )}
                </button>
                <Link
                    to={`/analysis/${item.ticker}`}
                    className="btn-ghost !py-1.5 !px-2 !text-xs"
                    title="View details"
                    data-testid={`view-${item.ticker}-button`}
                >
                    <ArrowUpRight size={12} strokeWidth={1.5} />
                </Link>
                <button
                    onClick={() => onRemove(item.ticker)}
                    className="btn-ghost !py-1.5 !px-2 !text-xs opacity-60 hover:opacity-100"
                    title="Remove"
                    data-testid={`remove-${item.ticker}-button`}
                >
                    <Trash2 size={12} strokeWidth={1.5} />
                </button>
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [sparks, setSparks] = useState({}); // ticker -> [closes]
    const [alerts, setAlerts] = useState([]);
    const [quota, setQuota] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [analyzingTicker, setAnalyzingTicker] = useState(null);
    const [quickBusy, setQuickBusy] = useState(null); // 'top' | 'bottom' | null
    const [modalOpen, setModalOpen] = useState(false);
    const [actionError, setActionError] = useState("");

    const plan = user?.plan || "free";
    const canQuickActions = quota?.quick_actions ?? (plan !== "free");
    const watchlistLimit = quota?.watchlist_limit ?? (plan === "free" ? 3 : plan === "pro" ? 10 : 25);
    const watchlistFull = items.length >= watchlistLimit;

    const fetchWatchlist = useCallback(async () => {
        const r = await api.get("/watchlist/live");
        setItems(r.data || []);
        return r.data || [];
    }, []);

    const fetchAlerts = useCallback(async () => {
        const r = await api.get("/alerts");
        setAlerts(r.data || []);
    }, []);

    const fetchQuota = useCallback(async () => {
        try {
            const r = await api.get("/quota");
            setQuota(r.data);
        } catch {
            /* ignore */
        }
    }, []);

    const fetchSparks = useCallback(async (tickers) => {
        const results = await Promise.all(
            tickers.map(async (t) => {
                try {
                    const r = await api.get(`/stocks/${t}/history`, {
                        params: { period: "1mo", interval: "1d" },
                    });
                    return [t, (r.data.points || []).map((p) => p.close).filter((v) => v != null)];
                } catch {
                    return [t, []];
                }
            })
        );
        setSparks(Object.fromEntries(results));
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const wl = await fetchWatchlist();
                await fetchAlerts();
                await fetchQuota();
                if (wl.length) await fetchSparks(wl.map((i) => i.ticker));
            } finally {
                setLoading(false);
            }
        })();
    }, [fetchWatchlist, fetchAlerts, fetchQuota, fetchSparks]);

    const refresh = async () => {
        setRefreshing(true);
        try {
            const wl = await fetchWatchlist();
            await fetchAlerts();
            await fetchQuota();
            if (wl.length) await fetchSparks(wl.map((i) => i.ticker));
        } finally {
            setRefreshing(false);
        }
    };

    const removeTicker = async (ticker) => {
        await api.delete(`/watchlist/${ticker}`);
        setItems((prev) => prev.filter((i) => i.ticker !== ticker));
        await fetchQuota();
    };

    const analyzeOne = async (ticker) => {
        setActionError("");
        setAnalyzingTicker(ticker);
        try {
            await api.post(`/analysis/${ticker}`);
            await fetchWatchlist();
            await fetchAlerts();
            await fetchQuota();
        } catch (err) {
            setActionError(err?.response?.data?.detail || "Analysis failed");
        } finally {
            setAnalyzingTicker(null);
        }
    };

    const quickAnalyze = async (kind) => {
        if (items.length === 0) {
            setActionError("Add stocks to your watchlist first");
            return;
        }
        setActionError("");
        setQuickBusy(kind);
        try {
            await api.post(`/analysis/quick/${kind}`);
            await fetchWatchlist();
            await fetchAlerts();
            await fetchQuota();
        } catch (err) {
            setActionError(err?.response?.data?.detail || "Quick analysis failed");
        } finally {
            setQuickBusy(null);
        }
    };

    const markAllAlertsRead = async () => {
        await api.post("/alerts/read_all");
        setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    };

    // Performance summary derivations
    const perf = useMemo(() => {
        const changes = items.map((i) => i.quote?.change_pct).filter((v) => v != null);
        if (!changes.length) return { avg: null, gainers: 0, losers: 0 };
        const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
        return {
            avg,
            gainers: changes.filter((c) => c > 0).length,
            losers: changes.filter((c) => c < 0).length,
        };
    }, [items]);

    const unread = alerts.filter((a) => !a.read).length;

    return (
        <AppShell>
            <AddStockModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onAdded={() => {
                    refresh();
                }}
            />

            <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-10 pb-16">
                {/* Hero header */}
                <section className="mb-8 md:mb-12">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="live-dot" />
                        <span className="text-overline">Live Desk</span>
                        <span className="text-overline" style={{ color: "hsl(var(--text-muted))" }}>
                            · {new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })}
                        </span>
                    </div>
                    <h1
                        className="font-serif hero-number"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)" }}
                        data-testid="dashboard-title"
                    >
                        Your edge,
                        <em className="italic" style={{ color: "hsl(var(--buy))", fontWeight: 400 }}>
                            {" "}
                            in focus.
                        </em>
                    </h1>
                    <p
                        className="mt-4 text-base max-w-2xl"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        Five positions, reasoned verdicts, signal-grade alerts. Tap
                        <span className="font-mono text-[hsl(var(--text-primary))]"> Analyze Now</span>
                        &nbsp;on any row, or let Claude sweep your movers with
                        <span className="font-mono text-[hsl(var(--text-primary))]"> Top/Bottom 3</span>.
                    </p>
                </section>

                {/* Quota banner */}
                {quota && (
                    <section
                        className="module px-5 py-4 mb-4 flex items-center justify-between flex-wrap gap-3"
                        data-testid="quota-banner"
                    >
                        <div className="flex flex-wrap items-center gap-5 md:gap-8">
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Plan</p>
                                <p className="font-mono text-sm mt-1" style={{ color: plan === "elite" ? "hsl(var(--hold))" : plan === "pro" ? "hsl(var(--buy))" : "hsl(var(--text-primary))" }}>
                                    {quota.plan_name.toUpperCase()}
                                </p>
                            </div>
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Watchlist</p>
                                <p className="font-mono text-sm mt-1">{quota.watchlist_used} / {quota.watchlist_limit}</p>
                            </div>
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Analyses · today</p>
                                <p className="font-mono text-sm mt-1">
                                    {quota.analyses_today}
                                    {" / "}
                                    {quota.analyses_day_limit === null ? "∞" : quota.analyses_day_limit}
                                </p>
                            </div>
                            <div>
                                <p className="text-overline" style={{ fontSize: "0.56rem" }}>Analyses · week</p>
                                <p className="font-mono text-sm mt-1">
                                    {quota.analyses_this_week}
                                    {" / "}
                                    {quota.analyses_week_limit === null ? "∞" : quota.analyses_week_limit}
                                </p>
                            </div>
                        </div>
                        {plan !== "elite" && (
                            <Link
                                to="/pricing"
                                className="btn-ghost !text-xs"
                                data-testid="upgrade-link"
                            >
                                Upgrade →
                            </Link>
                        )}
                    </section>
                )}

                {actionError && (
                    <div className="signal-sell px-4 py-3 mb-4 font-mono text-sm" data-testid="action-error">
                        {actionError}
                    </div>
                )}

                {/* Quick Actions */}
                <section className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
                    <button
                        onClick={() => quickAnalyze("top")}
                        className="btn-quick flex items-center justify-between"
                        disabled={!!quickBusy || !canQuickActions}
                        title={!canQuickActions ? "Pro/Elite feature" : undefined}
                        data-testid="analyze-top-button"
                    >
                        <span>
                            {!canQuickActions ? "Top 3 · Pro" : quickBusy === "top" ? "Analyzing…" : "Analyze Top 3"}
                        </span>
                        {!canQuickActions ? (
                            <Lock size={14} strokeWidth={1.5} />
                        ) : quickBusy === "top" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <TrendingUp size={14} strokeWidth={1.5} />
                        )}
                    </button>
                    <button
                        onClick={() => quickAnalyze("bottom")}
                        className="btn-quick flex items-center justify-between"
                        disabled={!!quickBusy || !canQuickActions}
                        title={!canQuickActions ? "Pro/Elite feature" : undefined}
                        data-testid="analyze-bottom-button"
                    >
                        <span>
                            {!canQuickActions ? "Bottom 3 · Pro" : quickBusy === "bottom" ? "Analyzing…" : "Analyze Bottom 3"}
                        </span>
                        {!canQuickActions ? (
                            <Lock size={14} strokeWidth={1.5} />
                        ) : quickBusy === "bottom" ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <TrendingDown size={14} strokeWidth={1.5} />
                        )}
                    </button>
                    <button
                        onClick={refresh}
                        className="btn-quick flex items-center justify-between"
                        disabled={refreshing}
                        data-testid="refresh-button"
                    >
                        <span>{refreshing ? "Refreshing…" : "Refresh Prices"}</span>
                        <RefreshCw size={14} strokeWidth={1.5} className={refreshing ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={() => setModalOpen(true)}
                        className="btn-quick flex items-center justify-between"
                        disabled={watchlistFull}
                        data-testid="add-stock-button"
                    >
                        <span>
                            {watchlistFull ? "Watchlist Full" : "Add Stock"}
                        </span>
                        <Plus size={14} strokeWidth={1.5} />
                    </button>
                </section>

                {/* Main grid: Watchlist + Alerts + Performance */}
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-1 md:gap-4">
                    {/* Watchlist module */}
                    <div className="lg:col-span-8 module">
                        <div className="p-5 md:p-6 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                            <div>
                                <p className="text-overline">Watchlist · {items.length} / {watchlistLimit}</p>
                                <h2 className="font-serif text-2xl md:text-3xl mt-1" style={{ letterSpacing: "-0.015em" }}>
                                    Positions under watch
                                </h2>
                            </div>
                        </div>

                        {loading && (
                            <div className="p-10 text-center text-[hsl(var(--text-secondary))]">
                                <Loader2 className="animate-spin mx-auto" size={20} />
                                <p className="mt-3 text-sm font-mono">Loading watchlist…</p>
                            </div>
                        )}

                        {!loading && items.length === 0 && (
                            <div
                                className="relative p-12 md:p-20 text-center grid-bg"
                                data-testid="watchlist-empty-state"
                            >
                                <p className="text-overline">Empty ledger</p>
                                <h3
                                    className="font-serif mt-4"
                                    style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", lineHeight: 1.05 }}
                                >
                                    Every thesis begins with
                                    <em className="italic" style={{ color: "hsl(var(--hold))" }}>
                                        {" "}
                                        one ticker.
                                    </em>
                                </h3>
                                <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: "hsl(var(--text-secondary))" }}>
                                    Add up to five symbols to unlock live prices, AI verdicts, and real-time alerts.
                                </p>
                                <button
                                    onClick={() => setModalOpen(true)}
                                    className="btn-primary mt-8"
                                    data-testid="empty-add-stock-button"
                                >
                                    <Plus size={14} strokeWidth={1.5} /> Add your first stock
                                </button>
                            </div>
                        )}

                        {!loading && items.length > 0 && (
                            <div>
                                {items.map((item) => (
                                    <WatchlistRow
                                        key={item.ticker}
                                        item={item}
                                        sparkline={sparks[item.ticker] || []}
                                        onRemove={removeTicker}
                                        onAnalyze={analyzeOne}
                                        analyzing={analyzingTicker === item.ticker}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Alerts feed */}
                    <div className="lg:col-span-4 module">
                        <div
                            className="p-5 md:p-6 flex items-center justify-between"
                            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                        >
                            <div>
                                <p className="text-overline">Signal Feed</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Bell size={16} strokeWidth={1.5} />
                                    <h3 className="font-serif text-xl" style={{ letterSpacing: "-0.01em" }}>
                                        Alerts {unread > 0 && <span className="font-mono text-xs ml-1 signal-hold px-2 py-0.5" data-testid="unread-count">{unread}</span>}
                                    </h3>
                                </div>
                            </div>
                            {alerts.length > 0 && (
                                <button
                                    onClick={markAllAlertsRead}
                                    className="text-overline hover:text-[hsl(var(--text-primary))]"
                                    data-testid="mark-all-read-button"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>

                        <div className="max-h-[520px] overflow-y-auto" data-testid="alerts-list">
                            {alerts.length === 0 ? (
                                <div className="p-8 text-center">
                                    <p
                                        className="text-overline"
                                        style={{ color: "hsl(var(--text-muted))" }}
                                    >
                                        No alerts yet
                                    </p>
                                    <p
                                        className="mt-2 text-sm"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        High-confidence verdicts (≥75%) appear here.
                                    </p>
                                </div>
                            ) : (
                                alerts.map((a) => {
                                    const signalColor =
                                        a.signal === "BUY"
                                            ? "hsl(var(--buy))"
                                            : a.signal === "SELL"
                                            ? "hsl(var(--sell))"
                                            : "hsl(var(--hold))";
                                    return (
                                        <Link
                                            to={`/analysis/${a.ticker}`}
                                            key={a.id}
                                            className="block px-4 py-4 hover:bg-[hsl(var(--surface-elevated))] transition-colors"
                                            style={{
                                                borderBottom: "1px solid hsl(var(--border-divider))",
                                                borderLeft: `2px solid ${signalColor}`,
                                                opacity: a.read ? 0.55 : 1,
                                            }}
                                            data-testid={`alert-${a.id}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-sm font-medium">{a.ticker}</span>
                                                    <SignalBadge signal={a.signal} />
                                                </div>
                                                <span className="text-overline" style={{ fontSize: "0.56rem" }}>
                                                    {timeAgo(a.created_at)}
                                                </span>
                                            </div>
                                            <p
                                                className="mt-2 text-xs line-clamp-2"
                                                style={{ color: "hsl(var(--text-secondary))" }}
                                            >
                                                {a.message}
                                            </p>
                                            <p className="text-overline mt-1" style={{ fontSize: "0.56rem" }}>
                                                {a.confidence_score}% conviction
                                            </p>
                                        </Link>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Performance summary */}
                    <div className="lg:col-span-12 module mt-1 md:mt-0">
                        <div
                            className="p-5 md:p-6 grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-6"
                            style={{ borderTop: "none" }}
                        >
                            <div>
                                <p className="text-overline">Avg change today</p>
                                <div
                                    className="font-mono hero-number mt-2"
                                    style={{
                                        fontSize: "2.4rem",
                                        color:
                                            perf.avg == null
                                                ? "hsl(var(--text-muted))"
                                                : perf.avg >= 0
                                                ? "hsl(var(--buy))"
                                                : "hsl(var(--sell))",
                                    }}
                                    data-testid="perf-avg"
                                >
                                    {perf.avg == null ? "—" : formatPct(perf.avg)}
                                </div>
                            </div>
                            <div>
                                <p className="text-overline">Gainers / Losers</p>
                                <div className="font-mono hero-number mt-2" style={{ fontSize: "2.4rem" }}>
                                    <span style={{ color: "hsl(var(--buy))" }}>{perf.gainers}</span>
                                    <span style={{ color: "hsl(var(--text-muted))" }}> / </span>
                                    <span style={{ color: "hsl(var(--sell))" }}>{perf.losers}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-overline">Verdicts generated</p>
                                <div className="font-mono hero-number mt-2" style={{ fontSize: "2.4rem" }}>
                                    {items.filter((i) => i.latest_analysis).length}
                                </div>
                            </div>
                            <div>
                                <p className="text-overline">Unread alerts</p>
                                <div
                                    className="font-mono hero-number mt-2"
                                    style={{
                                        fontSize: "2.4rem",
                                        color: unread > 0 ? "hsl(var(--hold))" : "hsl(var(--text-muted))",
                                    }}
                                >
                                    {unread}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </AppShell>
    );
}
