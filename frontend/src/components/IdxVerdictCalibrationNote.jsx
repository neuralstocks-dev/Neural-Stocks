import React from "react";
import { AlertTriangle, Info } from "lucide-react";

/**
 * IdxVerdictCalibrationNote — transparency chip that renders when the LLM
 * verdict disagrees with the multi-window insider-filing persistence signal
 * on IDX analyses. Turns what would otherwise be a hidden signal conflict
 * into an honest user-facing calibration note.
 *
 * Logic (all must be true to render):
 *   1. Ticker is IDX (.JK) — caller only mounts this for IDX analyses.
 *   2. bandarmology.persistence_label is a meaningful accumulation or
 *      distribution signal (NOT balanced / insufficient_data).
 *   3. bandarmology.volume_gate_tripped is false — if the volume gate is
 *      tripped, the persistence signal is already discounted and noting
 *      disagreement would be misleading.
 *   4. The LLM recommendation DISAGREES with the persistence direction:
 *      - BUY × (persistent_distribution | mild_distribution) → bearish mismatch
 *      - SELL × (persistent_accumulation | mild_accumulation) → bullish mismatch
 *
 * When rendered, the chip explains what the disagreement means and suggests
 * the user wait for alignment — never a hard contradiction, always framed
 * as additional context for the user to weigh.
 *
 * Educational framing only. Does NOT override the verdict, just flags that
 * Claude and bandarmology are looking at different time horizons / evidence.
 */

const BULL_PERSISTENCE = new Set(["persistent_accumulation", "mild_accumulation"]);
const BEAR_PERSISTENCE = new Set(["persistent_distribution", "mild_distribution"]);

function detectMismatch(verdict, persistenceLabel) {
    const v = (verdict || "").toUpperCase();
    if (v === "BUY" && BEAR_PERSISTENCE.has(persistenceLabel)) return "buy_vs_distribution";
    if (v === "SELL" && BULL_PERSISTENCE.has(persistenceLabel)) return "sell_vs_accumulation";
    return null;
}

function persistenceHumanLabel(label) {
    return {
        persistent_accumulation: "persistent accumulation across both 30d and 90d windows",
        mild_accumulation: "mild accumulation",
        persistent_distribution: "persistent distribution across both 30d and 90d windows",
        mild_distribution: "mild distribution",
    }[label] || label;
}

export default function IdxVerdictCalibrationNote({ analysis }) {
    const bandar = analysis?.bandarmology;
    if (!bandar) return null;
    if (bandar.volume_gate_tripped) return null;

    const persistenceLabel = bandar.persistence_label;
    if (!persistenceLabel || persistenceLabel === "balanced" || persistenceLabel === "insufficient_data") {
        return null;
    }

    const mismatch = detectMismatch(analysis?.recommendation, persistenceLabel);
    if (!mismatch) return null;

    const verdict = (analysis?.recommendation || "").toUpperCase();
    const ticker = (analysis?.ticker || "").toUpperCase();
    const w30Ratio = bandar.persistence_30d?.ratio;
    const w90Ratio = bandar.persistence_90d?.ratio;
    const consistent = bandar.persistence_consistent;

    const isBullMismatch = mismatch === "sell_vs_accumulation";

    const headline = isBullMismatch
        ? `Neural's ${verdict} vs insider ${persistenceHumanLabel(persistenceLabel)}`
        : `Neural's ${verdict} vs insider ${persistenceHumanLabel(persistenceLabel)}`;

    const explanation = isBullMismatch
        ? `Neural's research verdict leans ${verdict} based on technicals, fundamentals and market context — but the IDX insider-filing feed shows ${persistenceHumanLabel(persistenceLabel)} over the last 30/90 days (${Math.round((w30Ratio || 0) * 100)}% / ${Math.round((w90Ratio || 0) * 100)}% buy ratio). Directors and major shareholders with inside-view on the company have been net-buying. Two reasonable reads:`
        : `Neural's research verdict leans ${verdict} based on technicals, fundamentals and market context — but the IDX insider-filing feed shows ${persistenceHumanLabel(persistenceLabel)} over the last 30/90 days (${Math.round((w30Ratio || 0) * 100)}% / ${Math.round((w90Ratio || 0) * 100)}% buy ratio). Directors and major shareholders with inside-view on the company have been net-selling. Two reasonable reads:`;

    const reads = isBullMismatch
        ? [
              "The tape is weak right now but insiders see longer-term value — a higher-conviction BUY setup may emerge once technical structure confirms.",
              "Insider buying on a weak tape can also be defensive (averaging down on a pre-existing position). Weight the persistence window against your horizon.",
          ]
        : [
              "The tape is strong right now but insiders are trimming — historically this is a yellow flag on IDX. Consider smaller size or waiting for alignment.",
              "Insider selling can also be diversification or liquidity (not a view on the company). Cross-check with the companion broker-flow tools below.",
          ];

    return (
        <section
            className="module p-5 md:p-6 mb-1 md:mb-4"
            data-testid="idx-verdict-calibration-note"
            style={{
                background: "hsl(var(--hold) / 0.08)",
                border: "1px solid hsl(var(--hold))",
                borderLeft: "3px solid hsl(var(--hold))",
            }}
        >
            <div className="flex items-start gap-3">
                <AlertTriangle
                    size={16}
                    strokeWidth={1.5}
                    className="shrink-0 mt-0.5"
                    style={{ color: "hsl(var(--hold))" }}
                />
                <div className="min-w-0 flex-1">
                    <p className="text-overline" style={{ color: "hsl(var(--hold))", fontSize: "0.58rem" }}>
                        Signal calibration · {ticker}
                    </p>
                    <h3
                        className="font-serif text-lg mt-1"
                        style={{ letterSpacing: "-0.01em" }}
                        data-testid="idx-calibration-headline"
                    >
                        {headline}
                        {consistent ? (
                            <span
                                className="ml-2 text-[10px] font-mono align-middle px-1.5 py-0.5"
                                style={{
                                    border: "1px solid hsl(var(--hold))",
                                    color: "hsl(var(--hold))",
                                    borderRadius: 2,
                                }}
                            >
                                BOTH WINDOWS
                            </span>
                        ) : null}
                    </h3>
                    <p
                        className="mt-3 text-[13px] leading-relaxed"
                        style={{ color: "hsl(var(--text-primary))" }}
                        data-testid="idx-calibration-explanation"
                    >
                        {explanation}
                    </p>
                    <ul
                        className="mt-3 space-y-2 text-[13px] leading-relaxed"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        {reads.map((r, i) => (
                            <li key={i} className="flex gap-2">
                                <span style={{ color: "hsl(var(--hold))" }}>—</span>
                                <span>{r}</span>
                            </li>
                        ))}
                    </ul>
                    <p
                        className="mt-4 flex items-start gap-2 text-[11px] font-mono leading-relaxed"
                        style={{ color: "hsl(var(--text-muted))" }}
                    >
                        <Info size={11} strokeWidth={1.5} className="mt-[1px] shrink-0" />
                        <span>
                            Insider filings lag actual transactions by 5-30 days. This is background
                            context, not a forecast. Neural's verdict above remains as-is — this note
                            exists so you see both signals.
                        </span>
                    </p>
                </div>
            </div>
        </section>
    );
}

// Exposed for unit tests.
export { detectMismatch, BULL_PERSISTENCE, BEAR_PERSISTENCE };
