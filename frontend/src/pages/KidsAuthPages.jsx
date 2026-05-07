/**
 * KidsLoginPage + KidsSignupPage — entry points for KidStocks.
 *
 * Two pages in one file (small file) — minimises route boilerplate.
 * Bright form layout, oversized inputs (kids on phones), helpful
 * inline copy ("you must be 13 or older"), single submit button.
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import KidsBrandMark from "@/components/KidsBrandMark";
import { useKidsAuth } from "@/contexts/KidsAuthContext";
import { useKidsLang, t } from "@/lib/kidsI18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const SHELL_BG = "#fff8f0";
const ACCENT = "#ff7676";

const sharedShellStyle = {
    minHeight: "100vh",
    background: SHELL_BG,
    fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
    color: "#1a1a2e",
    padding: "24px 20px",
};

const headerStyle = {
    textAlign: "center",
    marginTop: 12,
    marginBottom: 28,
};

const cardStyle = {
    maxWidth: 420,
    margin: "0 auto",
    background: "#fff",
    padding: 24,
    borderRadius: 24,
    boxShadow: "0 8px 24px rgba(26,26,46,0.08), 0 2px 6px rgba(26,26,46,0.04)",
};

const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    border: "1.5px solid #e5d5b8",
    borderRadius: 14,
    fontSize: 15,
    fontFamily: "inherit",
    background: "#fff8f0",
    marginBottom: 12,
    boxSizing: "border-box",
    color: "#1a1a2e",
};

const labelStyle = {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    display: "block",
    color: "#1a1a2e",
};

const submitStyle = (busy) => ({
    width: "100%",
    padding: 14,
    background: ACCENT,
    color: "#fff",
    border: "none",
    borderRadius: 14,
    fontSize: 15,
    fontWeight: 700,
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.7 : 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
});

function ErrorBox({ msg }) {
    if (!msg) return null;
    return (
        <div
            data-testid="kids-form-error"
            style={{
                background: "#fff0f0",
                border: "1px solid #ffb4b4",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#c43a3a",
                marginBottom: 12,
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
            }}
        >
            <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{msg}</span>
        </div>
    );
}

function BrandHeader() {
    const { lang } = useKidsLang();
    return (
        <div style={headerStyle}>
            <KidsBrandMark size={32} wordmarkSize={26} color="inherit" taglineOpacity={0.6} />
            <p style={{ fontSize: 13, opacity: 0.6, marginTop: 10 }}>{t(lang, "brand.tagline")}</p>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <LanguageSwitcher />
            </div>
        </div>
    );
}

export function KidsLoginPage() {
    const { login } = useKidsAuth();
    const navigate = useNavigate();
    const { lang } = useKidsLang();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            await login(email, password);
            navigate("/kids/dashboard");
        } catch (err) {
            setError(err?.response?.data?.detail || t(lang, "auth.error_login"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={sharedShellStyle} data-testid="kids-login-page">
            <BrandHeader />
            <form style={cardStyle} onSubmit={onSubmit}>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, textAlign: "center" }}>{t(lang, "auth.welcome_back")}</h2>
                <ErrorBox msg={error} />
                <label style={labelStyle}>{t(lang, "auth.email_label")}</label>
                <input
                    style={inputStyle}
                    type="email"
                    autoComplete="email"
                    required
                    data-testid="kids-login-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <label style={labelStyle}>{t(lang, "auth.password_label")}</label>
                <input
                    style={inputStyle}
                    type="password"
                    autoComplete="current-password"
                    required
                    data-testid="kids-login-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <button type="submit" disabled={busy} data-testid="kids-login-submit" style={submitStyle(busy)}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <>{t(lang, "auth.login_submit")} <ArrowRight size={16} /></>}
                </button>
                <p style={{ marginTop: 18, fontSize: 13, textAlign: "center", color: "#1a1a2e", opacity: 0.7 }}>
                    {t(lang, "auth.login_no_account")}{" "}
                    <Link to="/kids/signup" style={{ color: ACCENT, fontWeight: 700, textDecoration: "none" }} data-testid="kids-go-signup">
                        {t(lang, "auth.login_signup_link")}
                    </Link>
                </p>
            </form>
        </div>
    );
}

export function KidsSignupPage() {
    const { signup } = useKidsAuth();
    const navigate = useNavigate();
    const { lang } = useKidsLang();
    const [form, setForm] = useState({
        full_name: "",
        email: "",
        password: "",
        birthdate: "",
        parent_email: "",
    });
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const update = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

    const onSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            const result = await signup({
                full_name: form.full_name,
                email: form.email,
                password: form.password,
                birthdate: form.birthdate,
                parent_email: form.parent_email || undefined,
                lang,
            });
            if (result?.status === "awaiting_parental_consent") {
                navigate(`/kids/awaiting-consent?email=${encodeURIComponent(form.email)}&parent=${encodeURIComponent(form.parent_email)}`);
                return;
            }
            navigate("/kids/dashboard");
        } catch (err) {
            setError(err?.response?.data?.detail || t(lang, "auth.error_signup"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={sharedShellStyle} data-testid="kids-signup-page">
            <BrandHeader />
            <form style={cardStyle} onSubmit={onSubmit}>
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, textAlign: "center" }}>{t(lang, "auth.signup_title")}</h2>
                <ErrorBox msg={error} />
                <label style={labelStyle}>{t(lang, "auth.signup_name_label")}</label>
                <input style={inputStyle} required data-testid="kids-signup-name" value={form.full_name} onChange={update("full_name")} placeholder="Alex Tester" />
                <label style={labelStyle}>{t(lang, "auth.email_label")}</label>
                <input style={inputStyle} required type="email" autoComplete="email" data-testid="kids-signup-email" value={form.email} onChange={update("email")} />
                <label style={labelStyle}>{t(lang, "auth.signup_password_label")}</label>
                <input style={inputStyle} required type="password" minLength={8} autoComplete="new-password" data-testid="kids-signup-password" value={form.password} onChange={update("password")} />
                <label style={labelStyle}>{t(lang, "auth.signup_birthday_label")} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {t(lang, "auth.signup_birthday_hint")}</span></label>
                <input style={inputStyle} required type="date" data-testid="kids-signup-birthdate" value={form.birthdate} onChange={update("birthdate")} />
                <label style={labelStyle}>{t(lang, "auth.signup_parent_label")} <span style={{ fontWeight: 400, opacity: 0.6 }}>· {t(lang, "auth.signup_parent_hint")}</span></label>
                <input style={inputStyle} type="email" data-testid="kids-signup-parent-email" value={form.parent_email} onChange={update("parent_email")} />
                <button type="submit" disabled={busy} data-testid="kids-signup-submit" style={submitStyle(busy)}>
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <>{t(lang, "auth.signup_submit")} <ArrowRight size={16} /></>}
                </button>
                <p style={{ marginTop: 12, fontSize: 11, textAlign: "center", color: "#1a1a2e", opacity: 0.6, lineHeight: 1.5 }}>
                    {t(lang, "auth.signup_disclaimer")}
                </p>
                <p style={{ marginTop: 12, fontSize: 13, textAlign: "center", color: "#1a1a2e", opacity: 0.7 }}>
                    {t(lang, "auth.signup_have_account")}{" "}
                    <Link to="/kids/login" style={{ color: ACCENT, fontWeight: 700, textDecoration: "none" }} data-testid="kids-go-login">
                        {t(lang, "auth.signup_login_link")}
                    </Link>
                </p>
            </form>
        </div>
    );
}
