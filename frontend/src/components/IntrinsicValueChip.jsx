import React, { useState } from "react";
import { Anchor, ChevronDown } from "lucide-react";
import { formatPrice } from "@/lib/format";

// Visual band map — discount = green-ish (could be cheap), premium = red-ish
// (potentially overvalued). "fair" is neutral. Educational tone only —
// these colors describe distance to the anchor, not buy/sell guidance.
const INTERP_BAND = {
    deep_discount: { label: "Deep discount vs anchor", chipColor: "hsl(var(--buy))", explainer: "Current price is well below the model's valuation reference." },
    modest_discount: { label: "Modest discount vs anchor", chipColor: "hsl(var(--buy))", explainer: "Current price sits below the model's valuation reference." },
    fair: { label: "Near anchor (fair zone)", chipColor: "hsl(var(--gold))", explainer: "Current price is close to the model's valuation reference." },
    modest_premium: { label: "Modest premium vs anchor", chipColor: "hsl(var(--sell))", explainer: "Current price is above the model's valuation reference." },
    deep_premium: { label: "Deep premium vs anchor", chipColor: "hsl(var(--sell))", explainer: "Current price is well above the model's valuation reference." },
};

const APPLICABILITY_NOTE = {
    high_fit: null,
    low_fit_intangible_heavy: "Sector caveat — book-value-based anchors undercount intangibles for software / services / healthcare. Treat the number as a loose lower bound, not a fair-value floor.",
    low_fit_unrepresentative_roe: "Sector caveat — ROE is structurally distorted (e.g. negative book equity from buybacks). Anchor displayed for transparency only.",
    high_fit_value_destroying: "Caveat — return on equity sits below the cost of equity. Fair value rests at or below book — anchor reads as a ceiling, not a floor.",
};

// Per-method short status label rendered in the compare drawer. The
// applicability codes are method-agnostic on purpose so they can be
// reused for either Graham or RIM, but the human-facing copy here
// translates each code into one short reason the method did or didn't
// apply for this stock.
const APPLICABILITY_SHORT = {
    high_fit: "Applicable",
    high_fit_value_destroying: "Applicable · ROE < cost of equity",
    low_fit_intangible_heavy: "Loose fit · sector intangible-heavy",
    low_fit_unrepresentative_roe: "Skipped · ROE unrepresentative",
    missing_data: "Skipped · missing inputs",
    negative_earnings: "Skipped · negative earnings",
    negative_book_value: "Skipped · negative book value",
    invalid_cost_of_equity: "Skipped · invalid cost of equity",
};

const METHOD_LABEL = { graham: "Graham Number", rim: "Residual Income Model" };
const METHOD_BLURB = {
    graham: "Anchor uses sqrt(22.5 × EPS × book value) — Benjamin Graham's classic value formula. Best fit for asset-heavy sectors (banks, utilities, industrials).",
    rim: "Anchor uses 1-year Residual Income Model: book value × ROE / cost-of-equity (CAPM). Captures earnings power for profitable services/tech where book value alone undercounts the franchise.",
};

// Compact one-line explanation for why the model auto-picked the primary
// method over the alternative. Keeps the comparison drawer self-explanatory
// without a paragraph of prose.
function selectionReason(anchor) {
    const primary = anchor.primary_anchor;
    const sector = anchor.sector || "";
    const grahamOk = (anchor.graham || {}).estimate != null;
    const rimOk = (anchor.rim || {}).estimate != null;
    if (primary === "graham" && rimOk) return "Sector is asset-heavy — Graham preferred over RIM (both methods produced an estimate).";
    if (primary === "graham" && !rimOk) return "RIM not applicable for this stock — Graham used as the available anchor.";
    if (primary === "rim" && grahamOk) return "Sector is intangible-heavy — RIM preferred over Graham (book value alone undercounts the franchise).";
    if (primary === "rim" && !grahamOk) return "Graham not applicable for this stock — RIM used as the available anchor.";
    return `Primary method auto-selected by sector (${sector || "unclassified"}).`;
}

function MethodCell({ method, data, isPrimary, currency }) {
    const estimate = data?.estimate;
    const status = APPLICABILITY_SHORT[data?.applicability] || (estimate == null ? "Not applicable" : "Applicable");
    const dim = estimate == null;
    return (
        <div
            className="flex-1 rounded p-2.5"
            style={{
                background: isPrimary ? "hsl(var(--surface-1))" : "transparent",
                border: isPrimary ? `1px solid hsl(var(--gold) / 0.5)` : `1px solid hsl(var(--border))`,
                opacity: dim ? 0.55 : 1,
            }}
            data-testid={`intrinsic-compare-${method}`}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-mono uppercase tracking-wider" style={{ fontSize: "9px", color: "hsl(var(--text-secondary))" }}>
                    {METHOD_LABEL[method]}
                </span>
                {isPrimary && (
                    <span className="font-mono uppercase" style={{ fontSize: "8px", color: "hsl(var(--gold))" }}>
                        Selected
                    </span>
                )}
            </div>
            <div className="font-serif" style={{ fontSize: "1.1rem", lineHeight: 1.1, color: "hsl(var(--text-primary))" }}>
                {estimate != null ? formatPrice(estimate, currency) : "—"}
            </div>
            <p className="mt-1" style={{ fontSize: "10px", color: "hsl(var(--text-muted))" }}>
                {status}
            </p>
        </div>
    );
}

export default function IntrinsicValueChip({ anchor, currency = "USD", shareCta }) {
    // Auto-open the compare drawer when the primary method is flagged as a
    // loose fit (intangible-heavy / unrepresentative ROE / value-destroying).
    // The drawer is the cheapest way to surface "why does the anchor read
    // this way" in those cases — far better than expecting the user to
    // discover the toggle after the fact. Set once on mount; if the user
    // clicks "Hide", they own the state from then on.
    const lowFit = typeof anchor?.primary_applicability === "string"
        && anchor.primary_applicability.startsWith("low_fit");
    const [open, setOpen] = useState(lowFit);
    if (!anchor || !anchor.primary_anchor || anchor.primary_anchor === "none") return null;
    const method = anchor.primary_anchor;
    const estimate = anchor.primary_estimate;
    if (estimate === null || estimate === undefined) return null;
    const interp = anchor.interpretation;
    const band = INTERP_BAND[interp] || { label: "Reference anchor", chipColor: "hsl(var(--gold))", explainer: "Valuation reference based on book value and earnings power." };
    const pct = anchor.premium_to_anchor_pct;
    const sign = typeof pct === "number" && pct >= 0 ? "+" : "";
    const note = APPLICABILITY_NOTE[anchor.primary_applicability];
    const hasBoth = (anchor.graham || {}).estimate != null && (anchor.rim || {}).estimate != null;
    const canCompare = anchor.graham || anchor.rim;

    return (
        <div
            id="intrinsic-anchor"
            className="mt-4 rounded-md border border-[hsl(var(--border))] p-3 text-xs leading-relaxed scroll-mt-24"
            style={{ background: "hsl(var(--surface-2))" }}
            data-testid="intrinsic-value-chip"
        >
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <Anchor size={12} strokeWidth={1.5} style={{ color: "hsl(var(--gold))" }} />
                    <span className="font-mono uppercase tracking-wider" style={{ fontSize: "10px", color: "hsl(var(--text-secondary))" }}>
                        Valuation reference · {METHOD_LABEL[method] || method}
                    </span>
                </div>
                {shareCta}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-serif" style={{ fontSize: "1.4rem", lineHeight: 1.1, color: "hsl(var(--text-primary))" }} data-testid="intrinsic-value-estimate">
                    {formatPrice(estimate, currency)}
                </span>
                {typeof pct === "number" && (
                    <span
                        className="font-mono px-1.5 py-0.5 rounded"
                        style={{ fontSize: "11px", color: band.chipColor, border: `1px solid ${band.chipColor}`, minHeight: "20px" }}
                        data-testid="intrinsic-value-premium"
                    >
                        Price {sign}{pct.toFixed(1)}% · {band.label}
                    </span>
                )}
            </div>
            <p className="mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                {band.explainer} {METHOD_BLURB[method]}
            </p>
            {note && (
                <p className="mt-1.5" style={{ color: "hsl(var(--text-muted))" }} data-testid="intrinsic-value-caveat">
                    {note}
                </p>
            )}

            {canCompare && (
                <div className="mt-2.5">
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className="inline-flex items-center gap-1 font-mono uppercase tracking-wider"
                        style={{
                            fontSize: "10px",
                            color: "hsl(var(--gold))",
                            minHeight: "28px",
                            padding: "4px 0",
                        }}
                        data-testid="intrinsic-compare-toggle"
                        aria-expanded={open}
                    >
                        <ChevronDown
                            size={12}
                            strokeWidth={1.5}
                            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 180ms" }}
                        />
                        {open ? "Hide method comparison" : `Compare ${hasBoth ? "Graham vs RIM" : "methods"}`}
                    </button>

                    {open && (
                        <div
                            className="mt-2 pt-2.5 border-t border-[hsl(var(--border))]"
                            data-testid="intrinsic-compare-drawer"
                        >
                            {lowFit && (
                                <p
                                    className="mb-2"
                                    style={{
                                        fontSize: "10px",
                                        color: "hsl(var(--gold))",
                                        background: "hsl(var(--gold) / 0.06)",
                                        border: "1px solid hsl(var(--gold) / 0.25)",
                                        borderRadius: "4px",
                                        padding: "6px 8px",
                                    }}
                                    data-testid="intrinsic-compare-autoopen-hint"
                                >
                                    Shown automatically — the auto-selected method is a loose fit for this sector. Compare both anchors below for context.
                                </p>
                            )}
                            <div className="flex flex-col sm:flex-row gap-2">
                                <MethodCell
                                    method="graham"
                                    data={anchor.graham}
                                    isPrimary={method === "graham"}
                                    currency={currency}
                                />
                                <MethodCell
                                    method="rim"
                                    data={anchor.rim}
                                    isPrimary={method === "rim"}
                                    currency={currency}
                                />
                            </div>
                            <p className="mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                                <span className="font-mono uppercase tracking-wider" style={{ fontSize: "9px", color: "hsl(var(--text-muted))" }}>
                                    Why this pick ·{" "}
                                </span>
                                {selectionReason(anchor)}
                            </p>
                        </div>
                    )}
                </div>
            )}

            <p className="mt-2" style={{ color: "hsl(var(--text-muted))" }}>
                Reference anchor only — not a price target or trading instruction.
            </p>
        </div>
    );
}
