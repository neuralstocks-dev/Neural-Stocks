/**
 * KidsFooter — "Powered by NeuLab" attribution rendered at the bottom
 * of every KidStocks surface (logged-in shell + marketing pages).
 *
 * Pulls strings from kidsI18n (`attr.eyebrow`, `attr.body`,
 * `attr.cta_adult`, `attr.copyright`) so it's bilingual EN/ID by
 * default. The adult-site CTA links to https://neulab.xyz (the
 * canonical adult production domain) in a new tab so kid users
 * never lose their KidStocks tab when curiosity sends them over to
 * the parent product.
 *
 * Variant prop:
 *   - "dark"  (default) → navy band, cream text. Used inside the
 *     logged-in KidsShell where the page body is cream.
 *   - "sand"  → cream band, navy text. Used on the marketing
 *     pages whose final section is already dark navy, so a cream
 *     footer creates a clean visual separator.
 */
import React from "react";
import { useKidsLang, t } from "@/lib/kidsI18n";

const NAVY = "#1a1a2e";
const SAND = "#fff8f0";
const SAND_BORDER = "#e5d5b8";
const GOLD = "#ffb570";

export default function KidsFooter({ variant = "dark" }) {
    const { lang } = useKidsLang();
    const isDark = variant === "dark";

    const bg = isDark ? NAVY : SAND;
    const textPrimary = isDark ? "#fff" : NAVY;
    const textMuted = isDark ? "rgba(255,255,255,0.72)" : "rgba(26,26,46,0.72)";
    const eyebrowColor = isDark ? GOLD : "#a85a2a";
    const ctaColor = isDark ? GOLD : "#a85a2a";
    const borderColor = isDark ? "rgba(255,255,255,0.10)" : SAND_BORDER;

    return (
        <footer
            data-testid="kids-footer"
            style={{
                background: bg,
                borderTop: `1px solid ${borderColor}`,
                padding: "32px 20px 28px",
                fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
            }}
        >
            <div style={{ maxWidth: 980, margin: "0 auto" }}>
                <div
                    data-testid="kids-footer-eyebrow"
                    style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        color: eyebrowColor,
                        marginBottom: 8,
                    }}
                >
                    {t(lang, "attr.eyebrow")}
                </div>
                <p
                    data-testid="kids-footer-body"
                    style={{
                        fontSize: 13,
                        lineHeight: 1.65,
                        color: textPrimary,
                        margin: 0,
                        maxWidth: 720,
                    }}
                >
                    {t(lang, "attr.body")}
                </p>
                <a
                    data-testid="kids-footer-adult-cta"
                    href="https://neulab.xyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: "inline-block",
                        marginTop: 14,
                        fontSize: 13,
                        fontWeight: 700,
                        color: ctaColor,
                        textDecoration: "none",
                    }}
                >
                    {t(lang, "attr.cta_adult")}
                </a>
                <div
                    data-testid="kids-footer-copyright"
                    style={{
                        marginTop: 20,
                        paddingTop: 14,
                        borderTop: `1px solid ${borderColor}`,
                        fontSize: 11,
                        color: textMuted,
                    }}
                >
                    {t(lang, "attr.copyright")}
                </div>
            </div>
        </footer>
    );
}
