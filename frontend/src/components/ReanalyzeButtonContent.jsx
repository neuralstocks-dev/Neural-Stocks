import React from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Live "Thinking…" content for the Re-analyze button.
 *
 * - First 5 seconds: just "Thinking…" (no clutter — most analyses
 *   finish under 60s and we don't want a busy meter for fast paths).
 * - From t=5s onwards: shows live elapsed seconds only. We deliberately
 *   DON'T show "X seconds left" — the ETA is a rolling EMA estimate that
 *   was misleading on busy upstream days (it would hit 0s while the
 *   analysis was still running, looking broken). Elapsed is the only
 *   number that's always correct.
 * - Thin progress bar at the bottom of the button fills proportionally
 *   to elapsed/eta (capped at 95% so the user never sees a "100%" bar
 *   on a job that's still running due to upstream LLM retry storms).
 *
 * When `analyzing` is false, renders the idle Re-analyze label.
 */
export default function ReanalyzeButtonContent({ analyzing, elapsedSec, etaSec }) {
    if (!analyzing) {
        return (
            <>
                <Sparkles size={14} strokeWidth={1.5} /> Re-analyze
            </>
        );
    }
    const showMeter = elapsedSec >= 5;
    // Cap the visual progress at 95% so a running-long job doesn't show
    // a "done" bar before the result actually lands.
    const pct = etaSec ? Math.min(95, Math.round((elapsedSec / etaSec) * 100)) : 0;
    return (
        <>
            <span className="inline-flex items-center gap-2 relative">
                <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                <span>Thinking…</span>
                {showMeter && (
                    <span
                        className="font-mono"
                        style={{ fontSize: "0.65rem", opacity: 0.75 }}
                        data-testid="reanalyze-eta-readout"
                    >
                        {elapsedSec}s
                    </span>
                )}
            </span>
            {showMeter && etaSec ? (
                <span
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        left: 0,
                        bottom: 0,
                        height: "2px",
                        width: `${pct}%`,
                        background: "hsl(var(--gold))",
                        transition: "width 800ms linear",
                        pointerEvents: "none",
                    }}
                    data-testid="reanalyze-progress-bar"
                />
            ) : null}
        </>
    );
}
