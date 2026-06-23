import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useExperimentVariant } from "@/hooks/useExperimentVariant";
import { LineChart, Lock, Mail } from "lucide-react";
import PublicTrendingTicker from "@/components/PublicTrendingTicker";
import TryNowBox from "@/components/TryNowBox";
import SocialLinks from "@/components/SocialLinks";

const TAGLINE_FALLBACK = {
    key: "analyst_why",
    render: { line1: "An analyst", line2: "who explains why.", color: "#F59E0B" },
};

const BG_IMAGE =
    "https://static.prod-images.emergentagent.com/jobs/449d5842-eb76-413d-bd7e-07775c2311fa/images/da6e03e36e932405f471d2bb00616910cb10e5c8d593c7714da3cd482bc97e88.png";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function LoginPage() {
    const { user, login, bootstrapping } = useAuth();
    const navigate = useNavigate();
    const tagline = useExperimentVariant("login_tagline", TAGLINE_FALLBACK);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showMobileForm, setShowMobileForm] = useState(false);

    if (!bootstrapping && user) return <Navigate to="/dashboard" replace />;

    const onSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(email.trim(), password);
            navigate("/dashboard");
        } catch (err) {
            setError(err?.response?.data?.detail || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full relative overflow-hidden" data-testid="login-page">
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: `url(${BG_IMAGE})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "brightness(0.55) saturate(1.1)",
                }}
            />
            <div
                className="absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse at 70% 50%, rgba(16,185,129,0.10), transparent 60%), linear-gradient(180deg, rgba(10,12,16,0.55) 0%, rgba(10,12,16,0.85) 100%)",
                }}
            />

            <div className="relative z-10 min-h-screen grid md:grid-cols-2">

                {/* Mobile landing — shown to guests before they tap Sign in */}
                {!showMobileForm && (
                    <div className="flex md:hidden flex-col justify-between p-8 min-h-screen">
                        <div className="flex items-center gap-3 text-white">
                            <div
                                style={{
                                    width: 34,
                                    height: 34,
                                    border: "1px solid rgba(255,255,255,0.4)",
                                    display: "grid",
                                    placeItems: "center",
                                }}
                            >
                                <LineChart size={16} strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col leading-none">
                                <span className="font-serif text-xl tracking-wide" style={{ letterSpacing: "0.08em", fontWeight: 600 }}>NEULAB</span>
                                <span className="text-overline" style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.58rem" }}>
                                    Neural Stock Intelligence&trade;
                                </span>
                            </div>
                        </div>

                        <div className="text-white mt-8">
                            <p className="text-overline mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                                Institutional-grade · Private preview
                            </p>
                            <h1
                                className="font-serif text-white"
                                style={{ fontSize: "clamp(2.4rem, 10vw, 3.6rem)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
                            >
                                Intelligence<br />
                                <em className="italic" style={{ color: tagline.render.color }}>
                                    that shows its work.
                                </em>
                            </h1>
                            <p className="mt-5 text-white/70 text-base leading-relaxed" style={{ fontFamily: "'Outfit', sans-serif" }}>
                                Deep equity research, reasoning you can interrogate, and signal-grade
                                alerts. Built for investors who demand the 'why' behind every call.
                            </p>

                            <div className="mt-6">
                                <TryNowBox variant="muted" className="mb-3" />
                                <PublicTrendingTicker variant="muted" windowDays={7} limit={8} ctaHref="/signup" ctaLabel="Sign up & run one →" />
                            </div>

                            <a
                                href="/stockdna"
                                className="mt-5 inline-flex items-center gap-3 px-5 py-3 transition-all w-full"
                                style={{
                                    background: "linear-gradient(135deg, rgba(197,164,94,0.14), rgba(124,58,237,0.10))",
                                    border: "1px solid rgba(197,164,94,0.45)",
                                    color: "#e8eaf6",
                                    textDecoration: "none",
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: "0.78rem",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>🧬</span>
                                <span>
                                    <span style={{ color: "#c5a45e", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.66rem", display: "block" }}>NEW · 5 MIN</span>
                                    <span style={{ fontWeight: 600 }}>What's your StockDNA?</span>
                                    <span style={{ opacity: 0.65, marginLeft: 6 }}>Discover your investor personality →</span>
                                </span>
                            </a>

                            <div className="mt-8 flex flex-col gap-3">
                                <button
                                    onClick={() => setShowMobileForm(true)}
                                    className="btn-primary w-full"
                                    style={{ background: "#F8FAFC", color: "#0A0C10", borderColor: "#F8FAFC" }}
                                >
                                    Sign in
                                </button>
                                <Link
                                    to="/signup"
                                    className="w-full text-center py-3 text-sm font-medium"
                                    style={{
                                        color: "#fff",
                                        border: "1px solid rgba(255,255,255,0.3)",
                                        textDecoration: "none",
                                        display: "block",
                                    }}
                                >
                                    Create account
                                </Link>
                            </div>
                        </div>

                        <p className="text-overline mt-8" style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.6rem" }}>
                            &copy; 2026 NeuLab Inc. &middot; Neural Stock Intelligence&trade; &middot; Not financial advice
                        </p>
                    </div>
                )}

                {/* Desktop left panel — always visible on md+ */}
                <div className="hidden md:flex flex-col justify-between p-12 lg:p-16">
                    <div className="flex items-center gap-3 text-white">
                        <div
                            style={{
                                width: 34,
                                height: 34,
                                border: "1px solid rgba(255,255,255,0.4)",
                                display: "grid",
                                placeItems: "center",
                            }}
                        >
                            <LineChart size={16} strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="font-serif text-xl tracking-wide" style={{ letterSpacing: "0.08em", fontWeight: 600 }}>NEULAB</span>
                            <span
                                className="text-overline"
                                style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.58rem" }}
                            >
                                Neural Stock Intelligence&trade;
                            </span>
                        </div>
                    </div>

                    <div className="text-white max-w-lg">
                        <p
                            className="text-overline mb-6"
                            style={{ color: "rgba(255,255,255,0.55)" }}
                        >
                            Institutional-grade · Private preview
                        </p>
                        <h1
                            className="font-serif hero-number text-white"
                            style={{ fontSize: "clamp(2.6rem, 5vw, 4.2rem)" }}
                            data-testid={`login-tagline-${tagline.key}`}
                        >
                            {tagline.render.line1}
                            <br />
                            <em className="italic" style={{ color: tagline.render.color }}>
                                {tagline.render.line2}
                            </em>
                        </h1>
                        <p
                            className="mt-8 text-white/70 text-base leading-relaxed max-w-md"
                            style={{ fontFamily: "'Outfit', sans-serif" }}
                        >
                            Deep equity research, reasoning you can interrogate, and signal-grade
                            alerts — all powered by AI. Built for investors who demand the
                            'why' behind every call.
                        </p>

                        <div className="mt-8 max-w-xl">
                            <TryNowBox variant="muted" className="mb-3" />
                            <PublicTrendingTicker variant="muted" windowDays={7} limit={8} ctaHref="/signup" ctaLabel="Sign up & run one →" />
                        </div>

                        {/* StockDNA — public 5-minute investor-personality
                            quiz. Open to guests (no auth required) so it
                            doubles as a top-of-funnel lead magnet. */}
                        <a
                            href="/stockdna"
                            data-testid="login-stockdna-cta"
                            className="mt-6 inline-flex items-center gap-3 px-5 py-3 transition-all"
                            style={{
                                background: "linear-gradient(135deg, rgba(197,164,94,0.14), rgba(124,58,237,0.10))",
                                border: "1px solid rgba(197,164,94,0.45)",
                                color: "#e8eaf6",
                                textDecoration: "none",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: "0.78rem",
                                letterSpacing: "0.08em",
                            }}
                        >
                            <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>🧬</span>
                            <span>
                                <span style={{ color: "#c5a45e", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "0.66rem", display: "block" }}>NEW · 5 MIN</span>
                                <span style={{ fontWeight: 600 }}>What's your StockDNA?</span>
                                <span style={{ opacity: 0.65, marginLeft: 6 }}>Discover your investor personality →</span>
                            </span>
                        </a>
                    </div>

                    <div
                        className="text-overline space-y-3"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                        <SocialLinks variant="muted" size="sm" />
                        <p>
                            <a
                                href="https://kidstocks.net"
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="login-footer-kids-link"
                                style={{ color: "rgba(255, 200, 100, 0.85)", textDecoration: "none", marginRight: 14 }}
                            >
                                &#10024; For Kids 8-18 &rarr;
                            </a>
                            <span>&copy; 2026 NeuLab Inc. · Neural Stock Intelligence&trade; · Not financial advice</span>
                        </p>
                    </div>
                </div>

                {/* Login form — always visible on desktop, shown on mobile only after tapping Sign in */}
                <div className={`${showMobileForm ? "flex" : "hidden md:flex"} items-center justify-center p-6 md:p-12`}>
                    <div
                        className="w-full max-w-md p-8 md:p-10"
                        style={{
                            background: "rgba(10, 12, 16, 0.72)",
                            backdropFilter: "blur(24px)",
                            WebkitBackdropFilter: "blur(24px)",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                        data-testid="login-card"
                    >
                        {/* Back button on mobile */}
                        {showMobileForm && (
                            <button
                                onClick={() => setShowMobileForm(false)}
                                className="text-white/50 text-sm mb-4 flex items-center gap-1"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            >
                                ← Back
                            </button>
                        )}
                        <p className="text-overline mb-3" style={{ color: "#94A3B8" }}>
                            Member sign-in
                        </p>
                        <h2
                            className="font-serif text-white"
                            style={{ fontSize: "2.4rem", lineHeight: 1, letterSpacing: "-0.02em" }}
                        >
                            Welcome back.
                        </h2>
                        <p
                            className="mt-3 text-white/60 text-sm"
                            style={{ fontFamily: "'Outfit', sans-serif" }}
                        >
                            Sign in to review your watchlist & verdicts.
                        </p>

                        <form onSubmit={onSubmit} className="space-y-4">
                            <div>
                                <label className="text-overline block mb-2" style={{ color: "#94A3B8" }}>
                                    Email
                                </label>
                                <div className="relative">
                                    <Mail
                                        size={14}
                                        strokeWidth={1.5}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                                    />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="you@firm.com"
                                        className="input-base pl-9"
                                        style={{
                                            background: "rgba(255,255,255,0.04)",
                                            borderColor: "rgba(255,255,255,0.12)",
                                            color: "#fff",
                                        }}
                                        data-testid="login-email-input"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-overline block mb-2" style={{ color: "#94A3B8" }}>
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock
                                        size={14}
                                        strokeWidth={1.5}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                                    />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        placeholder="••••••••"
                                        className="input-base pl-9"
                                        style={{
                                            background: "rgba(255,255,255,0.04)",
                                            borderColor: "rgba(255,255,255,0.12)",
                                            color: "#fff",
                                        }}
                                        data-testid="login-password-input"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div
                                    className="text-sm py-2 px-3 font-mono"
                                    style={{
                                        color: "hsl(var(--sell))",
                                        background: "hsl(var(--sell-bg))",
                                        border: "1px solid hsl(var(--sell-border))",
                                        borderRadius: 2,
                                    }}
                                    data-testid="login-error"
                                >
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full mt-4"
                                data-testid="login-submit-button"
                                style={{ background: "#F8FAFC", color: "#0A0C10", borderColor: "#F8FAFC" }}
                            >
                                {loading ? "Signing in…" : "Sign in"}
                            </button>
                        </form>

                        <p className="text-white/60 text-sm mt-4 text-center"><a href="/reset-password" style={{ color: "#b8994f", textDecoration: "none", fontSize: "13px" }}>Forgot password?</a></p>

                        <p className="text-white/60 text-sm mt-6 text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
                            New here?{" "}
                            <Link to="/signup" className="link-underline text-white font-medium" data-testid="link-to-signup">
                                Create an account
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
