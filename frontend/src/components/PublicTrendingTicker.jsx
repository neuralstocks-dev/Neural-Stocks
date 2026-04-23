/**
 * PublicTrendingTicker — compact anonymous-safe variant of the Trending
 * on Neulab widget. Single-line horizontal strip designed for the login,
 * signup, and shared-verdict pages. Conveys "this product has momentum"
 * in ~40 words of copy without dominating the conversion form.
 *
 * Relies on the PUBLIC /api/trending/neulab endpoint — no auth needed.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, ArrowRight } from "lucide-react";

export default function PublicTrendingTicker({
    idxOnly = false,
    windowDays = 7,
    limit = 8,
    variant = "default",  // "default" | "muted" — muted is lower-contrast for dark hero backgrounds
    ctaHref = "/signup",
    ctaLabel = "Run yours →",
}) {
    const [items, setItems] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Use the backend URL directly — we're rendering on public
                // pages where the authed `api` axios instance might not be
                // initialised yet (user isn't logged in).
                const base = process.env.REACT_APP_BACKEND_URL || "";
                const url = `${base}/api/trending/neulab?window_days=${windowDays}&limit=${limit}${idxOnly ? "&idx_only=true" : ""}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!cancelled) {
                    setItems(data.items || []);
                    const totalUsers = (data.items || []).reduce((s, it) => s + (it.unique_users || 0), 0);
                    const totalAnalyses = (data.items || []).reduce((s, it) => s + (it.total_analyses || 0), 0);
                    setStats({ users: totalUsers, analyses: totalAnalyses });
                }
            } catch {
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [idxOnly, windowDays, limit]);

    if (loading || items.length === 0) return null;

    const isMuted = variant === "muted";
    const topThree = items.slice(0, 3);
    const topPick = items[0];

    return (
        <div
            className="flex items-center gap-3 flex-wrap py-2 px-3"
            style={{
                background: isMuted
                    ? "rgba(0,0,0,0.45)"
                    : "hsl(var(--surface-elevated))",
                border: `1px solid ${isMuted ? "rgba(255,255,255,0.12)" : "hsl(var(--border-divider))"}`,
                borderRadius: 2,
                backdropFilter: isMuted ? "blur(12px)" : undefined,
            }}
            data-testid="public-trending-ticker"
        >
            <span
                className="flex items-center gap-1.5 flex-shrink-0 font-mono"
                style={{
                    color: isMuted ? "rgba(255,200,120,1)" : "hsl(var(--accent-primary))",
                    fontSize: "0.6rem",
                    letterSpacing: "0.12em",
                }}
            >
                <Flame size={11} strokeWidth={1.8} />
                LIVE · {stats?.users} investors · {stats?.analyses} analyses · last {windowDays}d
            </span>

            <span
                className="hidden sm:inline-block h-3"
                style={{
                    width: 1,
                    background: isMuted ? "rgba(255,255,255,0.2)" : "hsl(var(--border-divider))",
                }}
            />

            <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
                {topThree.map((it) => (
                    <Chip key={it.ticker} row={it} muted={isMuted} />
                ))}
                {items.length > 3 && (
                    <span
                        className="text-[11px] font-mono"
                        style={{ color: isMuted ? "rgba(255,255,255,0.5)" : "hsl(var(--text-muted))" }}
                    >
                        +{items.length - 3} more
                    </span>
                )}
            </div>

            {ctaHref && topPick && (
                <Link
                    to={ctaHref}
                    className="text-overline flex-shrink-0 inline-flex items-center gap-1 group"
                    style={{
                        color: isMuted ? "rgba(255,230,180,0.95)" : "hsl(var(--accent-primary))",
                        fontSize: "0.56rem",
                    }}
                    data-testid="public-trending-cta"
                >
                    {ctaLabel}
                    <ArrowRight size={10} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
            )}
        </div>
    );
}

function Chip({ row, muted }) {
    const rec = row.latest_recommendation || "—";
    const recColor = {
        BUY: "hsl(var(--buy))",
        SELL: "hsl(var(--sell))",
        HOLD: "hsl(var(--hold))",
    }[rec] || (muted ? "rgba(255,255,255,0.5)" : "hsl(var(--text-muted))");

    return (
        <span
            className="font-mono inline-flex items-center gap-1.5 px-2 py-0.5 whitespace-nowrap"
            style={{
                background: muted ? "rgba(255,255,255,0.06)" : "hsl(var(--surface-base))",
                border: `1px solid ${muted ? "rgba(255,255,255,0.12)" : "hsl(var(--border-divider))"}`,
                borderRadius: 2,
                fontSize: "0.65rem",
            }}
            data-testid={`public-trending-chip-${row.ticker}`}
        >
            <span style={{ color: muted ? "rgba(255,255,255,0.92)" : "hsl(var(--text-primary))", fontWeight: 500 }}>
                {row.ticker}
            </span>
            <span style={{ color: muted ? "rgba(255,255,255,0.5)" : "hsl(var(--text-muted))" }}>
                · {row.unique_users}
            </span>
            <span
                style={{
                    color: recColor,
                    fontSize: "0.52rem",
                    letterSpacing: "0.08em",
                }}
            >
                {rec}
            </span>
        </span>
    );
}
