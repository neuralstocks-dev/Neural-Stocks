import React from "react";
import { Anchor } from "lucide-react";
import { formatPrice } from "@/lib/format";

// Visual band map — discount = green-ish (could be cheap), premium = red-ish
// (potentially overvalued). "fair" is neutral. Educational tone only —
// these colors describe distance to the anchor, not buy/sell guidance.
const INTERP_BAND = {
    deep_discount: {
        label: "Deep discount vs anchor",
        chipColor: "hsl(var(--buy))",
        explainer: "Current price is well below the model's valuation reference.",
    },
    modest_discount: {
        label: "Modest discount vs anchor",
        chipColor: "hsl(var(--buy))",
        explainer: "Current price sits below the model's valuation reference.",
    },
    fair: {
        label: "Near anchor (fair zone)",
        chipColor: "hsl(var(--gold))",
        explainer: "Current price is close to the model's valuation reference.",
    },
    modest_premium: {
        label: "Modest premium vs anchor",
        chipColor: "hsl(var(--sell))",
        explainer: "Current price is above the model's valuation reference.",
    },
    deep_premium: {
        label: "Deep premium vs anchor",
        chipColor: "hsl(var(--sell))",
        explainer: "Current price is well above the model's valuation reference.",
    },
};

const APPLICABILITY_NOTE = {
    high_fit: null,
    low_fit_intangible_heavy:
        "Sector caveat — book-value-based anchors undercount intangibles for software / services / healthcare. Treat the number as a loose lower bound, not a fair-value floor.",
    low_fit_unrepresentative_roe:
        "Sector caveat — ROE is structurally distorted (e.g. negative book equity from buybacks). Anchor displayed for transparency only.",
    high_fit_value_destroying:
        "Caveat — return on equity sits below the cost of equity. Fair value rests at or below book — anchor reads as a ceiling, not a floor.",
};

const METHOD_LABEL = {
    graham: "Graham Number",
    rim: "Residual Income Model",
};

const METHOD_BLURB = {
    graham:
        "Anchor uses sqrt(22.5 × EPS × book value) — Benjamin Graham's classic value formula. Best fit for asset-heavy sectors (banks, utilities, industrials).",
    rim:
        "Anchor uses 1-year Residual Income Model: book value × ROE / cost-of-equity (CAPM). Captures earnings power for profitable services/tech where book value alone undercounts the franchise.",
};

export default function IntrinsicValueChip({ anchor, currency = "USD" }) {
    if (!anchor || !anchor.primary_anchor || anchor.primary_anchor === "none") return null;
    const method = anchor.primary_anchor;
    const estimate = anchor.primary_estimate;
    if (estimate === null || estimate === undefined) return null;
    const interp = anchor.interpretation;
    const band = INTERP_BAND[interp] || {
        label: "Reference anchor",
        chipColor: "hsl(var(--gold))",
        explainer: "Valuation reference based on book value and earnings power.",
    };
    const pct = anchor.premium_to_anchor_pct;
    const sign = typeof pct === "number" && pct >= 0 ? "+" : "";
    const note = APPLICABILITY_NOTE[anchor.primary_applicability];

    return (
        <div
            className="mt-4 rounded-md border border-[hsl(var(--border))] p-3 text-xs leading-relaxed"
            style={{ background: "hsl(var(--surface-2))" }}
            data-testid="intrinsic-value-chip"
        >
            <div className="flex items-center gap-2 mb-2">
                <Anchor size={12} strokeWidth={1.5} style={{ color: "hsl(var(--gold))" }} />
                <span
                    className="font-mono uppercase tracking-wider"
                    style={{ fontSize: "10px", color: "hsl(var(--text-secondary))" }}
                >
                    Valuation reference · {METHOD_LABEL[method] || method}
                </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                    className="font-serif"
                    style={{ fontSize: "1.4rem", lineHeight: 1.1, color: "hsl(var(--text-primary))" }}
                    data-testid="intrinsic-value-estimate"
                >
                    {formatPrice(estimate, currency)}
                </span>
                {typeof pct === "number" && (
                    <span
                        className="font-mono px-1.5 py-0.5 rounded"
                        style={{
                            fontSize: "11px",
                            color: band.chipColor,
                            border: `1px solid ${band.chipColor}`,
                            minHeight: "20px",
                        }}
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
            <p className="mt-1.5" style={{ color: "hsl(var(--text-muted))" }}>
                Reference anchor only — not a price target or trading instruction.
            </p>
        </div>
    );
}
