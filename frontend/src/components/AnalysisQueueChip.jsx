/**
 * AnalysisQueueChip
 *
 * A tiny "Stocks queued" indicator that shows up next to the Re-analyze
 * button when the pipeline is at or near capacity. Polls the backend
 * `/api/analysis/queue/status` every 5s while a parent flag (`watch`)
 * is true (e.g. the user is on the analysis page or just clicked Analyze).
 *
 * Renders nothing when `is_busy === false` so quiet periods stay clean —
 * we only surface the chip when there's real contention. Turns the
 * invisible asyncio queue into a transparent wait estimate, which
 * converts way better than a spinner that looks stuck.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";

const POLL_INTERVAL_MS = 5000;

function _formatWait(seconds) {
    if (!seconds || seconds <= 0) return null;
    if (seconds < 60) return `~${seconds}s`;
    const m = Math.round(seconds / 60);
    return `~${m}m`;
}

export default function AnalysisQueueChip({ watch = true, className = "" }) {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        if (!watch) return;
        let cancelled = false;
        let timer = null;

        const tick = async () => {
            try {
                const r = await api.get("/analysis/queue/status");
                if (!cancelled) setStatus(r.data);
            } catch {
                // Silent — the chip is best-effort UX, never surface a
                // failure to the user. Just keep last known state.
            } finally {
                if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
            }
        };
        tick();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [watch]);

    if (!status || !status.is_busy) return null;

    const waitLabel = _formatWait(status.estimated_wait_s);
    const queuePart =
        status.queued > 0
            ? `${status.running} running · ${status.queued} queued`
            : `${status.running}/${status.capacity} running`;

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 font-mono text-xs ${className}`}
            style={{
                border: "1px solid hsl(var(--hold))",
                color: "hsl(var(--hold))",
                background: "hsla(38, 70%, 55%, 0.06)",
                borderRadius: 2,
                fontSize: "0.62rem",
                letterSpacing: "0.02em",
            }}
            data-testid="analysis-queue-chip"
            title={`Pipeline at capacity. ${queuePart}.${
                waitLabel ? ` Estimated wait for a new analysis: ${waitLabel}.` : ""
            }`}
        >
            <Loader2 size={10} className="animate-spin" strokeWidth={2} />
            <span>
                Pipeline busy · {queuePart}
                {waitLabel ? ` · ${waitLabel} wait` : ""}
            </span>
        </span>
    );
}
