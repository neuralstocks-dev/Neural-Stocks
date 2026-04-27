/**
 * MethodologyLink — tiny "?" / "info" chip that deep-links to /technical#anchor.
 *
 * Rendered next to RSI, SMA, MACD, confidence %, mode chip, and pattern names
 * on the verdict page. Clicking jumps the reader straight to the matching
 * section on the Technical page (with a gentle ring-flash on the target).
 */
import React from "react";
import { Link } from "react-router-dom";
import { HelpCircle } from "lucide-react";

export default function MethodologyLink({ anchor, label, variant = "icon", className = "" }) {
    const to = `/technical#${anchor}`;
    const title = label ? `Methodology — ${label}` : "Methodology";
    if (variant === "chip") {
        return (
            <Link
                to={to}
                title={title}
                aria-label={title}
                // 28×28 minimum touch target on mobile (Apple HIG / Material).
                // Visually still feels like a 0.54rem chip thanks to the
                // negative -my-1 trick (visual height ≈12px, hit target ≈28px).
                className={`inline-flex items-center justify-center gap-1 font-mono hover:opacity-100 transition-opacity px-2 py-1.5 -my-1 ${className}`}
                style={{
                    color: "hsl(var(--hold))",
                    fontSize: "0.54rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                    minHeight: 28,
                }}
                data-testid={`method-link-${anchor}`}
            >
                <HelpCircle size={11} strokeWidth={1.5} /> how?
            </Link>
        );
    }
    return (
        <Link
            to={to}
            title={title}
            aria-label={title}
            // 28×28 minimum tap target — keeps the icon visually small but
            // gives the user enough finger room on mobile.
            className={`inline-flex items-center justify-center hover:opacity-100 transition-opacity ${className}`}
            style={{
                color: "hsl(var(--hold))",
                opacity: 0.55,
                minWidth: 28,
                minHeight: 28,
            }}
            data-testid={`method-link-${anchor}`}
        >
            <HelpCircle size={12} strokeWidth={1.5} />
        </Link>
    );
}
