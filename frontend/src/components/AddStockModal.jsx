import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Search, X, Loader2, ChevronDown, ShieldCheck, Zap } from "lucide-react";

const CATEGORIES = [
    { v: "", label: "All" },
    { v: "tech", label: "Technology" },
    { v: "finance", label: "Finance" },
    { v: "healthcare", label: "Healthcare" },
    { v: "commodities", label: "Commodities" },
    { v: "consumer", label: "Consumer" },
    { v: "other", label: "Other" },
];

const PRIMARY_EXCHANGES = ["NASDAQ", "NYSE", "NYSEARCA"];

export default function AddStockModal({ open, onClose, onAdded }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [category, setCategory] = useState(""); // "" = all categories
    const [exchange, setExchange] = useState(""); // "" = all exchanges
    const [saveCategory, setSaveCategory] = useState("tech"); // category stored on watchlist item
    const [adding, setAdding] = useState(null);
    const [error, setError] = useState("");
    const [exchanges, setExchanges] = useState([]);
    const [exchangesPanelOpen, setExchangesPanelOpen] = useState(false);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults([]);
            setError("");
            setCategory("");
            setExchange("");
            setExchangesPanelOpen(false);
            return;
        }
        (async () => {
            try {
                const [ex] = await Promise.all([api.get("/stocks/exchanges")]);
                setExchanges(ex.data || []);
            } catch (err) {
                console.warn("load exchanges failed:", err?.message || err);
            }
        })();
    }, [open]);

    // Fetch results when filters / query change
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(async () => {
            try {
                const r = await api.get("/stocks/search", {
                    params: { q: query, category, exchange, limit: 10 },
                });
                setResults(r.data || []);
            } catch (err) {
                console.warn("stock search failed:", err?.message || err);
            }
        }, 180);
        return () => clearTimeout(t);
    }, [query, category, exchange, open]);

    const addTicker = async (ticker, suggestedCategory) => {
        setError("");
        setAdding(ticker);
        try {
            await api.post("/watchlist", { ticker, category: suggestedCategory || saveCategory || "other" });
            onAdded?.(ticker);
            onClose?.();
        } catch (err) {
            setError(err?.response?.data?.detail || "Failed to add ticker");
        } finally {
            setAdding(null);
        }
    };

    const verifyIdx = async (ticker) => {
        setError("");
        setAdding(`verify:${ticker}`);
        try {
            const res = await api.get(`/stocks/verify-idx/${encodeURIComponent(ticker)}`);
            // Replace the unverified row with the verified info in the results list
            setResults((prev) => prev.map((r) => r.ticker === ticker ? {
                ...r,
                name: res.data.name || r.name,
                source: "verified",
                exchange: "IDX",
            } : r));
        } catch (err) {
            setError(err?.response?.data?.detail || `Could not verify ${ticker} on IDX`);
        } finally {
            setAdding(null);
        }
    };

    if (!open) return null;

    const visibleExchanges = exchangesPanelOpen ? exchanges : exchanges.filter((e) => PRIMARY_EXCHANGES.includes(e.exchange));

    return (
        <div
            className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
            data-testid="add-stock-modal"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="module-elevated w-full max-w-2xl mt-16 md:mt-0"
                style={{ background: "hsl(var(--surface))" }}
            >
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}>
                    <div>
                        <p className="text-overline">Add to watchlist</p>
                        <h3 className="font-serif text-2xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                            Find a ticker
                        </h3>
                    </div>
                    <button onClick={onClose} className="btn-ghost !p-2" data-testid="close-modal-button" aria-label="Close">
                        <X size={16} strokeWidth={1.5} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="relative">
                        <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--text-muted))" }} />
                        <input
                            autoFocus
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search e.g. AAPL, Tesla, D05.SI"
                            className="input-base pl-9 font-mono"
                            data-testid="stock-search-input"
                        />
                    </div>

                    {/* Category filter */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-overline mr-1">Category</span>
                        {CATEGORIES.map((c) => {
                            const active = category === c.v;
                            return (
                                <button
                                    key={c.v || "all"}
                                    onClick={() => setCategory(c.v)}
                                    className="text-xs px-2 py-1 font-mono uppercase transition-colors"
                                    style={{
                                        borderRadius: 2,
                                        letterSpacing: "0.1em",
                                        border: "1px solid " + (active ? "hsl(var(--text-primary))" : "hsl(var(--border-default))"),
                                        background: active ? "hsl(var(--text-primary))" : "transparent",
                                        color: active ? "hsl(var(--background))" : "hsl(var(--text-secondary))",
                                    }}
                                    data-testid={`category-${c.v || "all"}-option`}
                                >
                                    {c.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Exchange filter */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-overline mr-1">Exchange</span>
                        <button
                            onClick={() => setExchange("")}
                            className="text-xs px-2 py-1 font-mono uppercase transition-colors"
                            style={{
                                borderRadius: 2,
                                letterSpacing: "0.1em",
                                border: "1px solid " + (exchange === "" ? "hsl(var(--text-primary))" : "hsl(var(--border-default))"),
                                background: exchange === "" ? "hsl(var(--text-primary))" : "transparent",
                                color: exchange === "" ? "hsl(var(--background))" : "hsl(var(--text-secondary))",
                            }}
                            data-testid="exchange-all-option"
                        >
                            All
                        </button>
                        {visibleExchanges.map((ex) => {
                            const active = exchange === ex.exchange;
                            return (
                                <button
                                    key={ex.exchange}
                                    onClick={() => setExchange(ex.exchange)}
                                    className="text-xs px-2 py-1 font-mono uppercase transition-colors inline-flex items-center gap-1.5"
                                    style={{
                                        borderRadius: 2,
                                        letterSpacing: "0.1em",
                                        border: "1px solid " + (active ? "hsl(var(--text-primary))" : "hsl(var(--border-default))"),
                                        background: active ? "hsl(var(--text-primary))" : "transparent",
                                        color: active ? "hsl(var(--background))" : "hsl(var(--text-secondary))",
                                    }}
                                    data-testid={`exchange-${ex.exchange}-option`}
                                >
                                    {ex.exchange}
                                    <span
                                        className="font-mono"
                                        style={{
                                            fontSize: "0.54rem",
                                            opacity: 0.7,
                                        }}
                                    >
                                        {ex.ticker_count}
                                    </span>
                                </button>
                            );
                        })}
                        {exchanges.length > PRIMARY_EXCHANGES.length && (
                            <button
                                onClick={() => setExchangesPanelOpen((v) => !v)}
                                className="text-xs px-2 py-1 font-mono uppercase transition-colors inline-flex items-center gap-1"
                                style={{
                                    borderRadius: 2,
                                    letterSpacing: "0.1em",
                                    border: "1px dashed hsl(var(--border-default))",
                                    color: "hsl(var(--hold))",
                                    background: "transparent",
                                }}
                                data-testid="toggle-all-exchanges-button"
                            >
                                {exchangesPanelOpen ? "Hide" : `+ ${exchanges.length - PRIMARY_EXCHANGES.length} more`}
                                <ChevronDown
                                    size={10}
                                    strokeWidth={1.5}
                                    style={{
                                        transform: exchangesPanelOpen ? "rotate(180deg)" : "rotate(0)",
                                        transition: "transform 200ms",
                                    }}
                                />
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="signal-sell px-3 py-2 text-sm font-mono" data-testid="add-stock-error">
                            {error}
                        </div>
                    )}

                    {/* Results header caption */}
                    <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}>
                        {query
                            ? `Matching "${query}"`
                            : category && exchange
                            ? `Top ${Math.min(results.length, 10)} ${category} on ${exchange}`
                            : category
                            ? `Top ${Math.min(results.length, 10)} most-traded · ${CATEGORIES.find((c) => c.v === category)?.label}`
                            : exchange
                            ? `Top ${Math.min(results.length, 10)} most-traded on ${exchange}`
                            : `Top ${Math.min(results.length, 10)} most-traded globally`}
                    </p>

                    <div className="max-h-80 overflow-y-auto" style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                        {results.length === 0 && (
                            <p className="text-sm text-[hsl(var(--text-muted))] py-6 text-center">No results</p>
                        )}
                        {results.map((s) => {
                            const isUnverified = s.source === "unverified";
                            const isLive = s.source === "rapidapi" || s.source === "verified";
                            return (
                                <div
                                    key={s.ticker}
                                    className="w-full flex items-center justify-between py-3 px-2"
                                    style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                    data-testid={`search-result-${s.ticker}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-sm font-medium flex items-center gap-2 flex-wrap">
                                            {s.ticker}
                                            {isLive && (
                                                <span
                                                    className="font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
                                                    style={{
                                                        color: "hsl(var(--buy))",
                                                        border: "1px solid hsl(var(--buy))",
                                                        fontSize: "0.5rem",
                                                        letterSpacing: "0.12em",
                                                        borderRadius: 2,
                                                    }}
                                                    title="Live from RapidAPI IDX"
                                                    data-testid={`idx-live-chip-${s.ticker}`}
                                                >
                                                    <Zap size={8} strokeWidth={2.5} /> IDX LIVE
                                                </span>
                                            )}
                                            {isUnverified && (
                                                <span
                                                    className="font-mono inline-flex items-center gap-1 px-1.5 py-0.5"
                                                    style={{
                                                        color: "hsl(var(--hold))",
                                                        border: "1px solid hsl(var(--hold))",
                                                        fontSize: "0.5rem",
                                                        letterSpacing: "0.12em",
                                                        borderRadius: 2,
                                                    }}
                                                    title="Not in catalog — verify before adding"
                                                    data-testid={`unverified-chip-${s.ticker}`}
                                                >
                                                    UNVERIFIED
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-[hsl(var(--text-secondary))] mt-0.5 truncate">{s.name}</div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-3">
                                        {s.category && s.category !== "other" && (
                                            <span
                                                className="text-overline"
                                                style={{
                                                    fontSize: "0.52rem",
                                                    color: "hsl(var(--text-muted))",
                                                }}
                                            >
                                                {s.category}
                                            </span>
                                        )}
                                        <span className="text-overline">{s.exchange || "—"}</span>
                                        {isUnverified && s.ticker.endsWith(".JK") && (
                                            <button
                                                type="button"
                                                onClick={() => verifyIdx(s.ticker)}
                                                disabled={!!adding}
                                                className="btn-ghost !py-1.5 !px-2 !text-xs inline-flex items-center gap-1 min-h-[32px]"
                                                data-testid={`verify-idx-${s.ticker}`}
                                                title="Make 1 RapidAPI call to confirm this IDX ticker exists"
                                            >
                                                {adding === `verify:${s.ticker}` ? (
                                                    <Loader2 size={11} className="animate-spin" />
                                                ) : (
                                                    <ShieldCheck size={11} strokeWidth={2} />
                                                )}
                                                Verify
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => addTicker(s.ticker, s.category)}
                                            disabled={!!adding}
                                            className="text-overline hover:opacity-70 transition-opacity"
                                            style={{ color: "hsl(var(--text-primary))" }}
                                            data-testid={`add-ticker-${s.ticker}`}
                                        >
                                            {adding === s.ticker ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <>Add →</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
