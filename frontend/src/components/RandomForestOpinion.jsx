/**
 * RandomForestOpinion — secondary-opinion module on the verdict page.
 *
 * Shown alongside the LLM verdict to give users an independent
 * probability estimate. Honest UX:
 *   - When edge="none" we say "No meaningful edge" rather than fake a number
 *   - When edge="strong" + disagrees with Claude, we highlight it prominently
 *   - Deep-links to /technical#random-forest for the full methodology
 */
import React from "react";
import { Link } from "react-router-dom";
import {
    Trees,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    CheckCircle2,
    HelpCircle,
} from "lucide-react";

export default function RandomForestOpinion({ opinion }) {
    if (!opinion) return null;
    const { prob_up, direction, edge, horizon_days, agrees_with_llm, llm_direction, top_features, model_info } = opinion;

    const isNoEdge = edge === "none";
    const isStrong = edge === "strong";
    const isBullish = direction === "up";

    // Provenance banner — honest disclosure of what this model was trained on
    const trainStartYr = model_info?.training_start_date?.slice(0, 4);
    const trainEndYr = model_info?.training_end_date?.slice(0, 4);
    const trainRange = trainStartYr && trainEndYr
        ? (trainStartYr === trainEndYr ? trainStartYr : `${trainStartYr}–${trainEndYr}`)
        : null;
    const calibratedChip = model_info?.calibration_method ? " · isotonic calibrated" : "";
    const provenanceText = trainRange
        ? `Predicted by a Random Forest trained on ${model_info.universe_size} tickers · ${trainRange} · ${horizon_days}-day forward horizon${calibratedChip}`
        : `Predicted by a Random Forest trained on ${model_info?.universe_size ?? "?"} tickers · ${horizon_days}-day forward horizon${calibratedChip}`;

    // Title + accent
    const accent = isNoEdge
        ? "hsl(var(--text-muted))"
        : isBullish
            ? "hsl(var(--buy))"
            : "hsl(var(--sell))";
    const Arrow = isBullish ? TrendingUp : TrendingDown;

    // Agreement chip
    let agreementChip = null;
    if (isNoEdge) {
        agreementChip = (
            <div
                className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px]"
                style={{
                    border: "1px solid hsl(var(--border-divider))",
                    color: "hsl(var(--text-muted))",
                    borderRadius: 2,
                }}
                data-testid="rf-agreement-none"
            >
                <HelpCircle size={11} strokeWidth={1.5} /> No meaningful edge
            </div>
        );
    } else if (agrees_with_llm) {
        agreementChip = (
            <div
                className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px]"
                style={{ border: "1px solid hsl(var(--buy))", color: "hsl(var(--buy))", borderRadius: 2 }}
                data-testid="rf-agreement-agree"
            >
                <CheckCircle2 size={11} strokeWidth={1.5} /> Agrees with AI verdict
            </div>
        );
    } else if (llm_direction !== "neutral") {
        agreementChip = (
            <div
                className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px]"
                style={{ border: "1px solid hsl(var(--sell))", color: "hsl(var(--sell))", borderRadius: 2 }}
                data-testid="rf-agreement-disagree"
            >
                <AlertCircle size={11} strokeWidth={1.5} /> Disagrees with AI verdict
            </div>
        );
    }

    const pctUp = Math.round(prob_up * 1000) / 10;
    const pctDown = Math.round((1 - prob_up) * 1000) / 10;

    return (
        <section
            className="module p-6 md:p-8 mb-1 md:mb-4"
            data-testid="rf-opinion-module"
            style={{ background: "hsl(var(--surface))" }}
        >
            {/* Provenance banner — regulatory-hygiene disclosure on every verdict */}
            <div
                className="flex items-start gap-2 px-3 py-2 mb-5 font-mono text-[10.5px] leading-snug"
                style={{
                    background: "hsl(var(--bg) / 0.6)",
                    border: "1px dashed hsl(var(--border-divider))",
                    color: "hsl(var(--text-muted))",
                    borderRadius: 2,
                }}
                data-testid="rf-provenance-banner"
            >
                <Trees size={12} strokeWidth={1.5} className="mt-[1px] shrink-0" style={{ color: "hsl(var(--hold))" }} />
                <span>
                    {provenanceText}. Past behaviour is{" "}
                    <strong style={{ color: "hsl(var(--text-primary))" }}>not indicative</strong> of
                    future results — this is a probabilistic opinion, not a price forecast.
                </span>
            </div>

            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <p className="text-overline flex items-center gap-2">
                        <Trees size={12} strokeWidth={1.5} />
                        Secondary Opinion · Random Forest
                        <Link
                            to="/technical#random-forest"
                            title="Methodology — Random Forest"
                            className="inline-flex"
                            style={{ color: "hsl(var(--hold))", opacity: 0.6 }}
                            data-testid="method-link-random-forest"
                        >
                            <HelpCircle size={10} strokeWidth={1.5} />
                        </Link>
                    </p>
                    <h3
                        className="font-serif mt-2"
                        style={{ fontSize: "1.55rem", letterSpacing: "-0.01em", color: accent }}
                    >
                        {isNoEdge ? (
                            "Inconclusive."
                        ) : (
                            <>
                                <Arrow size={22} strokeWidth={1.5} className="inline -mt-1 mr-1" />
                                {isBullish ? "Bullish" : "Bearish"} · {horizon_days}-day horizon
                            </>
                        )}
                    </h3>
                </div>
                {agreementChip}
            </div>

            {/* Probability bar */}
            <div className="mt-6">
                <div
                    className="flex h-3 w-full overflow-hidden"
                    style={{ borderRadius: 2 }}
                    data-testid="rf-prob-bar"
                >
                    <div style={{ width: `${pctUp}%`, background: "hsl(var(--buy))" }} />
                    <div style={{ width: `${pctDown}%`, background: "hsl(var(--sell))" }} />
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] font-mono">
                    <span style={{ color: "hsl(var(--buy))" }}>↑ {pctUp}% up</span>
                    <span style={{ color: "hsl(var(--sell))" }}>{pctDown}% down ↓</span>
                </div>
            </div>

            {/* Top features */}
            {top_features?.length > 0 && (
                <div className="mt-6">
                    <p className="text-overline mb-2" style={{ fontSize: "0.58rem" }}>
                        Variables the model relied on
                    </p>
                    <div className="space-y-1.5">
                        {top_features.map((f) => (
                            <div
                                key={f.name}
                                className="flex items-center justify-between text-[12px] font-mono pb-1.5"
                                style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                data-testid={`rf-top-feature-${f.name}`}
                            >
                                <Link
                                    to={_featureAnchor(f.name) ? `/technical${_featureAnchor(f.name)}` : "/technical#random-forest"}
                                    className="hover:underline decoration-dotted underline-offset-4"
                                    style={{ color: "hsl(var(--text-primary))" }}
                                >
                                    {_humanize(f.name)}
                                </Link>
                                <span style={{ color: "hsl(var(--text-muted))" }}>
                                    {formatFeatureValue(f.name, f.value)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Honest disclosure */}
            <p
                className="mt-5 pt-4 text-[11px] leading-relaxed font-mono"
                style={{ color: "hsl(var(--text-muted))", borderTop: "1px solid hsl(var(--border-divider))" }}
                data-testid="rf-disclosure"
            >
                Model holdout accuracy&nbsp;
                <strong style={{ color: "hsl(var(--text-primary))" }}>
                    {Math.round((model_info?.holdout_accuracy ?? 0) * 1000) / 10}%
                </strong>{" "}· ROC-AUC{" "}
                <strong style={{ color: "hsl(var(--text-primary))" }}>
                    {(model_info?.holdout_auc ?? 0).toFixed(3)}
                </strong>{" "}(trained on {model_info?.universe_size} tickers,
                {" "}{model_info?.training_start_date || "?"} → {model_info?.training_end_date || "?"},
                {" "}walk-forward cutoff {model_info?.cutoff_date}).
                Variables it relied on are correlations, not causes. See{" "}
                <Link to="/technical#random-forest" className="underline decoration-dotted underline-offset-4">
                    methodology
                </Link>.
            </p>
        </section>
    );
}

// Map feature name → the anchor on /technical it should deep-link to (where applicable)
function _featureAnchor(name) {
    if (name.startsWith("rsi")) return "#rsi";
    if (name.startsWith("close_over_sma") || name.startsWith("sma")) return "#sma";
    if (name.startsWith("macd")) return "#macd";
    if (name === "vol_ratio_20d" || name === "vol_trend_5d") return "#volume";
    if (name === "spy_ret_20d" || name === "vix_level_rel") return "#random-forest";
    return "#random-forest";
}

function _humanize(name) {
    const map = {
        ret_1d: "1-day return",
        ret_5d: "5-day return",
        ret_20d: "20-day return",
        rsi_14: "RSI (14)",
        rsi_change_3d: "RSI Δ 3d",
        close_over_sma20: "Price ÷ SMA-20",
        close_over_sma50: "Price ÷ SMA-50",
        sma20_over_sma50: "SMA-20 ÷ SMA-50",
        realized_vol_20d: "Realized vol (20d)",
        atr_14_over_close: "ATR-14 ÷ price",
        vol_ratio_20d: "Volume vs 20d avg",
        vol_trend_5d: "Volume trend (5d)",
        macd_hist: "MACD histogram",
        macd_hist_delta: "MACD hist Δ",
        overnight_gap: "Overnight gap",
        candle_body_ratio: "Candle body ratio",
        upper_shadow_ratio: "Upper shadow ratio",
        lower_shadow_ratio: "Lower shadow ratio",
        dist_52w_high: "Dist from 52w high",
        dist_52w_low: "Dist from 52w low",
        range_pos_52w: "52w range position",
        spy_ret_20d: "Market regime (SPY 20d)",
        vix_level_rel: "VIX vs 252d avg",
    };
    return map[name] || name;
}

function formatFeatureValue(name, v) {
    if (name === "rsi_14") return v.toFixed(1);
    if (name === "rsi_change_3d") return (v > 0 ? "+" : "") + v.toFixed(1);
    if (name.includes("ratio") || name.includes("over") || name.startsWith("ret_") || name.startsWith("dist_") || name === "overnight_gap" || name === "macd_hist" || name === "macd_hist_delta" || name === "realized_vol_20d" || name === "atr_14_over_close" || name === "range_pos_52w" || name === "vol_trend_5d") {
        return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
    }
    return v.toFixed(3);
}
