import React, { useState } from "react";
import { Link } from "react-router-dom";

/**
 * Verdict Accuracy v2 — confidence calibration breadcrumbs.
 *
 * Two visual states mirror the audit trail across PDF and public share:
 *  (a) FIRED — amber border + score breakdown row
 *      "LLM raw N → −delta → final"; clicking the delta opens the
 *      drawer with RF probability gauge + top features + Krauss
 *      citation, OR earnings-window cap explainer, depending which
 *      rule fired. Drawer state is component-local.
 *  (b) CLEAN — green border, single sentence "no calibration needed".
 *
 * Rendered only when V2 ran on this analysis (calibration_version == "v2"
 * or confidence_adjustments is an array). Older pre-V2 analyses skip the
 * whole module silently.
 */
export default function ConfidenceCalibrationBreadcrumbs({ analysis }) {
    const [breakdownOpen, setBreakdownOpen] = useState(false);
    if (!analysis) return null;

    const showModule =
        analysis.calibration_version === "v2" ||
        Array.isArray(analysis.confidence_adjustments);
    if (!showModule) return null;

    const fired = (analysis.confidence_adjustments || []).length > 0;
    const stateColor = fired ? "hold" : "buy";

    const scoreChanged =
        typeof analysis.confidence_score_pre_calibration === "number" &&
        typeof analysis.confidence_score === "number" &&
        analysis.confidence_score_pre_calibration !== analysis.confidence_score;

    const delta = scoreChanged
        ? analysis.confidence_score_pre_calibration - analysis.confidence_score
        : 0;

    return (
        <div
            className="mt-4 p-3"
            style={{
                border: "1px solid hsl(var(--border-default))",
                borderLeft: `3px solid hsl(var(--${stateColor}))`,
                background: "hsl(var(--surface-elevated))",
                borderRadius: 2,
            }}
            data-testid="confidence-calibration-breadcrumbs"
        >
            <p
                className="text-overline flex items-center justify-between gap-2"
                style={{ color: `hsl(var(--${stateColor}))`, fontSize: "0.56rem" }}
            >
                <span>
                    {fired
                        ? "Confidence calibrations applied"
                        : "Verdict Accuracy v2 · no calibration needed"}
                </span>
                <Link
                    to="/technical#confidence-calibration"
                    className="link-underline"
                    style={{ fontSize: "0.56rem", color: "hsl(var(--text-muted))" }}
                    data-testid="calibration-methodology-link"
                >
                    How?
                </Link>
            </p>

            {scoreChanged && (
                <div className="mt-2" data-testid="score-breakdown-wrap">
                    <div
                        className="flex items-center gap-2 font-mono"
                        style={{ fontSize: "0.66rem" }}
                        data-testid="score-breakdown"
                    >
                        <span style={{ color: "hsl(var(--text-muted))" }}>LLM raw</span>
                        <span style={{ color: "hsl(var(--text-primary))" }}>
                            {analysis.confidence_score_pre_calibration}
                        </span>
                        <span style={{ color: "hsl(var(--text-muted))" }}>→</span>
                        <button
                            type="button"
                            onClick={() => setBreakdownOpen((v) => !v)}
                            className="font-mono inline-flex items-center gap-1"
                            style={{
                                color: "hsl(var(--sell))",
                                background: "hsla(0,55%,55%,0.08)",
                                padding: "1px 6px",
                                borderRadius: 2,
                                border: "1px solid hsl(var(--sell))",
                                fontSize: "0.66rem",
                                cursor: "pointer",
                                transition: "background 150ms ease",
                            }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.background = "hsla(0,55%,55%,0.16)")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.background = "hsla(0,55%,55%,0.08)")
                            }
                            data-testid="score-breakdown-toggle"
                            aria-expanded={breakdownOpen}
                            aria-controls="score-breakdown-drawer"
                            title="Click to inspect the calibration math"
                        >
                            −{delta}
                            <span style={{ fontSize: "0.55rem", opacity: 0.7 }}>
                                {breakdownOpen ? "▾" : "▸"}
                            </span>
                        </button>
                        <span style={{ color: "hsl(var(--text-muted))" }}>→</span>
                        <span
                            style={{ color: "hsl(var(--buy))", fontWeight: 600 }}
                            data-testid="score-breakdown-final"
                        >
                            {analysis.confidence_score} final
                        </span>
                    </div>

                    {breakdownOpen && (
                        <div
                            id="score-breakdown-drawer"
                            className="mt-3 p-3"
                            style={{
                                background: "hsl(var(--bg))",
                                border: "1px solid hsl(var(--border-divider))",
                                borderRadius: 2,
                                animation: "fadeIn 220ms ease",
                            }}
                            data-testid="score-breakdown-drawer"
                        >
                            {analysis.rf_disagreement_penalty && analysis.rf_opinion ? (
                                <RFDisagreementExplainer analysis={analysis} delta={delta} />
                            ) : analysis.earnings_gate_applied ? (
                                <EarningsGateExplainer analysis={analysis} delta={delta} />
                            ) : (
                                <p
                                    className="text-xs leading-relaxed"
                                    style={{ color: "hsl(var(--text-secondary))" }}
                                >
                                    Confidence was adjusted by {delta} points by the v2
                                    calibration pipeline.{" "}
                                    <Link
                                        to="/technical#confidence-calibration"
                                        className="link-underline"
                                        style={{ color: "hsl(var(--text-secondary))" }}
                                    >
                                        See methodology →
                                    </Link>
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {fired ? (
                <ul className="mt-2 space-y-1.5">
                    {analysis.confidence_adjustments.map((msg, i) => (
                        <li
                            key={i}
                            className="text-xs"
                            style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.5 }}
                        >
                            · {msg}
                        </li>
                    ))}
                </ul>
            ) : (
                <p
                    className="text-xs mt-2"
                    style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.5 }}
                >
                    Earnings-proximity gate and RF-disagreement penalty both ran clean —
                    confidence shown is the AI raw output.
                </p>
            )}
        </div>
    );
}

function RFDisagreementExplainer({ analysis, delta }) {
    const probOutperform = analysis.rf_opinion?.prob_outperform ?? 0;
    const probUnderperform = analysis.rf_opinion?.prob_underperform ?? 1;
    const outperformPct = Math.round(probOutperform * 100);
    const underperformPct = Math.round(probUnderperform * 100);
    return (
        <>
            <p
                className="text-overline"
                style={{ fontSize: "0.55rem", color: "hsl(var(--sell))" }}
            >
                Why the −{delta} penalty
            </p>
            <p
                className="mt-2 text-xs leading-relaxed"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                AI said{" "}
                <strong style={{ color: "hsl(var(--text-primary))" }}>
                    {analysis.recommendation}
                </strong>
                . The Random-Forest secondary model — trained on{" "}
                {(analysis.rf_opinion?.model_info?.universe_size || 346).toLocaleString()}{" "}
                US stocks since{" "}
                {String(analysis.rf_opinion?.model_info?.training_start_date || "").slice(0, 4) ||
                    "2021"}{" "}
                — gave it{" "}
                <strong style={{ color: "hsl(var(--text-primary))" }}>{outperformPct}% outperform</strong>
                {" / "}
                <strong style={{ color: "hsl(var(--text-primary))" }}>{underperformPct}% underperform</strong>{" "}
                (vs. S&amp;P 500) over a {analysis.rf_opinion?.horizon_days || 20}-day forward window. Direction{" "}
                <em>disagrees</em> with the AI on a{" "}
                <strong style={{ color: "hsl(var(--sell))" }}>
                    {analysis.rf_opinion?.edge}
                </strong>{" "}
                edge — so we lower the displayed confidence by{" "}
                <strong style={{ color: "hsl(var(--text-primary))" }}>
                    {analysis.rf_disagreement_penalty} points
                </strong>{" "}
                rather than override the verdict.
            </p>
            <div className="mt-3" data-testid="score-breakdown-prob-bar">
                <div
                    className="flex items-center"
                    style={{
                        height: 18,
                        border: "1px solid hsl(var(--border-default))",
                        borderRadius: 2,
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            width: `${outperformPct}%`,
                            height: "100%",
                            background: "hsl(var(--buy))",
                            opacity: 0.8,
                        }}
                    />
                    <div
                        style={{
                            width: `${underperformPct}%`,
                            height: "100%",
                            background: "hsl(var(--sell))",
                            opacity: 0.8,
                        }}
                    />
                </div>
                <div
                    className="flex justify-between mt-1 font-mono"
                    style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))" }}
                >
                    <span>P(outperform) {outperformPct}%</span>
                    <span>P(underperform) {underperformPct}%</span>
                </div>
            </div>
            {Array.isArray(analysis.rf_opinion?.top_features) &&
                analysis.rf_opinion.top_features.length > 0 && (
                    <div className="mt-3">
                        <p
                            className="text-overline"
                            style={{ fontSize: "0.55rem", color: "hsl(var(--text-muted))" }}
                        >
                            Top features driving RF
                        </p>
                        <div
                            className="mt-1 grid grid-cols-1 gap-1 font-mono"
                            style={{ fontSize: "0.62rem" }}
                        >
                            {analysis.rf_opinion.top_features.slice(0, 3).map((f) => (
                                <div
                                    key={f.name}
                                    className="flex justify-between"
                                    style={{ color: "hsl(var(--text-secondary))" }}
                                >
                                    <span>{f.name}</span>
                                    <span>
                                        {typeof f.value === "number" ? f.value.toFixed(2) : f.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            <p
                className="mt-3 text-xs"
                style={{ color: "hsl(var(--text-muted))", fontSize: "0.7rem" }}
            >
                Penalty rule grounded in <em>Krauss, Do &amp; Huck (2017)</em> — tree-ensemble
                disagreement with discretionary direction calls predicts ~9pp lower hit-rate
                on equity-direction tasks.{" "}
                <Link
                    to="/technical#random-forest"
                    className="link-underline"
                    style={{ color: "hsl(var(--text-secondary))" }}
                    data-testid="score-breakdown-source-link"
                >
                    See methodology →
                </Link>
            </p>
        </>
    );
}

function EarningsGateExplainer({ analysis, delta }) {
    const days = analysis.days_until_earnings;
    return (
        <>
            <p
                className="text-overline"
                style={{ fontSize: "0.55rem", color: "hsl(var(--hold))" }}
            >
                Why the −{delta} penalty
            </p>
            <p
                className="mt-2 text-xs leading-relaxed"
                style={{ color: "hsl(var(--text-secondary))" }}
            >
                Earnings call is{" "}
                <strong style={{ color: "hsl(var(--text-primary))" }}>
                    {days} day{days === 1 ? "" : "s"} away
                </strong>
                . Pre-earnings windows are event-driven — the LLM can&apos;t price the
                surprise — so confidence is capped at 65 to reflect that uncertainty.{" "}
                <Link
                    to="/technical#confidence-calibration"
                    className="link-underline"
                    style={{ color: "hsl(var(--text-secondary))" }}
                >
                    See methodology →
                </Link>
            </p>
        </>
    );
}
