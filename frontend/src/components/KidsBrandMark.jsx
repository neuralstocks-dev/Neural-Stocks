/**
 * KidsBrandMark — KidStocks logo + wordmark + "Powered by NeuLab Inc." tagline.
 *
 * Two separate links by design:
 *   - Logo + "KidStocks" wordmark → internal SPA link to `linkTo`
 *     (default `/kids/about`).
 *   - "Powered by NeuLab Inc." line → external `<a>` to the adult NSI
 *     homepage, opens in a new tab. The always-visible attribution
 *     becomes a constant low-friction funnel for parents who notice
 *     the line and want to investigate the parent product.
 *
 * Bilingual via `brand.powered_by`. Layout uses CSS grid so the two
 * links sit cleanly in their own clickable boxes — no overlap, no
 * absolute positioning math, no nested-anchor HTML.
 *
 *   ┌────────┬─────────────────────────┐
 *   │        │ KidStocks               │  ← row 1 → linkTo
 *   │  LOGO  ├─────────────────────────┤
 *   │        │ Powered by NeuLab Inc.  │  ← row 2 → poweredByHref
 *   └────────┴─────────────────────────┘
 *
 * Callsites should NOT wrap this in their own <Link> (would nest anchors).
 *
 * Props:
 *   size            — logo size in px (default 32)
 *   wordmarkSize    — wordmark font-size in px (default 24)
 *   color           — text color (default "currentColor")
 *   taglineOpacity  — 0..1 (default 0.6; pass 0.7 on dark bg)
 *   linkTo          — internal route for logo + wordmark (default "/kids/about")
 *   poweredByHref   — external href for the powered-by line (default "https://stock.neulab.xyz")
 */
import React from "react";
import { Link } from "react-router-dom";
import KidStocksLogo from "@/components/KidStocksLogo";
import { useKidsLang, t } from "@/lib/kidsI18n";

export default function KidsBrandMark({
    size = 32,
    wordmarkSize = 24,
    color = "currentColor",
    taglineOpacity = 0.6,
    linkTo = "/kids/about",
    poweredByHref = "https://stock.neulab.xyz",
}) {
    const { lang } = useKidsLang();

    return (
        <span
            data-testid="kids-brand-mark"
            style={{
                display: "inline-grid",
                gridTemplateColumns: "auto auto",
                gridTemplateRows: "auto auto",
                columnGap: 10,
                rowGap: 3,
                alignItems: "center",
                color,
            }}
        >
            {/* Logo spans both rows, vertically centered */}
            <Link
                to={linkTo}
                data-testid="kids-brand-logo-link"
                aria-label="KidStocks home"
                style={{
                    gridRow: "1 / span 2",
                    gridColumn: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                    color: "inherit",
                    lineHeight: 0,
                }}
            >
                <KidStocksLogo size={size} />
            </Link>

            {/* Row 1: KidStocks wordmark — links to /kids/about */}
            <Link
                to={linkTo}
                data-testid="kids-brand-wordmark-link"
                style={{
                    gridRow: 1,
                    gridColumn: 2,
                    fontSize: wordmarkSize,
                    fontWeight: 700,
                    letterSpacing: 1,
                    lineHeight: 1,
                    textDecoration: "none",
                    color: "inherit",
                    alignSelf: "end",
                }}
            >
                KidStocks
            </Link>

            {/* Row 2: Powered by NeuLab Inc. — external, new tab */}
            <a
                href={poweredByHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="kids-brand-powered-by"
                style={{
                    gridRow: 2,
                    gridColumn: 2,
                    fontSize: 9.5,
                    fontWeight: 500,
                    letterSpacing: 0.4,
                    lineHeight: 1,
                    opacity: taglineOpacity,
                    color: "inherit",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    alignSelf: "start",
                }}
            >
                {t(lang, "brand.powered_by")}
            </a>
        </span>
    );
}
