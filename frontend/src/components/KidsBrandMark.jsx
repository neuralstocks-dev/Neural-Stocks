/**
 * KidsBrandMark — KidStocks logo + wordmark + "Powered by NeuLab Inc." tagline.
 *
 * Used in the header of every KidStocks surface so the NeuLab attribution
 * sits directly under the brand at all times — a stronger, always-visible
 * signal than the footer alone. Bilingual via `brand.powered_by`.
 *
 * Props:
 *   size           — logo size in px (default 32)
 *   wordmarkSize   — wordmark font-size in px (default 24)
 *   color          — text color (default "currentColor"; pages set their own)
 *   taglineOpacity — 0..1, defaults to 0.6 on light bg / set 0.7 on dark
 */
import React from "react";
import KidStocksLogo from "@/components/KidStocksLogo";
import { useKidsLang, t } from "@/lib/kidsI18n";

export default function KidsBrandMark({
    size = 32,
    wordmarkSize = 24,
    color = "currentColor",
    taglineOpacity = 0.6,
}) {
    const { lang } = useKidsLang();
    return (
        <span
            data-testid="kids-brand-mark"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, color }}
        >
            <KidStocksLogo size={size} />
            <span style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1 }}>
                <span style={{ fontSize: wordmarkSize, fontWeight: 700, letterSpacing: 1 }}>
                    KidStocks
                </span>
                <span
                    data-testid="kids-brand-powered-by"
                    style={{
                        fontSize: 9.5,
                        fontWeight: 500,
                        letterSpacing: 0.4,
                        opacity: taglineOpacity,
                        marginTop: 3,
                        whiteSpace: "nowrap",
                    }}
                >
                    {t(lang, "brand.powered_by")}
                </span>
            </span>
        </span>
    );
}
