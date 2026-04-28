import React from "react";
import { Instagram } from "lucide-react";

/**
 * SocialLinks
 * Renders TikTok and Instagram links for @neuralstockintelligence.
 *
 * Props:
 *   - variant: "default" | "muted"
 *       - "default": adapts to current theme via CSS vars (for in-app footers).
 *       - "muted":   forced white-on-dark (for login/signup hero footers).
 *   - size: "sm" | "md"  (icon + text size)
 *   - className: extra wrapper classes
 *   - showHandle: boolean  (default true — shows "@neuralstockintelligence" text)
 */

const TIKTOK_URL = "https://www.tiktok.com/@neuralstockintelligence";
const INSTAGRAM_URL = "https://www.instagram.com/neuralstockintelligence";
const HANDLE = "@neuralstockintelligence";

// TikTok glyph (lucide-react does not ship a TikTok icon).
function TikTokIcon({ size = 14, strokeWidth = 1.5 }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
    );
}

export default function SocialLinks({
    variant = "default",
    size = "sm",
    showHandle = true,
    className = "",
    layout = "row",
}) {
    const iconSize = size === "md" ? 16 : 14;
    const textClass = size === "md" ? "text-sm" : "text-xs";

    const baseStyle =
        variant === "muted"
            ? {
                  color: "rgba(255,255,255,0.55)",
              }
            : {
                  color: "hsl(var(--text-secondary))",
              };

    const hoverStyle =
        variant === "muted"
            ? "hover:!text-white"
            : "hover:!text-[hsl(var(--text-primary))]";

    const itemBase = `inline-flex items-center gap-2 transition-colors ${textClass} ${hoverStyle}`;

    const wrapClass =
        layout === "column"
            ? "flex flex-col gap-2"
            : "flex flex-wrap items-center gap-x-5 gap-y-2";

    return (
        <div
            className={`${wrapClass} ${className}`}
            style={baseStyle}
            data-testid="social-links"
        >
            <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={itemBase}
                aria-label="Follow Neural Stock Intelligence on Instagram"
                data-testid="social-link-instagram"
            >
                <Instagram size={iconSize} strokeWidth={1.5} />
                {showHandle && <span className="font-mono">{HANDLE}</span>}
            </a>
            <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={itemBase}
                aria-label="Follow Neural Stock Intelligence on TikTok"
                data-testid="social-link-tiktok"
            >
                <TikTokIcon size={iconSize} strokeWidth={1.5} />
                {showHandle && <span className="font-mono">{HANDLE}</span>}
            </a>
        </div>
    );
}

export { TIKTOK_URL, INSTAGRAM_URL, HANDLE };
