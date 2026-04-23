/**
 * BandarmologyCard — IDX-only "Smart Money Flow" module for the verdict page.
 * Shows how many insiders/directors are accumulating vs distributing, rendered
 * as an accumulation-ratio meter + recent-sample list.
 *
 * Backend populates `analysis.bandarmology` only for `.JK` tickers when the
 * RapidAPI provider is configured and responsive; this component renders
 * nothing otherwise (caller passes undefined).
 */
import React from "react";
import { TrendingUp, TrendingDown, Users, Building2, Globe } from "lucide-react";

const REGIME_STYLE = {
    strong_accumulation: { color: "hsl(var(--buy))", icon: TrendingUp, label: "Strong accumulation" },
    mild_accumulation: { color: "hsl(var(--buy))", icon: TrendingUp, label: "Mild accumulation" },
    balanced: { color: "hsl(var(--hold))", icon: Users, label: "Balanced flow" },
    mild_distribution: { color: "hsl(var(--sell))", icon: TrendingDown, label: "Mild distribution" },
    strong_distribution: { color: "hsl(var(--sell))", icon: TrendingDown, label: "Strong distribution" },
    no_signal: { color: "hsl(var(--text-muted))", icon: Users, label: "No recent insider activity" },
};

function fmtShares(n) {
    if (n == null) return "—";
    const v = Math.abs(Number(n));
    if (v >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
}

export default function BandarmologyCard({ bandarmology }) {
    if (!bandarmology) return null;
    const {
        regime, label, accumulation_ratio, smart_money_accumulation,
        buy_shares, sell_shares, buy_count, sell_count,
        smart_money_buy_shares, smart_money_sell_shares,
        foreign_net_shares, total_movements, recent = [],
    } = bandarmology;

    const style = REGIME_STYLE[regime] || REGIME_STYLE.balanced;
    const Icon = style.icon;
    const ratioPct = Math.round(accumulation_ratio * 100);
    const smartPct = smart_money_accumulation != null ? Math.round(smart_money_accumulation * 100) : null;

    return (
        <section
            className="module p-6 md:p-8 mb-1 md:mb-4"
            data-testid="bandarmology-module"
            style={{ background: "hsl(var(--surface))" }}
        >
            <div
                className="flex items-start gap-2 px-3 py-2 mb-5 font-mono text-[10.5px] leading-snug"
                style={{
                    background: "hsl(var(--bg) / 0.6)",
                    border: "1px dashed hsl(var(--border-divider))",
                    color: "hsl(var(--text-muted))",
                    borderRadius: 2,
                }}
                data-testid="bandarmology-methodology"
            >
                <Building2 size={12} strokeWidth={1.5} className="mt-[1px] shrink-0" />
                <span>
                    Computed from <strong style={{ color: "hsl(var(--text-primary))" }}>{total_movements}</strong>
                    {" "}recent IDX/KSEI insider filings (directors, commissioners, major shareholders).
                    This is raw institutional-flow disclosure — not a price forecast.
                </span>
            </div>

            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Building2 size={12} strokeWidth={1.5} /> Bandarmology · Smart money flow
                    </p>
                    <h2 className="font-serif text-3xl mt-1" style={{ letterSpacing: "-0.02em" }}>
                        {label || style.label}
                    </h2>
                </div>
                <div
                    className="flex items-center gap-2 px-3 py-1.5 font-mono text-[11px]"
                    style={{ border: `1px solid ${style.color}`, color: style.color, borderRadius: 2 }}
                    data-testid="bandarmology-regime-chip"
                >
                    <Icon size={12} strokeWidth={1.5} />
                    {ratioPct}% BUY
                </div>
            </div>

            {/* Accumulation bar */}
            <div className="mt-6">
                <div className="flex items-center justify-between mb-2 text-[11px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                    <span>{sell_count} sell-side insiders</span>
                    <span>{buy_count} buy-side insiders</span>
                </div>
                <div
                    className="h-3 w-full overflow-hidden relative"
                    style={{ background: "hsl(var(--sell))", borderRadius: 2 }}
                    data-testid="bandarmology-accumulation-bar"
                >
                    <div
                        style={{
                            width: `${ratioPct}%`,
                            height: "100%",
                            background: "hsl(var(--buy))",
                            transition: "width 0.6s cubic-bezier(.16,1,.3,1)",
                        }}
                    />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] font-mono">
                    <span style={{ color: "hsl(var(--sell))" }}>
                        {fmtShares(sell_shares)} sold
                    </span>
                    <span style={{ color: "hsl(var(--text-muted))" }}>
                        Accumulation {ratioPct}%
                    </span>
                    <span style={{ color: "hsl(var(--buy))" }}>
                        {fmtShares(buy_shares)} bought
                    </span>
                </div>
            </div>

            {/* Secondary stats */}
            <div
                className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-0"
                style={{ border: "1px solid hsl(var(--border-default))" }}
            >
                <Cell
                    label="Smart-money (directors, commissioners)"
                    value={smartPct != null ? `${smartPct}% BUY` : "—"}
                    detail={`${fmtShares(smart_money_buy_shares)} bought · ${fmtShares(smart_money_sell_shares)} sold`}
                    color={smartPct != null && smartPct >= 55 ? "hsl(var(--buy))" : smartPct != null && smartPct <= 45 ? "hsl(var(--sell))" : undefined}
                />
                <Cell
                    label="Foreign net flow"
                    value={`${foreign_net_shares >= 0 ? "+" : ""}${fmtShares(foreign_net_shares)}`}
                    detail={foreign_net_shares > 0 ? "Net buy from foreign holders" : foreign_net_shares < 0 ? "Net sell from foreign holders" : "Neutral"}
                    icon={Globe}
                    color={foreign_net_shares > 0 ? "hsl(var(--buy))" : foreign_net_shares < 0 ? "hsl(var(--sell))" : undefined}
                />
                <Cell
                    label="Total filings analysed"
                    value={String(total_movements)}
                    detail={`${buy_count} buys · ${sell_count} sells`}
                    last
                />
            </div>

            {/* Recent sample */}
            {recent.length ? (
                <div className="mt-5" data-testid="bandarmology-recent-list">
                    <p className="text-overline mb-3">Most recent filings</p>
                    <div style={{ border: "1px solid hsl(var(--border-default))" }}>
                        {recent.map((m, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between gap-3 p-3"
                                style={{ borderBottom: i < recent.length - 1 ? "1px solid hsl(var(--border-divider))" : undefined }}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span
                                        className="px-1.5 py-0.5 font-mono text-[10px] shrink-0"
                                        style={{
                                            border: `1px solid ${m.action === "BUY" ? "hsl(var(--buy))" : "hsl(var(--sell))"}`,
                                            color: m.action === "BUY" ? "hsl(var(--buy))" : "hsl(var(--sell))",
                                            borderRadius: 2,
                                        }}
                                    >
                                        {m.action}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm truncate" style={{ color: "hsl(var(--text-primary))" }}>
                                            {m.name}
                                            {m.is_smart_money ? (
                                                <span className="ml-2 text-[10px] font-mono" style={{ color: "hsl(var(--hold))" }}>
                                                    ◆ SMART MONEY
                                                </span>
                                            ) : null}
                                            {m.is_foreign ? (
                                                <span className="ml-2 text-[10px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                                    FOREIGN
                                                </span>
                                            ) : null}
                                        </p>
                                        <p className="text-[10.5px] font-mono" style={{ color: "hsl(var(--text-muted))" }}>
                                            {m.date} · @ Rp {m.price || "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right font-mono text-xs shrink-0">
                                    <p style={{ color: "hsl(var(--text-primary))" }}>{fmtShares(m.shares)}</p>
                                    <p className="text-[10px]" style={{ color: "hsl(var(--text-muted))" }}>shares</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function Cell({ label, value, detail, icon: Icon, color, last }) {
    return (
        <div
            className="p-4"
            style={{
                borderRight: last ? undefined : "1px solid hsl(var(--border-default))",
            }}
        >
            <p className="text-overline flex items-center gap-1.5" style={{ fontSize: "0.58rem" }}>
                {Icon ? <Icon size={10} strokeWidth={1.5} /> : null}
                {label}
            </p>
            <p className="mt-1.5 font-mono text-sm" style={{ color: color || "hsl(var(--text-primary))" }}>
                {value}
            </p>
            {detail ? (
                <p className="mt-1 text-[10px]" style={{ color: "hsl(var(--text-muted))" }}>
                    {detail}
                </p>
            ) : null}
        </div>
    );
}
