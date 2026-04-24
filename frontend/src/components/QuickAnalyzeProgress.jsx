import React from "react";
import { Loader2, Check, X as XIcon, Circle, Sparkles } from "lucide-react";

/**
 * QuickAnalyzeProgress — floating bottom-right panel that animates per-ticker
 * status during a Quick Analyze (Top/Bottom 3) batch run.
 *
 * Reads the live job state shape returned by GET /api/analysis/quick/jobs/{id}:
 *
 *   {
 *     status: "running" | "done" | "failed",
 *     analyzed: ["AAPL", "MSFT", "NVDA"],
 *     results:  [{ ticker, recommendation, error?, status? }, ...],
 *     progress: { completed, timed_out, errored, total },
 *   }
 *
 * Renders one row per ticker with a state icon: ◯ queued, ◐ analyzing,
 * ✓ done (with verdict pill), ✗ error/timeout. Backend processes
 * sequentially so the "currently processing" ticker is the first one in
 * `analyzed` that has not yet appeared in `results`.
 */
export default function QuickAnalyzeProgress({ kind, jobState }) {
    if (!jobState) return null;
    const { analyzed = [], results = [], progress = {}, status } = jobState;
    if (analyzed.length === 0) {
        // Job started but backend hasn't yet picked the tickers — show a
        // tiny "spinning up" placeholder so the panel is visible
        // immediately on click rather than appearing 1-2s later.
        return (
            <Panel kind={kind}>
                <div className="px-4 py-4 font-mono text-xs flex items-center gap-2" style={{ color: "hsl(var(--text-muted))" }}>
                    <Loader2 size={12} className="animate-spin" />
                    Picking the {kind === "top" ? "top" : "bottom"} 3…
                </div>
            </Panel>
        );
    }

    const total = progress.total || analyzed.length;
    const completed = progress.completed || 0;
    const timedOut = progress.timed_out || 0;
    const errored = progress.errored || 0;
    const finishedTickers = new Set(results.map((r) => r.ticker));
    // Sequential processing → currently-running ticker = first analyzed not yet in results.
    const currentTicker =
        status === "running"
            ? analyzed.find((tk) => !finishedTickers.has(tk))
            : null;

    return (
        <Panel kind={kind} status={status}>
            <header
                className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: "1px solid hsl(var(--border-default))" }}
            >
                <div className="flex items-center gap-2">
                    <Sparkles size={12} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                    <span className="text-overline" style={{ fontSize: "0.6rem" }}>
                        Quick Sweep · {kind === "top" ? "Top 3" : "Bottom 3"}
                    </span>
                </div>
                <span
                    className="font-mono text-xs"
                    style={{ color: status === "done" ? "hsl(var(--buy))" : "hsl(var(--text-secondary))" }}
                    data-testid="quick-progress-counter"
                >
                    {completed + timedOut + errored} / {total}
                </span>
            </header>
            <ul className="divide-y" style={{ borderColor: "hsl(var(--border-divider))" }}>
                {analyzed.map((tk) => {
                    const r = results.find((x) => x.ticker === tk);
                    const isCurrent = currentTicker === tk;
                    return (
                        <TickerRow key={tk} ticker={tk} result={r} isCurrent={isCurrent} />
                    );
                })}
            </ul>
            {/* Progress bar */}
            <div
                style={{
                    height: 2,
                    background: "hsl(var(--border-default))",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        height: "100%",
                        width: `${total > 0 ? ((completed + timedOut + errored) / total) * 100 : 0}%`,
                        background:
                            status === "done"
                                ? "hsl(var(--buy))"
                                : "hsl(var(--hold))",
                        transition: "width 400ms ease-out, background 200ms ease-out",
                    }}
                />
            </div>
        </Panel>
    );
}

function Panel({ kind, status, children }) {
    return (
        <div
            className="fixed bottom-6 right-6 z-50 module"
            data-testid={`quick-progress-panel-${kind}`}
            style={{
                width: 320,
                maxWidth: "calc(100vw - 24px)",
                background: "hsl(var(--surface-base))",
                border: "1px solid hsl(var(--border-default))",
                boxShadow: "0 12px 32px -8px rgba(0,0,0,0.4)",
                animation: status === "done" ? "rise-in 240ms ease-out" : "rise-in 320ms ease-out",
            }}
        >
            {children}
        </div>
    );
}

function TickerRow({ ticker, result, isCurrent }) {
    let icon, label, color, recommendation;
    if (!result && isCurrent) {
        icon = <Loader2 size={12} className="animate-spin" />;
        label = "Analyzing…";
        color = "hsl(var(--hold))";
    } else if (!result) {
        icon = <Circle size={12} strokeWidth={1.5} />;
        label = "Queued";
        color = "hsl(var(--text-muted))";
    } else if (result.error || result.status === "timeout") {
        icon = <XIcon size={12} strokeWidth={2} />;
        label = result.status === "timeout" ? "Timed out" : "Error";
        color = "hsl(var(--sell))";
    } else {
        icon = <Check size={12} strokeWidth={2.5} />;
        label = "Done";
        color = "hsl(var(--buy))";
        recommendation = result.recommendation;
    }
    const recHue =
        recommendation === "BUY"
            ? "hsl(var(--buy))"
            : recommendation === "SELL"
            ? "hsl(var(--sell))"
            : recommendation === "HOLD"
            ? "hsl(var(--hold))"
            : null;

    return (
        <li
            className="flex items-center justify-between px-4 py-3"
            data-testid={`quick-progress-row-${ticker}`}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                <span style={{ color }}>{icon}</span>
                <span className="font-mono text-sm" style={{ color: "hsl(var(--text-primary))" }}>
                    {ticker}
                </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {recommendation && (
                    <span
                        className="font-mono text-[10px] px-1.5 py-0.5"
                        style={{
                            color: recHue,
                            border: `1px solid ${recHue}`,
                            letterSpacing: "0.1em",
                        }}
                    >
                        {recommendation}
                    </span>
                )}
                <span
                    className="font-mono text-[10px] uppercase"
                    style={{ color, letterSpacing: "0.08em" }}
                >
                    {label}
                </span>
            </div>
        </li>
    );
}
