import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Search, X, Loader2 } from "lucide-react";

const CATEGORIES = [
    { v: "tech", label: "Technology" },
    { v: "finance", label: "Finance" },
    { v: "healthcare", label: "Healthcare" },
    { v: "commodities", label: "Commodities" },
    { v: "consumer", label: "Consumer" },
    { v: "other", label: "Other" },
];

export default function AddStockModal({ open, onClose, onAdded }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [category, setCategory] = useState("tech");
    const [adding, setAdding] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults([]);
            setError("");
            return;
        }
        // Load popular list
        api.get("/stocks/search", { params: { q: "" } }).then((r) => setResults(r.data || []));
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(async () => {
            try {
                const r = await api.get("/stocks/search", { params: { q: query } });
                setResults(r.data || []);
            } catch (err) {
                console.warn("stock search failed:", err?.message || err);
            }
        }, 180);
        return () => clearTimeout(t);
    }, [query, open]);

    const addTicker = async (ticker) => {
        setError("");
        setAdding(ticker);
        try {
            await api.post("/watchlist", { ticker, category });
            onAdded?.(ticker);
            onClose?.();
        } catch (err) {
            setError(err?.response?.data?.detail || "Failed to add ticker");
        } finally {
            setAdding(null);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
            onClick={onClose}
            data-testid="add-stock-modal"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="module-elevated w-full max-w-xl mt-16 md:mt-0"
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

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-overline mr-1">Category</span>
                        {CATEGORIES.map((c) => (
                            <button
                                key={c.v}
                                onClick={() => setCategory(c.v)}
                                className="text-xs px-2 py-1 font-mono uppercase transition-colors"
                                style={{
                                    borderRadius: 2,
                                    letterSpacing: "0.1em",
                                    border: "1px solid " + (category === c.v ? "hsl(var(--text-primary))" : "hsl(var(--border-default))"),
                                    background: category === c.v ? "hsl(var(--text-primary))" : "transparent",
                                    color: category === c.v ? "hsl(var(--background))" : "hsl(var(--text-secondary))",
                                }}
                                data-testid={`category-${c.v}-option`}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div className="signal-sell px-3 py-2 text-sm font-mono" data-testid="add-stock-error">
                            {error}
                        </div>
                    )}

                    <div className="max-h-80 overflow-y-auto" style={{ borderTop: "1px solid hsl(var(--border-divider))" }}>
                        {results.length === 0 && (
                            <p className="text-sm text-[hsl(var(--text-muted))] py-6 text-center">No results</p>
                        )}
                        {results.map((s) => (
                            <button
                                key={s.ticker}
                                onClick={() => addTicker(s.ticker)}
                                disabled={!!adding}
                                className="w-full flex items-center justify-between py-3 px-2 text-left hover:bg-[hsl(var(--surface-elevated))] transition-colors"
                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                data-testid={`search-result-${s.ticker}`}
                            >
                                <div>
                                    <div className="font-mono text-sm font-medium">{s.ticker}</div>
                                    <div className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">{s.name}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-overline">{s.exchange || "—"}</span>
                                    {adding === s.ticker ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <span className="text-overline" style={{ color: "hsl(var(--text-primary))" }}>
                                            Add →
                                        </span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
