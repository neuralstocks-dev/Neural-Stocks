/**
 * LanguageSwitcher — small EN/ID toggle for KidStocks surfaces.
 *
 * Persists choice via `useKidsLang()` (localStorage `kids_lang`).
 * Style is intentionally lightweight — sits in headers without
 * shouting; the CTA hierarchy belongs to the page CTAs.
 */
import React from "react";
import { useKidsLang, SUPPORTED_LANGS, LANG_FLAGS } from "@/lib/kidsI18n";

export default function LanguageSwitcher({ variant = "default" }) {
    const { lang, setLang } = useKidsLang();

    const baseStyle = {
        display: "inline-flex",
        gap: 4,
        background: variant === "dark" ? "rgba(255,255,255,0.06)" : "rgba(26,26,46,0.04)",
        border: `1px solid ${variant === "dark" ? "rgba(255,255,255,0.10)" : "rgba(26,26,46,0.10)"}`,
        borderRadius: 999,
        padding: 2,
    };
    const btnStyle = (active) => ({
        padding: "5px 12px",
        background: active
            ? (variant === "dark" ? "#ff7676" : "#ff7676")
            : "transparent",
        color: active ? "#fff" : (variant === "dark" ? "rgba(255,255,255,0.7)" : "#1a1a2e"),
        border: "none",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: active ? "default" : "pointer",
        fontFamily: "inherit",
        letterSpacing: 0.3,
    });

    return (
        <div data-testid="kids-lang-switcher" style={baseStyle}>
            {SUPPORTED_LANGS.map((l) => (
                <button
                    key={l}
                    onClick={() => setLang(l)}
                    data-testid={`kids-lang-${l}`}
                    style={btnStyle(lang === l)}
                    aria-pressed={lang === l}
                >
                    {LANG_FLAGS[l]} {l.toUpperCase()}
                </button>
            ))}
        </div>
    );
}
