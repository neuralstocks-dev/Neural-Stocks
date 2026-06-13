import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/**
 * LlmHealthBadge — admin-only status dot showing the upstream LLM provider's
 * health. Polls `/api/llm-health/public` every 30s. Renders nothing for
 * non-admin users — operational health is an ops concern, not a user UX
 * surface (would just create anxiety without giving regular users any
 * actionable information).
 *
 * Visual states:
 *   operational : tiny green dot, no label (calm — only visible on hover)
 *   degraded    : amber dot + "AI: degraded" pill — recent failures, but still up
 *   down        : red dot + "AI: down" pill — breaker tripped, fast-fail mode
 *
 * Props:
 *   - inline   : if true, renders inline-flex (good for nav placement);
 *                otherwise renders as a block-level pill suitable next
 *                to the Re-analyze button.
 *   - showWhenHealthy : default true. When false, the badge is hidden
 *                while the upstream is operational — only surfaces during
 *                degradation/outage so we don't clutter the calm UI.
 *
 * The endpoint is public (no auth required) so the badge can render on
 * marketing pages too if we ever need it. It returns ONLY a coarse status
 * field — no failure details, no ticker names — so we don't leak ops data
 * to anonymous clients.
 */

const POLL_INTERVAL_MS = 30_000;

function statusToTone(status) {
    if (status === "down") return { color: "hsl(var(--sell))", label: "AI down", short: "DOWN", pulse: true };
    if (status === "degraded") return { color: "hsl(var(--hold))", label: "AI degraded", short: "DEGRADED", pulse: true };
    return { color: "hsl(var(--buy))", label: "AI operational", short: "LIVE", pulse: false };
}

export default function LlmHealthBadge({ inline = false, showWhenHealthy = false }) {
    const { user } = useAuth();
    const [health, setHealth] = useState(null);

    // Strict admin gate — non-admin users never see this badge under any
    // upstream state. The endpoint stays public so we don't have to ship
    // a separate admin-only route, but the surfacing decision is on the
    // client. If we ever want a customer-facing "service status" page,
    // it should be a separate component with its own copy + framing.
    const isAdmin = !!user?.is_admin;

    useEffect(() => {
        if (!isAdmin) return;   // skip polling entirely for non-admins
        let cancelled = false;
        let timer = null;

        const tick = async () => {
            try {
                const r = await api.get("/llm-health/public");
                if (!cancelled) setHealth(r.data);
            } catch {
                // Network errors should NOT mark the upstream as down — the
                // user's connection might be flaky while the AI provider is fine.
                // Leave the previous state in place.
            }
        };

        tick();
        timer = setInterval(tick, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
        };
    }, [isAdmin]);

    if (!isAdmin) return null;
    if (!health) return null;
    if (!showWhenHealthy && health.status === "operational") return null;

    const tone = statusToTone(health.status);

    const wrapClass = inline
        ? "inline-flex items-center gap-1.5"
        : "inline-flex items-center gap-2 px-2.5 py-1";

    const wrapStyle = inline
        ? {}
        : {
              border: `1px solid ${tone.color}`,
              background: `${tone.color}1A`, // ~10% alpha
          };

    return (
        <span
            className={wrapClass}
            style={wrapStyle}
            title={tone.label}
            data-testid="llm-health-badge"
            data-status={health.status}
        >
            <span
                className={tone.pulse ? "llm-health-pulse" : ""}
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: tone.color,
                    flexShrink: 0,
                    boxShadow: tone.pulse ? `0 0 0 0 ${tone.color}80` : "none",
                }}
                aria-hidden="true"
            />
            {!inline && (
                <span
                    className="text-overline"
                    style={{ fontSize: "0.56rem", color: tone.color, letterSpacing: "0.16em" }}
                >
                    {tone.short}
                </span>
            )}
        </span>
    );
}
