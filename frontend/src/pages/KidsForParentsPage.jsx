/**
 * KidsForParentsPage (`/kids/for-parents`) — competitive analysis +
 * "Why Us" pitch for parents. Bilingual.
 *
 * Three sections:
 *   1. Hero — parent-focused framing
 *   2. Comparison table — 7 platforms × 6 dimensions
 *   3. Three "why us" cards — translation philosophy, reflection
 *      reward, no-real-money default
 */
import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, ShieldCheck, Brain, Coins, Check, X } from "lucide-react";
import KidStocksLogo from "@/components/KidStocksLogo";
import { useKidsLang, t } from "@/lib/kidsI18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import KidsFooter from "@/components/KidsFooter";

const ACCENT = "#ff7676";
const NAVY = "#1a1a2e";
const GOLD = "#ffb570";
const SAND = "#fff8f0";
const SAND_BORDER = "#e5d5b8";
const GREEN = "#76b876";

const shellStyle = {
    minHeight: "100vh",
    background: SAND,
    fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
    color: NAVY,
};
const wrapStyle = { maxWidth: 1180, margin: "0 auto", padding: "24px 20px 60px" };

export default function KidsForParentsPage() {
    const { lang } = useKidsLang();

    // Comparison rows + columns: 7 platforms × 6 dimensions.
    const cols = [
        { key: "us", label: t(lang, "parents.col_us"), highlight: true },
        { key: "greenlight", label: t(lang, "parents.col_greenlight") },
        { key: "fidelity", label: t(lang, "parents.col_fidelity") },
        { key: "stockpile", label: t(lang, "parents.col_stockpile") },
        { key: "bibit", label: t(lang, "parents.col_bibit") },
        { key: "pluang", label: t(lang, "parents.col_pluang") },
        { key: "robo", label: t(lang, "parents.col_robo") },
    ];

    const rows = [
        { label: t(lang, "parents.row_focus"), values: [
            t(lang, "parents.row_focus_us"),
            t(lang, "parents.row_focus_greenlight"),
            t(lang, "parents.row_focus_fidelity"),
            t(lang, "parents.row_focus_stockpile"),
            t(lang, "parents.row_focus_bibit"),
            t(lang, "parents.row_focus_pluang"),
            t(lang, "parents.row_focus_robo"),
        ]},
        { label: t(lang, "parents.row_money"), values: [
            t(lang, "parents.row_money_us"),
            t(lang, "parents.row_money_greenlight"),
            t(lang, "parents.row_money_fidelity"),
            t(lang, "parents.row_money_stockpile"),
            t(lang, "parents.row_money_bibit"),
            t(lang, "parents.row_money_pluang"),
            t(lang, "parents.row_money_robo"),
        ]},
        { label: t(lang, "parents.row_age"), values: [
            t(lang, "parents.row_age_us"),
            t(lang, "parents.row_age_greenlight"),
            t(lang, "parents.row_age_fidelity"),
            t(lang, "parents.row_age_stockpile"),
            t(lang, "parents.row_age_bibit"),
            t(lang, "parents.row_age_pluang"),
            t(lang, "parents.row_age_robo"),
        ]},
        { label: t(lang, "parents.row_explain"), values: [
            t(lang, "parents.row_explain_us"),
            t(lang, "parents.row_explain_greenlight"),
            t(lang, "parents.row_explain_fidelity"),
            t(lang, "parents.row_explain_stockpile"),
            t(lang, "parents.row_explain_bibit"),
            t(lang, "parents.row_explain_pluang"),
            t(lang, "parents.row_explain_robo"),
        ]},
        { label: t(lang, "parents.row_journal"), values: [
            t(lang, "parents.row_journal_us"),
            t(lang, "parents.row_journal_other"),
            t(lang, "parents.row_journal_other"),
            t(lang, "parents.row_journal_other"),
            t(lang, "parents.row_journal_other"),
            t(lang, "parents.row_journal_other"),
            t(lang, "parents.row_journal_other"),
        ]},
        { label: t(lang, "parents.row_lang"), values: [
            t(lang, "parents.row_lang_us"),
            t(lang, "parents.row_lang_no"),
            t(lang, "parents.row_lang_no"),
            t(lang, "parents.row_lang_no"),
            t(lang, "parents.row_lang_yes"),
            t(lang, "parents.row_lang_yes"),
            t(lang, "parents.row_lang_no"),
        ]},
        { label: t(lang, "parents.row_fee"), values: [
            t(lang, "parents.row_fee_us"),
            t(lang, "parents.row_fee_greenlight"),
            t(lang, "parents.row_fee_fidelity"),
            t(lang, "parents.row_fee_stockpile"),
            t(lang, "parents.row_fee_bibit"),
            t(lang, "parents.row_fee_pluang"),
            t(lang, "parents.row_fee_robo"),
        ]},
    ];

    return (
        <div style={shellStyle} data-testid="kids-for-parents-page">
            <header style={{ ...wrapStyle, paddingTop: 22, paddingBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Link to="/kids/about" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: NAVY }}>
                    <KidStocksLogo size={32} />
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>KidStocks</span>
                </Link>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <LanguageSwitcher />
                    <Link to="/kids/login" style={{ fontSize: 13, color: NAVY, textDecoration: "none", fontWeight: 600, opacity: 0.85 }}>
                        {t(lang, "auth.login_submit")} →
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <section style={{ ...wrapStyle, paddingTop: 32, paddingBottom: 28 }}>
                <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: ACCENT, fontWeight: 700, margin: 0 }}>
                    {t(lang, "parents.eyebrow")}
                </p>
                <h1 style={{ fontSize: "clamp(1.8rem, 4.4vw, 3rem)", fontWeight: 700, lineHeight: 1.15, marginTop: 14, maxWidth: 880, letterSpacing: -0.5 }}>
                    {t(lang, "parents.hero_title")}
                </h1>
                <p style={{ fontSize: 17, lineHeight: 1.6, marginTop: 18, maxWidth: 760, color: "rgba(26,26,46,0.78)" }}>
                    {t(lang, "parents.hero_sub")}
                </p>
            </section>

            {/* Comparison table */}
            <section style={{ ...wrapStyle, paddingTop: 12, paddingBottom: 36 }}>
                <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: GOLD, fontWeight: 700, margin: 0 }}>
                    {t(lang, "parents.compare_eyebrow")}
                </p>
                <h2 style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.2rem)", fontWeight: 700, marginTop: 8, marginBottom: 20 }}>
                    {t(lang, "parents.compare_title")}
                </h2>
                <div style={{ overflowX: "auto", border: `1px solid ${SAND_BORDER}`, borderRadius: 16, background: "#fff" }} data-testid="parents-compare-table">
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 880 }}>
                        <thead>
                            <tr>
                                <th style={{ ...thStyle, textAlign: "left", minWidth: 150 }}></th>
                                {cols.map((c) => (
                                    <th key={c.key} style={{ ...thStyle, ...(c.highlight ? thHighlight : {}) }} data-testid={`compare-col-${c.key}`}>
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} style={{ borderTop: `1px solid ${SAND_BORDER}` }}>
                                    <td style={{ ...tdStyle, fontWeight: 700, background: SAND }}>{r.label}</td>
                                    {r.values.map((v, j) => (
                                        <td key={j} style={{ ...tdStyle, ...(cols[j]?.highlight ? tdHighlight : {}) }}>
                                            {v}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Why Us */}
            <section style={{ background: "#fff", borderTop: `1px solid ${SAND_BORDER}`, borderBottom: `1px solid ${SAND_BORDER}` }}>
                <div style={{ ...wrapStyle, paddingTop: 48, paddingBottom: 48 }}>
                    <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: ACCENT, fontWeight: 700, margin: 0 }}>
                        {t(lang, "parents.why_eyebrow")}
                    </p>
                    <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, marginTop: 8, marginBottom: 28 }}>
                        {t(lang, "parents.why_title")}
                    </h2>
                    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                        <Why icon={<Brain size={24} color={GREEN} />} title={t(lang, "parents.why1_title")} body={t(lang, "parents.why1_body")} />
                        <Why icon={<Coins size={24} color={GOLD} />} title={t(lang, "parents.why2_title")} body={t(lang, "parents.why2_body")} />
                        <Why icon={<ShieldCheck size={24} color={ACCENT} />} title={t(lang, "parents.why3_title")} body={t(lang, "parents.why3_body")} />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section style={{ ...wrapStyle, paddingTop: 48, paddingBottom: 56, textAlign: "center" }}>
                <h3 style={{ fontSize: "clamp(1.4rem, 3.2vw, 2rem)", fontWeight: 700, lineHeight: 1.25 }}>
                    {t(lang, "parents.cta_title")}
                </h3>
                <p style={{ marginTop: 14, fontSize: 15, opacity: 0.78, maxWidth: 640, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
                    {t(lang, "parents.cta_body")}
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "center", flexWrap: "wrap" }}>
                    <Link to="/kids/signup" data-testid="parents-cta-signup" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "14px 28px", background: NAVY, color: "#fff",
                        fontSize: 15, fontWeight: 700, borderRadius: 999, textDecoration: "none",
                    }}>
                        {t(lang, "parents.cta_button")} <ArrowRight size={16} />
                    </Link>
                    <Link to="/kids/preview/AAPL?age=11-13" data-testid="parents-cta-preview" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "14px 28px", background: "transparent", color: NAVY,
                        fontSize: 15, fontWeight: 700, borderRadius: 999, textDecoration: "none",
                        border: `1.5px solid ${SAND_BORDER}`,
                    }}>
                        {t(lang, "parents.cta_preview")}
                    </Link>
                </div>
            </section>

            <KidsFooter variant="dark" />
        </div>
    );
}

const thStyle = {
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 700,
    color: NAVY,
    background: SAND,
    textAlign: "left",
    whiteSpace: "nowrap",
};
const thHighlight = { background: NAVY, color: "#fff" };
const tdStyle = { padding: "12px 14px", fontSize: 13, lineHeight: 1.5, color: "rgba(26,26,46,0.85)", verticalAlign: "top" };
const tdHighlight = { background: "rgba(255,118,118,0.07)", fontWeight: 600, color: NAVY };

function Why({ icon, title, body }) {
    return (
        <div style={{ background: SAND, border: `1px solid ${SAND_BORDER}`, borderRadius: 16, padding: 22 }}>
            <div style={{ marginBottom: 12 }}>{icon}</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{title}</h3>
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.65, opacity: 0.82 }}>{body}</p>
        </div>
    );
}

// Suppress unused-import warnings for icons referenced only in JSX text.
// eslint-disable-next-line no-unused-vars
const _suppress = { Check, X };
