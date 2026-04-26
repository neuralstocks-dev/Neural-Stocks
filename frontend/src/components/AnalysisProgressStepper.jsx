/**
 * AnalysisProgressStepper
 *
 * Visualises which stage of the pipeline the backend is currently in, by
 * reading `progress.phase` and `progress.completed` from the job document
 * exposed at GET /api/analysis/jobs/{job_id}. Renders a tight horizontal
 * stepper with five pills (or four for standard mode — pattern scanning
 * is mode-conditional) that turn:
 *   gray  → not yet reached
 *   amber → currently active (with pulsing dot)
 *   green → completed
 *
 * The objective: turn the opaque "Thinking…" spinner into a transparent
 * receipt so users see WHICH part of the pipeline (data fetch / patterns
 * / Claude / RF / calibration) is running RIGHT NOW.
 */
import { Loader2, Check } from "lucide-react";

const PHASE_LABELS = {
    queued: "Queued",
    fetching_data: "Fetching data",
    computing_technicals: "Technicals",
    scanning_patterns: "Patterns",
    llm_thinking: "LLM verdict",
    rf_scoring: "RF score",
    calibrating: "Calibrating",
};

export default function AnalysisProgressStepper({ progress, mode = "standard", className = "" }) {
    if (!progress || !progress.phases) return null;
    const phases = progress.phases;
    const completed = new Set(progress.completed || []);
    const active = progress.phase;

    return (
        <div
            className={`flex flex-wrap items-center gap-1.5 ${className}`}
            data-testid="analysis-progress-stepper"
            aria-label="Analysis pipeline progress"
        >
            {phases.map((phase) => {
                const isDone = completed.has(phase);
                const isActive = active === phase;
                const isPending = !isDone && !isActive;

                let bg, fg, border, dot;
                if (isDone) {
                    bg = "hsla(142,55%,45%,0.08)";
                    fg = "hsl(var(--buy))";
                    border = "hsl(var(--buy))";
                } else if (isActive) {
                    bg = "hsla(38,70%,55%,0.08)";
                    fg = "hsl(var(--hold))";
                    border = "hsl(var(--hold))";
                    dot = true;
                } else {
                    bg = "transparent";
                    fg = "hsl(var(--text-muted))";
                    border = "hsl(var(--border-default))";
                }

                return (
                    <span
                        key={phase}
                        className="inline-flex items-center gap-1 px-2 py-1 font-mono"
                        style={{
                            border: `1px solid ${border}`,
                            background: bg,
                            color: fg,
                            borderRadius: 2,
                            fontSize: "0.6rem",
                            letterSpacing: "0.02em",
                            opacity: isPending ? 0.55 : 1,
                            transition: "all 200ms ease",
                        }}
                        data-testid={`progress-phase-${phase}`}
                        data-phase-state={isDone ? "done" : isActive ? "active" : "pending"}
                    >
                        {isDone ? (
                            <Check size={9} strokeWidth={2.5} />
                        ) : isActive ? (
                            <Loader2 size={9} className="animate-spin" strokeWidth={2.2} />
                        ) : (
                            <span
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: 5,
                                    background: "hsl(var(--border-default))",
                                    display: "inline-block",
                                }}
                            />
                        )}
                        <span>{PHASE_LABELS[phase] || phase}</span>
                    </span>
                );
            })}
        </div>
    );
}
