/**
 * StockKids consent flow — two public pages:
 *
 *  • KidsAwaitingConsentPage at /kids/awaiting-consent
 *      Shown to under-13 kids right after signup. Tells them we sent
 *      their parent a link, with a resend button.
 *
 *  • KidsParentalConsentPage at /kids/parental-consent/:token
 *      Parent-facing review + consent form. Shows what data we collect,
 *      who their child is, and asks for full name + an explicit "I agree"
 *      checkbox before submitting.
 *
 * Both pages are public (no kid auth) — the consent token IS the
 * credential for the parent flow, the email + resend button is the
 * credential for the awaiting flow.
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Sparkles, Mail, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Heart } from "lucide-react";
import { API_BASE } from "@/lib/api";

const ACCENT = "#ff7676";
const NAVY = "#1a1a2e";
const SHELL_BG = "#fff8f0";
const GREEN = "#76b876";

const shellStyle = {
    minHeight: "100vh",
    background: SHELL_BG,
    fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
    color: NAVY,
    padding: "24px 20px",
};

const cardStyle = {
    maxWidth: 560,
    margin: "0 auto",
    background: "#fff",
    padding: 28,
    borderRadius: 24,
    boxShadow: "0 8px 24px rgba(26,26,46,0.08), 0 2px 6px rgba(26,26,46,0.04)",
};

const headerStyle = { textAlign: "center", marginTop: 12, marginBottom: 24 };

function BrandHeader() {
    return (
        <div style={headerStyle}>
            <Link to="/kids/login" style={{ textDecoration: "none", color: "inherit", display: "inline-flex", alignItems: "center", gap: 10 }}>
                <Sparkles size={28} color={ACCENT} strokeWidth={1.8} />
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: 1 }}>StockKids</span>
            </Link>
            <p style={{ fontSize: 13, opacity: 0.6, marginTop: 6 }}>Learn investing with AI · by NeuLab</p>
        </div>
    );
}

// ===========================================================================
// Awaiting consent page — kid lands here after under-13 signup
// ===========================================================================
export function KidsAwaitingConsentPage() {
    const [params] = useSearchParams();
    const email = params.get("email") || "";
    const parentEmail = params.get("parent") || "";
    const [resending, setResending] = useState(false);
    const [resendOk, setResendOk] = useState(false);
    const [resendErr, setResendErr] = useState("");

    const onResend = async () => {
        setResending(true); setResendErr(""); setResendOk(false);
        try {
            await axios.post(`${API_BASE}/kids/auth/resend-consent`, { email });
            setResendOk(true);
        } catch (err) {
            setResendErr(err?.response?.data?.detail || "Couldn't resend right now — try again in a minute.");
        } finally {
            setResending(false);
        }
    };

    return (
        <div style={shellStyle} data-testid="kids-awaiting-consent-page">
            <BrandHeader />
            <div style={cardStyle}>
                <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <div style={{ display: "inline-flex", padding: 18, background: "#fff8f0", borderRadius: "50%" }}>
                        <Mail size={36} color={ACCENT} strokeWidth={1.6} />
                    </div>
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
                    Almost there!
                </h2>
                <p style={{ fontSize: 15, lineHeight: 1.65, textAlign: "center", opacity: 0.85 }}>
                    Because you're under 13, we need your parent or guardian to give us permission first. We just sent a quick email to{" "}
                    <strong style={{ color: NAVY }}>{parentEmail || "your parent"}</strong> with a link they can click.
                </p>
                <div style={{ background: "#fff8f0", border: "1.5px solid #e5d5b8", borderRadius: 14, padding: 16, marginTop: 20, fontSize: 13, lineHeight: 1.6 }}>
                    <p style={{ fontWeight: 700, marginBottom: 6 }}>What happens next?</p>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                        <li>Your parent reads what data we collect (it's short!)</li>
                        <li>They click "I give consent" and type their name</li>
                        <li>You get 10,000 StockCoins to start learning 🎉</li>
                    </ol>
                </div>

                <div style={{ marginTop: 24, padding: 16, borderRadius: 12, border: "1px dashed #e5d5b8" }}>
                    <p style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>Didn't get the email?</p>
                    <button
                        onClick={onResend}
                        disabled={resending || resendOk}
                        data-testid="kids-resend-consent"
                        style={{
                            padding: "10px 18px",
                            background: resendOk ? GREEN : "#fff",
                            color: resendOk ? "#fff" : ACCENT,
                            border: `1.5px solid ${resendOk ? GREEN : ACCENT}`,
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: resending ? "wait" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        {resending ? <Loader2 size={14} className="animate-spin" /> : resendOk ? <CheckCircle2 size={14} /> : <Mail size={14} />}
                        {resendOk ? "Email resent!" : resending ? "Sending…" : "Resend the email"}
                    </button>
                    {resendErr && <p style={{ color: ACCENT, fontSize: 12, marginTop: 8 }}>{resendErr}</p>}
                </div>

                <p style={{ marginTop: 24, fontSize: 12, textAlign: "center", opacity: 0.6 }}>
                    Already approved? <Link to="/kids/login" style={{ color: ACCENT, fontWeight: 700 }} data-testid="kids-go-login-from-awaiting">Try logging in →</Link>
                </p>
            </div>
        </div>
    );
}

// ===========================================================================
// Parental consent page — parent reviews + consents
// ===========================================================================
export function KidsParentalConsentPage() {
    const { token } = useParams();
    const [preview, setPreview] = useState(null);
    const [loadErr, setLoadErr] = useState("");
    const [parentName, setParentName] = useState("");
    const [agree, setAgree] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitErr, setSubmitErr] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await axios.get(`${API_BASE}/kids/auth/parental-consent/${token}`);
                if (!cancelled) setPreview(r.data);
            } catch (err) {
                if (!cancelled) setLoadErr(err?.response?.data?.detail || "We couldn't load this consent link.");
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!agree || !parentName.trim()) return;
        setSubmitting(true); setSubmitErr("");
        try {
            await axios.post(`${API_BASE}/kids/auth/parental-consent/${token}`, {
                parent_full_name: parentName.trim(),
                agree: true,
            });
            setDone(true);
        } catch (err) {
            setSubmitErr(err?.response?.data?.detail || "Couldn't submit your consent — try again.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loadErr) {
        return (
            <div style={shellStyle} data-testid="kids-parent-consent-page">
                <BrandHeader />
                <div style={cardStyle}>
                    <div style={{ textAlign: "center" }}>
                        <AlertCircle size={36} color={ACCENT} />
                        <h2 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>This link can't be used</h2>
                        <p style={{ fontSize: 14, opacity: 0.8, marginTop: 8, lineHeight: 1.55 }}>{loadErr}</p>
                        <p style={{ fontSize: 13, marginTop: 18, opacity: 0.7 }}>
                            Ask your child to <strong>request a new link</strong> from the StockKids signup page.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (!preview) {
        return (
            <div style={shellStyle}>
                <BrandHeader />
                <div style={{ textAlign: "center", marginTop: 40 }}>
                    <Loader2 className="animate-spin" />
                </div>
            </div>
        );
    }

    if (preview.already_consented || done) {
        return (
            <div style={shellStyle} data-testid="kids-parent-consent-page">
                <BrandHeader />
                <div style={cardStyle}>
                    <div style={{ textAlign: "center" }}>
                        <CheckCircle2 size={48} color={GREEN} />
                        <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>
                            All set — thank you!
                        </h2>
                        <p style={{ fontSize: 15, opacity: 0.85, marginTop: 10, lineHeight: 1.6 }}>
                            <strong>{preview.kid_full_name}</strong>'s StockKids account is now active.
                            They can log in any time at <Link to="/kids/login" style={{ color: ACCENT, fontWeight: 700 }}>kids/login</Link>.
                        </p>
                        <p style={{ fontSize: 13, marginTop: 18, opacity: 0.7, lineHeight: 1.55 }}>
                            You can withdraw consent or request data deletion any time by replying to the consent email.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={shellStyle} data-testid="kids-parent-consent-page">
            <BrandHeader />
            <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <ShieldCheck size={22} color={ACCENT} />
                    <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Parental Consent · COPPA</h2>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.65, opacity: 0.85 }}>
                    Your child wants to sign up for <strong>StockKids</strong>, an AI-powered educational stock-investing app. Because they're under 13, US law (the Children's Online Privacy Protection Act) requires us to get your permission first.
                </p>

                <div style={{ background: "#fff8f0", border: `1.5px solid #e5d5b8`, borderRadius: 14, padding: 18, marginTop: 18 }} data-testid="kid-preview">
                    <p style={{ fontSize: 11, letterSpacing: 1.5, color: "#7a5a00", textTransform: "uppercase", margin: 0, fontWeight: 700 }}>Account awaiting your approval</p>
                    <p style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>{preview.kid_full_name}</p>
                    <p style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                        {preview.kid_email} · age {preview.kid_age_at_signup}
                    </p>
                </div>

                <div style={{ marginTop: 22 }}>
                    <p style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a5a00", fontWeight: 700, marginBottom: 8 }}>What we collect</p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                        <li>Email + hashed password (we never store passwords as text)</li>
                        <li>First name + birth year (to choose age-appropriate vocabulary)</li>
                        <li>Virtual trades and reflection journals (educational data only)</li>
                    </ul>
                    <p style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a5a00", fontWeight: 700, marginTop: 18, marginBottom: 8 }}>What we never do</p>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                        <li>Sell or share their data with third parties for marketing</li>
                        <li>Show ads, in-app purchases, or real-money trading</li>
                        <li>Use real money — every "trade" is virtual StockCoins</li>
                        <li>Contact them outside the app without your permission</li>
                    </ul>
                </div>

                <form onSubmit={onSubmit} style={{ marginTop: 24 }} data-testid="kid-consent-form">
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                        Your full name <span style={{ opacity: 0.6, fontWeight: 400 }}>(parent or legal guardian)</span>
                    </label>
                    <input
                        data-testid="parent-full-name"
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        required
                        minLength={2}
                        style={{
                            width: "100%",
                            padding: "12px 14px",
                            border: "1.5px solid #e5d5b8",
                            borderRadius: 12,
                            fontSize: 15,
                            fontFamily: "inherit",
                            background: "#fff8f0",
                            boxSizing: "border-box",
                            color: NAVY,
                            marginBottom: 16,
                        }}
                    />
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, lineHeight: 1.55, cursor: "pointer" }}>
                        <input
                            type="checkbox"
                            data-testid="parent-agree-checkbox"
                            checked={agree}
                            onChange={(e) => setAgree(e.target.checked)}
                            style={{ marginTop: 3, flexShrink: 0 }}
                        />
                        <span>
                            I am the parent or legal guardian of <strong>{preview.kid_full_name}</strong>, and I give my consent for StockKids to collect and process their information as described above. I understand I can withdraw consent at any time by emailing the support address in our footer.
                        </span>
                    </label>
                    {submitErr && <p style={{ color: ACCENT, fontSize: 12, marginTop: 12 }}>{submitErr}</p>}
                    <button
                        type="submit"
                        disabled={submitting || !agree || !parentName.trim()}
                        data-testid="parent-consent-submit"
                        style={{
                            width: "100%",
                            padding: 14,
                            marginTop: 20,
                            background: agree && parentName.trim() ? ACCENT : "#ccc",
                            color: "#fff",
                            border: "none",
                            borderRadius: 14,
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: submitting || !agree || !parentName.trim() ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                        }}
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Heart size={16} /> Give consent &amp; activate account</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
