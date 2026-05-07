/**
 * KidStocks brand mark — "KS" monogram.
 *
 * Rounded-square badge (coral fill, gold spark) + cream "KS" wordmark
 * in our display font (Outfit). Designed to read at every size from
 * 16px (favicon) up to 256px (social share card).
 *
 * Drop-in replacement for the lucide `<Sparkles />` icon we were using
 * as a placeholder. Inherits sizing through `size` prop; falls back to
 * 32px to match our typical header usage.
 *
 * For favicons + email + Telegram avatar, see the standalone SVG at
 * /public/kidstocks-logo.svg (path-rendered, no font dependency).
 */
import React from "react";

export default function KidStocksLogo({ size = 32, mono = false, title = "KidStocks" }) {
    const fill = mono ? "currentColor" : "#ff7676";
    const text = mono ? "#fff" : "#fff8f0";
    const spark = mono ? "currentColor" : "#ffb570";
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width={size}
            height={size}
            role="img"
            aria-label={title}
            style={{ flexShrink: 0 }}
        >
            <title>{title}</title>
            <rect width="100" height="100" rx="22" fill={fill} />
            {/* Gold spark in the upper-right — echoes the lucide Sparkles
                accent we used during prototyping, and ties the logo to
                the gold/coral palette already in the design tokens. */}
            <circle cx="82" cy="18" r="6" fill={spark} opacity={mono ? 0.55 : 0.95} />
            <text
                x="50"
                y="68"
                textAnchor="middle"
                fill={text}
                fontFamily='"Outfit","Quicksand",ui-sans-serif,system-ui,sans-serif'
                fontWeight="800"
                fontSize="48"
                letterSpacing="-2"
            >
                KS
            </text>
        </svg>
    );
}
