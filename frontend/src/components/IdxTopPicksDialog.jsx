/**
 * IdxTopPicksDialog — Dashboard quick-action that shows the top 10 IDX
 * movers ranked by our multi-factor score. Pro/Elite only (backend enforces).
 *
 * Tapping a row navigates to /analysis/{ticker} so the user can run a full
 * AI analysis on a pick. Data is cached server-side for 30 min so opening
 * this dialog costs at most 1 RapidAPI request per 30-min window.
 */
import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import api from "@/lib/api";
import { Flame, Loader2, Lock, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";

function fmtIdr(n) {
    if (n == null) return "—";
    return "Rp " + Number(n).toLocaleString("id-ID");
}

export default function IdxTopPicksDialog({ canUse = true }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [picks, setPicks] = useState([]);
    const [error, setError] = useState(null);
    const [methodology, setMethodology] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get("/idx/top-picks?limit=10");
            setPicks(res.data?.picks || []);
            setMethodology(res.data?.methodology || "");
        } catch (e) {
            setError(e?.response?.data?.detail || "Unable to load IDX top picks");
            setPicks([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleOpenChange = (next) => {
        setOpen(next);
        if (next && picks.length === 0) load();
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <button
                    className="btn-quick flex items-center justify-between"
                    disabled={!canUse}
                    title={!canUse ? "Pro/Elite feature" : "Top 10 IDX movers ranked by multi-factor score"}
                    data-testid="idx-top-picks-button"
                >
                    <span>{!canUse ? "IDX Picks · Pro" : "IDX Top Picks"}</span>
                    {!canUse ? <Lock size={14} strokeWidth={1.5} /> : <Flame size={14} strokeWidth={1.5} />}
                </button>
            </DialogTrigger>
            <DialogContent
                className="max-w-2xl max-h-[90vh] overflow-y-auto"
                data-testid="idx-top-picks-dialog"
            >
                <DialogHeader>
                    <DialogTitle className="font-serif text-2xl">Top 10 IDX Picks</DialogTitle>
                    <DialogDescription className="text-[12px]">
                        Live trending Indonesian equities, ranked by a multi-factor score.
                        {methodology ? (
                            <span className="block mt-1 font-mono text-[10.5px]" style={{ color: "hsl(var(--text-muted))" }}>
                                {methodology}
                            </span>
                        ) : null}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-10 text-center" style={{ color: "hsl(var(--text-muted))" }}>
                        <Loader2 className="inline-block mr-2 animate-spin" size={16} /> Loading…
                    </div>
                ) : error ? (
                    <div
                        className="p-4 text-sm"
                        style={{
                            background: "hsla(0,55%,55%,0.06)",
                            border: "1px solid hsl(var(--sell))",
                            color: "hsl(var(--sell))",
                        }}
                        data-testid="idx-top-picks-error"
                    >
                        {error}
                    </div>
                ) : picks.length === 0 ? (
                    <div className="py-10 text-center" style={{ color: "hsl(var(--text-muted))" }}>
                        No picks available right now.
                    </div>
                ) : (
                    <div style={{ border: "1px solid hsl(var(--border-default))" }}>
                        {picks.map((p, i) => {
                            const positive = p.change_pct >= 0;
                            return (
                                <Link
                                    key={p.symbol}
                                    to={`/analysis/${encodeURIComponent(p.symbol)}?autorun=1`}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-4 p-3 hover:bg-[hsl(var(--bg))]"
                                    style={{ borderBottom: i < picks.length - 1 ? "1px solid hsl(var(--border-divider))" : undefined }}
                                    data-testid={`idx-pick-row-${p.symbol}`}
                                >
                                    <span
                                        className="w-6 text-right font-mono text-[11px]"
                                        style={{ color: "hsl(var(--text-muted))" }}
                                    >
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-serif" style={{ color: "hsl(var(--text-primary))" }}>
                                            {p.symbol.replace(".JK", "")}
                                            <span className="ml-2 text-[11px] font-sans" style={{ color: "hsl(var(--text-muted))" }}>
                                                {p.name}
                                            </span>
                                        </p>
                                        <p className="text-[10.5px] font-mono mt-0.5" style={{ color: "hsl(var(--text-muted))" }}>
                                            Score {p.score.toFixed(3)} {p.tradeable ? "" : "· ⚠ not tradeable"}
                                        </p>
                                    </div>
                                    <div className="text-right font-mono text-xs shrink-0">
                                        <p style={{ color: "hsl(var(--text-primary))" }}>{fmtIdr(p.price)}</p>
                                        <p
                                            className="flex items-center gap-1 justify-end"
                                            style={{ color: positive ? "hsl(var(--buy))" : "hsl(var(--sell))" }}
                                        >
                                            {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                            {positive ? "+" : ""}{p.change_pct.toFixed(2)}%
                                        </p>
                                    </div>
                                    <ExternalLink size={12} strokeWidth={1.5} style={{ color: "hsl(var(--text-muted))" }} />
                                </Link>
                            );
                        })}
                    </div>
                )}

                <p
                    className="mt-4 font-mono text-[10.5px]"
                    style={{ color: "hsl(var(--text-muted))" }}
                >
                    Not investment advice. Tap any pick to run a full AI analysis.
                </p>
            </DialogContent>
        </Dialog>
    );
}
