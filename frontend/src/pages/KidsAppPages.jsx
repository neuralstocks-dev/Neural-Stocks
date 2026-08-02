/**
 * KidStocks logged-in pages — Dashboard, Discover, Portfolio,
 * Watchlist, AnalyzeWithBuy. Bundled in one file to minimise route
 * boilerplate; each is a small focused component.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
    Loader2, ArrowRight, ArrowUp, ArrowDown, TrendingUp, Sparkles, Lightbulb,
    MessageCircle, Brain, Star, StarOff, ShoppingCart, ShieldAlert,
} from "lucide-react";
import { useKidsAuth } from "@/contexts/KidsAuthContext";
import { KidsTradeJournalModal } from "@/components/KidsTradeJournalModal";

const ACCENT = "#ff7676";
const NAVY = "#1a1a2e";
const GOLD = "#ffb570";
const GREEN = "#76b876";
const SAND = "#fff8f0";
const SAND_BORDER = "#e5d5b8";

const sectionTitle = {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    opacity: 0.6,
    marginBottom: 8,
    marginTop: 0,
};

const cardStyle = {
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 4px 12px rgba(26,26,46,0.05)",
    border: `1px solid ${SAND_BORDER}`,
};

function fmtMoney(n, currency = "USD") {
    if (n == null) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (currency === "IDR") return `${sign}Rp ${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ===========================================================================
// Dashboard
// ===========================================================================
export function KidsDashboardPage() {
    const { student, kidsApi } = useKidsAuth();
    const [tradable, setTradable] = useState([]);
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [t, p] = await Promise.all([
                    kidsApi.get("/kids/tradable"),
                    kidsApi.get("/kids/portfolio"),
                ]);
                setTradable(t.data.tickers);
                setPortfolio(p.data);
            } finally {
                setLoading(false);
            }
        })();
    }, [kidsApi]);

    const totals = portfolio?.totals;
    const pnlPositive = (totals?.total_pnl || 0) >= 0;

    return (
        <div data-testid="kids-dashboard-page">
            {/* Hero greeting */}
            <div style={{ ...cardStyle, background: `linear-gradient(135deg, ${GOLD} 0%, #ffe5b4 100%)`, border: "none", marginBottom: 18 }}>
                <p style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7 }}>Welcome back</p>
                <h1 style={{ fontSize: 26, fontWeight: 700, marginTop: 4, marginBottom: 6 }}>
                    Hey, {student?.full_name?.split(" ")[0] || "there"}!
                </h1>
                <p style={{ fontSize: 14, opacity: 0.8 }}>
                    {totals?.total_value === student?.starting_stock_coins
                        ? `Ready to invest your ${student?.starting_stock_coins?.toLocaleString()} StockCoins?`
                        : `Your portfolio is worth ${(totals?.total_value || 0).toLocaleString(undefined,{maximumFractionDigits:2})} SC right now.`}
                </p>
            </div>

            {loading ? (
                <div style={{ textAlign: "center", padding: 40 }}><Loader2 className="animate-spin" /></div>
            ) : (
                <>
                    {/* Quick stats */}
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 18 }} data-testid="kids-quickstats">
                        <div style={{ ...cardStyle, padding: 14 }}>
                            <p style={sectionTitle}>Cash</p>
                            <p style={{ fontSize: 22, fontWeight: 700 }}>💰 {(student?.stock_coins_balance || 0).toLocaleString()}</p>
                            <p style={{ fontSize: 12, opacity: 0.6 }}>StockCoins available</p>
                        </div>
                        <div style={{ ...cardStyle, padding: 14 }}>
                            <p style={sectionTitle}>P&amp;L</p>
                            <p style={{ fontSize: 22, fontWeight: 700, color: pnlPositive ? GREEN : ACCENT }}>
                                {pnlPositive ? "+" : ""}
                                {(totals?.total_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                            <p style={{ fontSize: 12, opacity: 0.6 }}>{(totals?.total_pnl_pct || 0).toFixed(2)}% from start</p>
                        </div>
                    </div>

                    {/* Holdings */}
                    {portfolio?.positions?.length > 0 ? (
                        <div style={{ ...cardStyle, marginBottom: 18 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Your stocks</h3>
                            {portfolio.positions.map((p) => (
                                <Link
                                    key={p.ticker}
                                    to={`/kids/analyze/${p.ticker}`}
                                    data-testid={`kids-holding-${p.ticker}`}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "12px 0",
                                        borderTop: `1px solid ${SAND_BORDER}`,
                                        textDecoration: "none",
                                        color: NAVY,
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{p.ticker}</div>
                                        <div style={{ fontSize: 12, opacity: 0.6 }}>{p.qty} shares · avg {fmtMoney(p.avg_cost, p.currency)}</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div style={{ fontWeight: 700 }}>{fmtMoney(p.market_value, p.currency)}</div>
                                        <div style={{ fontSize: 12, color: p.pnl >= 0 ? GREEN : ACCENT }}>
                                            {p.pnl >= 0 ? "▲" : "▼"} {Math.abs(p.pnl_pct).toFixed(2)}%
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div style={{ ...cardStyle, textAlign: "center", marginBottom: 18 }}>
                            <Sparkles size={32} color={ACCENT} />
                            <p style={{ fontWeight: 700, marginTop: 8 }}>No stocks yet</p>
                            <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>Pick one to analyse and buy your first share!</p>
                            <Link to="/kids/discover" data-testid="kids-cta-discover" style={{ background: ACCENT, color: "#fff", padding: "10px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 700, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
                                Discover stocks <ArrowRight size={14} />
                            </Link>
                        </div>
                    )}

                    {/* Top tradable preview */}
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Pick a stock to analyse</h3>
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }} data-testid="kids-discover-grid">
                        {tradable.slice(0, 6).map((t) => (
                            <Link
                                key={t.ticker}
                                to={`/kids/analyze/${t.ticker}`}
                                data-testid={`kids-discover-${t.ticker}`}
                                style={{ ...cardStyle, padding: 12, textDecoration: "none", color: NAVY }}
                            >
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.ticker}</div>
                                <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>{t.name}</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtMoney(t.price, t.currency)}</div>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ===========================================================================
// Discover page — full tradable list
// ===========================================================================
export function KidsDiscoverPage() {
    const { kidsApi } = useKidsAuth();
    const [tickers, setTickers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const r = await kidsApi.get("/kids/tradable");
                setTickers(r.data.tickers);
            } finally { setLoading(false); }
        })();
    }, [kidsApi]);

    return (
        <div data-testid="kids-discover-page">
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Discover stocks</h1>
            <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 18 }}>Tap any stock to see what the AI thinks — then decide if you want to buy.</p>
            {loading ? <Loader2 className="animate-spin" /> : (
                <div style={{ display: "grid", gap: 10 }}>
                    {tickers.map((t) => (
                        <Link
                            key={t.ticker}
                            to={`/kids/analyze/${t.ticker}`}
                            data-testid={`kids-discover-card-${t.ticker}`}
                            style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: NAVY }}
                        >
                            <div style={{ width: 44, height: 44, background: SAND, borderRadius: 12, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{t.ticker.slice(0, 2)}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700 }}>{t.ticker}</div>
                                <div style={{ fontSize: 12, opacity: 0.6 }}>{t.name}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 700 }}>{fmtMoney(t.price, t.currency)}</div>
                                <div style={{ fontSize: 11, opacity: 0.5 }}>{t.currency}</div>
                            </div>
                            <ArrowRight size={16} opacity={0.5} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// ===========================================================================
// Portfolio page
// ===========================================================================
export function KidsPortfolioPage() {
    const { kidsApi } = useKidsAuth();
    const [data, setData] = useState(null);
    const [trades, setTrades] = useState([]);

    useEffect(() => {
        (async () => {
            const [p, t] = await Promise.all([
                kidsApi.get("/kids/portfolio"),
                kidsApi.get("/kids/trades?limit=20"),
            ]);
            setData(p.data);
            setTrades(t.data.trades);
        })();
    }, [kidsApi]);

    if (!data) return <Loader2 className="animate-spin" />;

    const t = data.totals;
    const pnlPositive = (t.total_pnl || 0) >= 0;

    return (
        <div data-testid="kids-portfolio-page">
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Your portfolio</h1>

            <div style={{ ...cardStyle, marginBottom: 16, background: NAVY, color: "#fff", border: "none" }}>
                <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.6 }}>Total value</p>
                <p style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>{(t.total_value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} SC</p>
                <p style={{ fontSize: 14, color: pnlPositive ? "#76e576" : "#ffb4b4", marginTop: 4 }}>
                    {pnlPositive ? "+" : ""}{(t.total_pnl || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} SC ({(t.total_pnl_pct || 0).toFixed(2)}%)
                </p>
                <div style={{ display: "flex", gap: 18, marginTop: 12, fontSize: 12, opacity: 0.8 }}>
                    <span>Cash · 💰 {(t.cash || 0).toLocaleString()}</span>
                    <span>Invested · {(t.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 20, marginBottom: 10 }}>Holdings</h3>
            {data.positions.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: "center" }}>
                    <p style={{ fontSize: 13, opacity: 0.7 }}>You don't have any stocks yet.</p>
                    <Link to="/kids/discover" style={{ color: ACCENT, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Discover stocks →</Link>
                </div>
            ) : (
                data.positions.map((p) => (
                    <Link
                        key={p.ticker}
                        to={`/kids/analyze/${p.ticker}`}
                        data-testid={`kids-position-${p.ticker}`}
                        style={{ ...cardStyle, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: NAVY }}
                    >
                        <div>
                            <div style={{ fontWeight: 700 }}>{p.ticker}</div>
                            <div style={{ fontSize: 12, opacity: 0.6 }}>{p.qty} sh · avg {fmtMoney(p.avg_cost, p.currency)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700 }}>{fmtMoney(p.market_value, p.currency)}</div>
                            <div style={{ fontSize: 12, color: p.pnl >= 0 ? GREEN : ACCENT }}>
                                {p.pnl >= 0 ? "▲" : "▼"} {fmtMoney(Math.abs(p.pnl), p.currency)} ({Math.abs(p.pnl_pct).toFixed(2)}%)
                            </div>
                        </div>
                    </Link>
                ))
            )}

            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 24, marginBottom: 10 }}>Recent trades</h3>
            {trades.length === 0 ? (
                <p style={{ fontSize: 13, opacity: 0.6 }}>No trades yet.</p>
            ) : (
                <div style={cardStyle} data-testid="kids-trades-list">
                    {trades.map((tr) => (
                        <div key={tr.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `1px solid ${SAND_BORDER}`, fontSize: 13 }}>
                            <div>
                                <span style={{ fontWeight: 700, color: tr.side === "BUY" ? GREEN : ACCENT, marginRight: 6 }}>{tr.side}</span>
                                {tr.qty} {tr.ticker} @ {fmtMoney(tr.price, tr.currency)}
                            </div>
                            <span style={{ opacity: 0.6, fontSize: 11 }}>{(tr.created_at || "").slice(0, 10)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ===========================================================================
// Watchlist page
// ===========================================================================
export function KidsWatchlistPage() {
    const { kidsApi } = useKidsAuth();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        const r = await kidsApi.get("/kids/watchlist");
        setList(r.data.watchlist);
        setLoading(false);
    };
    useEffect(() => { refresh(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

    const remove = async (ticker) => {
        await kidsApi.delete(`/kids/watchlist/${ticker}`);
        refresh();
    };

    return (
        <div data-testid="kids-watchlist-page">
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Your watchlist</h1>
            <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 18 }}>Track stocks you're curious about — without buying them yet.</p>

            {loading ? <Loader2 className="animate-spin" /> : list.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: "center" }}>
                    <Star size={32} color={ACCENT} />
                    <p style={{ fontWeight: 700, marginTop: 8 }}>Nothing watched yet</p>
                    <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>Add stocks from any analysis page.</p>
                    <Link to="/kids/discover" style={{ color: ACCENT, fontWeight: 700, textDecoration: "none" }}>Discover stocks →</Link>
                </div>
            ) : (
                <div style={{ display: "grid", gap: 10 }}>
                    {list.map((w) => (
                        <div key={w.ticker} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}>
                            <Link to={`/kids/analyze/${w.ticker}`} style={{ flex: 1, textDecoration: "none", color: NAVY }} data-testid={`kids-watchlist-row-${w.ticker}`}>
                                <div style={{ fontWeight: 700 }}>{w.ticker}</div>
                                <div style={{ fontSize: 12, opacity: 0.6 }}>{w.name || ""}</div>
                            </Link>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMoney(w.price, w.currency)}</div>
                            <button
                                onClick={() => remove(w.ticker)}
                                data-testid={`kids-watchlist-remove-${w.ticker}`}
                                aria-label={`Remove ${w.ticker} from watchlist`}
                                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6 }}
                            >
                                <StarOff size={18} color={ACCENT} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ===========================================================================
// AnalyzeWithBuy page — kid view + buy/sell + add-to-watchlist
// ===========================================================================
export function KidsAnalyzePage() {
    const { ticker } = useParams();
    const { student, kidsApi, refresh: refreshAuth } = useKidsAuth();
    const navigate = useNavigate();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [quotaExceeded, setQuotaExceeded] = useState(false);
    const [held, setHeld] = useState(0);
    const [watching, setWatching] = useState(false);
    const [tradeBusy, setTradeBusy] = useState(false);
    const [tradeError, setTradeError] = useState("");
    const [tradeOk, setTradeOk] = useState("");
    const [qty, setQty] = useState(1);
    // Last successful trade — drives the post-trade journal modal.
    const [lastTrade, setLastTrade] = useState(null);

    const sym = (ticker || "").toUpperCase();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true); setError(""); setQuotaExceeded(false); setData(null); setTradeError(""); setTradeOk("");
            try {
                // Run analyze + portfolio + watchlist concurrently — held qty
                // and watch state come from the latter two so we render the
                // correct buttons immediately.
                const [a, p, w] = await Promise.all([
                    kidsApi.get(`/kids/analyze/${sym}`),
                    kidsApi.get("/kids/portfolio"),
                    kidsApi.get("/kids/watchlist"),
                ]);
                if (cancelled) return;
                setData(a.data);
                const pos = (p.data.positions || []).find((x) => x.ticker === sym);
                setHeld(pos?.qty || 0);
                setWatching(!!(w.data.watchlist || []).find((x) => x.ticker === sym));
            } catch (err) {
                if (!cancelled) {
                    if (err?.response?.status === 402) {
                        setQuotaExceeded(true);
                        setError(err?.response?.data?.detail || "You've used today's free stock explanations.");
                    } else {
                        setError(err?.response?.data?.detail || "Couldn't load this one — try another stock.");
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [sym, kidsApi]);

    const cur = data?.current_price;
    const cost = useMemo(() => (cur ? cur * Math.max(1, qty || 0) : 0), [cur, qty]);
    const canAfford = cost <= (student?.stock_coins_balance || 0);

    const trade = async (side) => {
        setTradeBusy(true); setTradeError(""); setTradeOk("");
        try {
            const r = await kidsApi.post("/kids/trades", { ticker: sym, side, qty: parseInt(qty, 10) });
            setTradeOk(`${side === "BUY" ? "Bought" : "Sold"} ${r.data.qty} ${sym}!`);
            setLastTrade(r.data); // surfaces the journal modal
            await refreshAuth();
            // Refresh held qty
            const p = await kidsApi.get("/kids/portfolio");
            const pos = (p.data.positions || []).find((x) => x.ticker === sym);
            setHeld(pos?.qty || 0);
        } catch (err) {
            setTradeError(err?.response?.data?.detail || "Couldn't place that trade.");
        } finally {
            setTradeBusy(false);
        }
    };

    const toggleWatch = async () => {
        if (watching) {
            await kidsApi.delete(`/kids/watchlist/${sym}`);
            setWatching(false);
        } else {
            await kidsApi.post(`/kids/watchlist/${sym}`);
            setWatching(true);
        }
    };

    const headerGradient = useMemo(() => {
        const palettes = {
            AAPL: "linear-gradient(135deg, #FFE5B4 0%, #FFB570 100%)",
            MSFT: "linear-gradient(135deg, #B4E5FF 0%, #70B5FF 100%)",
            NVDA: "linear-gradient(135deg, #C8FFB4 0%, #76E576 100%)",
            TSLA: "linear-gradient(135deg, #FFB4C8 0%, #FF7676 100%)",
            "BBCA.JK": "linear-gradient(135deg, #B4D4FF 0%, #7676FF 100%)",
        };
        return palettes[sym] || "linear-gradient(135deg, #FFE5B4 0%, #FFB570 100%)";
    }, [sym]);

    if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Loader2 className="animate-spin" /></div>;
    if (quotaExceeded) return (
        <div style={{ ...cardStyle, textAlign: "center", background: "linear-gradient(135deg, rgba(255,181,112,0.12), rgba(255,118,118,0.08))" }} data-testid="kids-analyze-quota-banner">
            <Sparkles size={32} color={GOLD} />
            <p style={{ marginTop: 12, fontWeight: 700, color: NAVY }}>You've hit today's limit!</p>
            <p style={{ marginTop: 8, opacity: 0.75 }}>{error}</p>
            <p style={{ marginTop: 4, fontSize: 13, opacity: 0.65 }}>Ask your parent to check the Parent Dashboard to unlock more.</p>
            <Link to="/kids/discover" style={{ color: ACCENT, fontWeight: 700, marginTop: 12, display: "inline-block", textDecoration: "none" }}>← Back to Discover</Link>
        </div>
    );
    if (error) return (
        <div style={{ ...cardStyle, textAlign: "center" }} data-testid="kids-analyze-error">
            <ShieldAlert size={32} color={ACCENT} />
            <p style={{ marginTop: 12, fontWeight: 700, color: ACCENT }}>Hmm…</p>
            <p style={{ marginTop: 8, opacity: 0.7 }}>{error}</p>
            <Link to="/kids/discover" style={{ color: ACCENT, fontWeight: 700, marginTop: 12, display: "inline-block", textDecoration: "none" }}>← Back to Discover</Link>
        </div>
    );

    const kv = data.kid_view;

    return (
        <div data-testid="kids-analyze-page">
            <button onClick={() => navigate(-1)} style={{ background: "transparent", border: "none", color: NAVY, opacity: 0.7, fontSize: 13, cursor: "pointer", marginBottom: 12, padding: 0 }}>
                ← Back
            </button>

            {/* Header band */}
            <div style={{ ...cardStyle, padding: "28px 20px", textAlign: "center", background: headerGradient, border: "none" }}>
                <div style={{ fontSize: 56, lineHeight: 1 }} data-testid="kids-analyze-emoji">{kv.emoji_mood || "🤔"}</div>
                <p style={{ marginTop: 10, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.7 }}>{data.name} · {sym}</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }} data-testid="kids-analyze-headline">{kv.kid_headline}</h1>
                <p style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>{fmtMoney(cur, data.currency)}</p>
            </div>

            {/* Buy / sell card — sticky at the top of the analysis content */}
            <div style={{ ...cardStyle, marginTop: 14 }} data-testid="kids-trade-card">
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Want to trade?</h3>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <label style={{ fontSize: 13 }}>Shares</label>
                    <input
                        type="number"
                        value={qty}
                        min={1}
                        max={10000}
                        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || 1, 10)))}
                        data-testid="kids-trade-qty"
                        style={{ flex: 1, padding: 10, border: `1.5px solid ${SAND_BORDER}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: SAND }}
                    />
                    <span style={{ fontSize: 13, color: NAVY, opacity: 0.7 }}>≈ {fmtMoney(cost, data.currency)}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        onClick={() => trade("BUY")}
                        disabled={tradeBusy || !canAfford}
                        data-testid="kids-buy-button"
                        style={{ flex: 1, padding: 12, background: GREEN, color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: tradeBusy || !canAfford ? "not-allowed" : "pointer", opacity: tradeBusy || !canAfford ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                        <ShoppingCart size={14} /> Buy
                    </button>
                    <button
                        onClick={() => trade("SELL")}
                        disabled={tradeBusy || qty > held}
                        data-testid="kids-sell-button"
                        style={{ flex: 1, padding: 12, background: held > 0 ? "#fff" : SAND, color: held > 0 ? ACCENT : "#9a9a9a", border: `1.5px solid ${held > 0 ? ACCENT : SAND_BORDER}`, borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: tradeBusy || qty > held ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                    >
                        <TrendingUp size={14} /> Sell {held > 0 ? `(${held})` : ""}
                    </button>
                    <button
                        onClick={toggleWatch}
                        data-testid="kids-watch-toggle"
                        aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
                        style={{ padding: 12, background: watching ? GOLD : "#fff", border: `1.5px solid ${SAND_BORDER}`, borderRadius: 12, cursor: "pointer", display: "grid", placeItems: "center" }}
                    >
                        {watching ? <Star size={16} color={NAVY} /> : <StarOff size={16} color={NAVY} opacity={0.6} />}
                    </button>
                </div>
                {!canAfford && (
                    <p data-testid="kids-trade-cant-afford" style={{ fontSize: 11, color: ACCENT, marginTop: 8 }}>
                        You only have {(student?.stock_coins_balance || 0).toLocaleString()} SC — try fewer shares.
                    </p>
                )}
                {tradeError && <p data-testid="kids-trade-error" style={{ fontSize: 12, color: ACCENT, marginTop: 8 }}>{tradeError}</p>}
                {tradeOk && <p data-testid="kids-trade-ok" style={{ fontSize: 12, color: GREEN, marginTop: 8, fontWeight: 700 }}>✨ {tradeOk}</p>}
            </div>

            {/* Explanation */}
            <div style={{ ...cardStyle, marginTop: 14 }}>
                <p data-testid="kids-analyze-explanation" style={{ fontSize: 16, lineHeight: 1.7 }}>{kv.kid_explanation}</p>
            </div>

            {/* Confidence pill */}
            {kv.confidence_plain_english && (
                <div style={{ ...cardStyle, marginTop: 10, background: SAND, display: "flex", gap: 10, alignItems: "flex-start" }} data-testid="kids-analyze-confidence">
                    <Brain size={18} color="#7a5a00" style={{ marginTop: 2, flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: "#7a5a00", lineHeight: 1.55, margin: 0 }}>
                        <strong>How sure is the AI?</strong> {kv.confidence_plain_english}
                    </p>
                </div>
            )}

            {/* Did you know? */}
            {kv.did_you_know?.length > 0 && (
                <div style={{ marginTop: 14 }} data-testid="kids-analyze-dyk">
                    <p style={sectionTitle}><Lightbulb size={14} style={{ display: "inline", marginRight: 4 }} /> Did you know?</p>
                    {kv.did_you_know.map((c, i) => (
                        <div key={`dyk-${i}`} style={{ ...cardStyle, padding: "12px 14px", borderLeft: `3px solid ${ACCENT}`, marginBottom: 8 }}>
                            <p style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</p>
                            <p style={{ fontSize: 13, lineHeight: 1.55, marginTop: 4 }}>{c.body}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Reflection */}
            {kv.reflection_question && (
                <div style={{ ...cardStyle, marginTop: 14, background: NAVY, color: "#fff", border: "none", display: "flex", gap: 12, alignItems: "flex-start" }} data-testid="kids-analyze-reflection">
                    <MessageCircle size={20} color={GOLD} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Think about this</p>
                        <p style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{kv.reflection_question}</p>
                    </div>
                </div>
            )}

            {/* Change-my-mind */}
            {kv.what_would_change_my_mind && (
                <p style={{ marginTop: 12, fontSize: 13, opacity: 0.75, fontStyle: "italic", lineHeight: 1.55 }} data-testid="kids-analyze-change-mind">
                    🚨 {kv.what_would_change_my_mind}
                </p>
            )}

            <p style={{ marginTop: 24, fontSize: 11, opacity: 0.5, lineHeight: 1.6, textAlign: "center" }}>
                Educational only · Not financial advice · Real investing involves the risk of losing money.
            </p>

            {lastTrade && (
                <KidsTradeJournalModal
                    trade={lastTrade}
                    kidsApi={kidsApi}
                    onClose={() => setLastTrade(null)}
                    onBonusEarned={() => { refreshAuth(); }}
                />
            )}
        </div>
    );
}
