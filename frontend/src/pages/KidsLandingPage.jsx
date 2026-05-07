/**
 * KidsLandingPage (`/kids/about`) — kid-friendly background of StockKids.
 *
 * The default landing for kidstocks.net visitors. Kid-friendly hero,
 * 3-step "how it works", 3 feature pillars, dual CTA (signup or live
 * demo). Bilingual via useKidsLang.
 */
import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, Brain, Coins, ShieldCheck, Lightbulb, Users } from "lucide-react";
import { useKidsLang, t } from "@/lib/kidsI18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

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

const wrapStyle = { maxWidth: 1080, margin: "0 auto", padding: "24px 20px 60px" };

export default function KidsLandingPage() {
    const { lang } = useKidsLang();

    return (
        <div style={shellStyle} data-testid="kids-landing-page">
            <header style={{ ...wrapStyle, paddingTop: 22, paddingBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Link to="/kids/about" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: NAVY }}>
                    <Sparkles size={26} color={ACCENT} strokeWidth={1.8} />
                    <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>StockKids</span>
                </Link>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <LanguageSwitcher />
                    <Link to="/kids/parent/login" data-testid="landing-parent-portal-link" style={{ fontSize: 13, color: NAVY, textDecoration: "none", fontWeight: 600, opacity: 0.85 }}>
                        {t(lang, "parents.eyebrow") === "For parents" ? "Parent portal" : "Portal orang tua"} →
                    </Link>
                    <Link to="/kids/login" data-testid="landing-login-link" style={{ fontSize: 13, color: NAVY, textDecoration: "none", fontWeight: 600, opacity: 0.85 }}>
                        {t(lang, "auth.login_submit")} →
                    </Link>
                </div>
            </header>

            {/* Hero */}
            <section style={{ ...wrapStyle, paddingTop: 36, paddingBottom: 36 }}>
                <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: ACCENT, fontWeight: 700, margin: 0 }}>
                    {t(lang, "landing.eyebrow")}
                </p>
                <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.4rem)", fontWeight: 700, lineHeight: 1.1, marginTop: 14, maxWidth: 880, letterSpacing: -0.5 }}>
                    {t(lang, "landing.hero_title")}
                </h1>
                <p style={{ fontSize: 18, lineHeight: 1.6, marginTop: 20, maxWidth: 700, color: "rgba(26,26,46,0.78)" }}>
                    {t(lang, "landing.hero_sub")}
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
                    <Link to="/kids/preview/AAPL?age=11-13" data-testid="landing-cta-preview" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "14px 24px", background: ACCENT, color: "#fff",
                        fontSize: 15, fontWeight: 700, borderRadius: 999, textDecoration: "none",
                    }}>
                        {t(lang, "landing.cta_primary")}
                    </Link>
                    <Link to="/kids/for-parents" data-testid="landing-cta-parents" style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        padding: "14px 24px", background: "transparent", color: NAVY,
                        fontSize: 15, fontWeight: 700, borderRadius: 999, textDecoration: "none",
                        border: `1.5px solid ${SAND_BORDER}`,
                    }}>
                        <Users size={16} /> {t(lang, "landing.cta_secondary")}
                    </Link>
                </div>
            </section>

            {/* How it works */}
            <section style={{ background: "#fff", borderTop: `1px solid ${SAND_BORDER}`, borderBottom: `1px solid ${SAND_BORDER}` }}>
                <div style={{ ...wrapStyle, paddingTop: 48, paddingBottom: 48 }}>
                    <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: GOLD, fontWeight: 700, margin: 0 }}>
                        {t(lang, "landing.how_eyebrow")}
                    </p>
                    <h2 style={{ fontSize: "clamp(1.6rem, 4vw, 2.4rem)", fontWeight: 700, marginTop: 10, marginBottom: 30 }}>
                        {t(lang, "landing.how_title")}
                    </h2>
                    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                        <Step icon={<Lightbulb size={22} color={ACCENT} />} title={t(lang, "landing.step1_title")} body={t(lang, "landing.step1_body")} />
                        <Step icon={<Brain size={22} color={ACCENT} />} title={t(lang, "landing.step2_title")} body={t(lang, "landing.step2_body")} />
                        <Step icon={<Coins size={22} color={ACCENT} />} title={t(lang, "landing.step3_title")} body={t(lang, "landing.step3_body")} />
                    </div>
                </div>
            </section>

            {/* Feature pillars */}
            <section style={{ ...wrapStyle, paddingTop: 48, paddingBottom: 36 }}>
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                    <Feature icon={<Brain size={26} color={GREEN} strokeWidth={1.8} />} title={t(lang, "landing.feature1_title")} body={t(lang, "landing.feature1_body")} />
                    <Feature icon={<Coins size={26} color={GOLD} strokeWidth={1.8} />} title={t(lang, "landing.feature2_title")} body={t(lang, "landing.feature2_body")} />
                    <Feature icon={<ShieldCheck size={26} color={ACCENT} strokeWidth={1.8} />} title={t(lang, "landing.feature3_title")} body={t(lang, "landing.feature3_body")} />
                </div>
            </section>

            {/* CTA strip */}
            <section style={{ ...wrapStyle, paddingTop: 28, paddingBottom: 56, textAlign: "center" }}>
                <Link to="/kids/signup" data-testid="landing-cta-signup" style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "16px 32px", background: NAVY, color: "#fff",
                    fontSize: 16, fontWeight: 700, borderRadius: 999, textDecoration: "none",
                }}>
                    {t(lang, "landing.cta_signup")} <ArrowRight size={18} />
                </Link>
                <p style={{ marginTop: 18 }}>
                    <Link to="/kids/preview/AAPL?age=11-13" style={{ color: ACCENT, fontWeight: 600, textDecoration: "none" }}>
                        {t(lang, "landing.cta_preview")}
                    </Link>
                </p>
                <p style={{ marginTop: 28, fontSize: 12, opacity: 0.55 }}>
                    {t(lang, "brand.educational_only")}
                </p>
            </section>
        </div>
    );
}

function Step({ icon, title, body }) {
    return (
        <div style={{ background: SAND, border: `1px solid ${SAND_BORDER}`, borderRadius: 16, padding: 22 }}>
            <div style={{ display: "inline-flex", padding: 10, background: "#fff", borderRadius: 12, marginBottom: 12 }}>
                {icon}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h3>
            <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, opacity: 0.78 }}>{body}</p>
        </div>
    );
}

function Feature({ icon, title, body }) {
    return (
        <div style={{ background: "#fff", border: `1px solid ${SAND_BORDER}`, borderRadius: 16, padding: 22 }}>
            <div style={{ marginBottom: 12 }}>{icon}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h3>
            <p style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, opacity: 0.78 }}>{body}</p>
        </div>
    );
}
