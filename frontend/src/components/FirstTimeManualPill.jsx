/**
 * FirstTimeManualPill — friendly pill nudging new users to read the
 * 5-minute /manual page before their first analyse. Auto-dismisses when:
 *  (a) user explicitly clicks the X,
 *  (b) user clicks the "Read manual" link (treated as engagement),
 *  (c) user has already run any analysis this week (quota signal),
 *  (d) the dismiss flag is in localStorage.
 *
 * Storage key bumped via `_v1` so we can reset the prompt for everyone
 * by bumping the version if we ever want to re-promote the manual.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, X } from "lucide-react";

const KEY = "sai_manual_pill_dismissed_v1";

function isDismissedFromStorage() {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(KEY) === "1";
    } catch {
        return false;
    }
}

function persistDismiss() {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(KEY, "1");
    } catch {
        /* private mode — ignore */
    }
}

export default function FirstTimeManualPill({ quota }) {
    const [dismissed, setDismissed] = useState(true);

    // Read storage on mount only (avoids flicker between server-rendered
    // content and the actual visibility decision).
    useEffect(() => {
        setDismissed(isDismissedFromStorage());
    }, []);

    // Once the user runs their first analysis this week, the quota object
    // updates analyses_this_week >= 1 — the pill auto-hides without the
    // user having to click X. This is the "fades after first use" UX the
    // spec asked for.
    const usedThisWeek = (quota?.analyses_this_week ?? 0) > 0;

    if (dismissed || usedThisWeek) return null;

    const onDismiss = () => {
        persistDismiss();
        setDismissed(true);
    };

    return (
        <section
            className="module px-4 py-3 mb-4 flex items-center justify-between gap-3"
            data-testid="first-time-manual-pill"
            style={{
                borderLeft: "3px solid hsl(var(--hold))",
                background: "hsl(var(--surface-elevated))",
            }}
        >
            <div className="flex items-center gap-3 min-w-0">
                <BookOpen
                    size={18}
                    strokeWidth={1.6}
                    style={{ color: "hsl(var(--hold))", flexShrink: 0 }}
                />
                <div className="min-w-0">
                    <p
                        className="text-xs sm:text-sm leading-snug"
                        style={{ color: "hsl(var(--text-secondary))" }}
                    >
                        <strong style={{ color: "hsl(var(--text-primary))" }}>
                            First time here?
                        </strong>{" "}
                        The 5-minute manual walks you through Dashboard, Watchlist, and how
                        alerts trigger.{" "}
                        <Link
                            to="/manual"
                            onClick={onDismiss}
                            className="link-underline font-mono"
                            style={{ color: "hsl(var(--hold))" }}
                            data-testid="first-time-manual-pill-link"
                        >
                            Read it →
                        </Link>
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="p-1 transition-opacity"
                style={{
                    color: "hsl(var(--text-muted))",
                    opacity: 0.7,
                    flexShrink: 0,
                }}
                data-testid="first-time-manual-pill-dismiss"
            >
                <X size={14} strokeWidth={1.8} />
            </button>
        </section>
    );
}
