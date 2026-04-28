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
function googleSignIn() {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
}

export default function LoginPage() {
    const { user, login, bootstrapping } = useAuth();
    const navigate = useNavigate();
    const tagline = useExperimentVariant("login_tagline", TAGLINE_FALLBACK);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

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
                            alerts — all powered by Claude. Built for investors who demand the
                            'why' behind every call.
                        </p>

                        <div className="mt-8 max-w-xl">
                            <TryNowBox variant="muted" className="mb-3" />
                            <PublicTrendingTicker variant="muted" windowDays={7} limit={8} ctaHref="/signup" ctaLabel="Sign up & run one →" />
                        </div>
                    </div>

                    <div
                        className="text-overline space-y-3"
                        style={{ color: "rgba(255,255,255,0.4)" }}
                    >
                        <SocialLinks variant="muted" size="sm" />
                        <p>© 2026 NeuLab Inc. · Neural Stock Intelligence™ · Not financial advice</p>
                    </div>
                </div>

                <div className="flex items-center justify-center p-6 md:p-12">
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

                        <button
                            type="button"
                            onClick={googleSignIn}
                            className="w-full mt-6 flex items-center justify-center gap-3 py-3 font-ui font-medium text-sm transition-colors"
                            style={{
                                background: "#fff",
                                color: "#0A0C10",
                                borderRadius: 2,
                                border: "1px solid #fff",
                            }}
                            data-testid="google-signin-button"
                        >
                            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.3 0-11.5-5.2-11.5-11.5S17.7 12.5 24 12.5c2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.7 6.3 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/>
                                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8c1.8-4.3 6-7 10.9-7 2.9 0 5.5 1.1 7.5 2.9l5.7-5.7C33.7 6.3 29.1 4.5 24 4.5 16.6 4.5 10.2 8.6 6.3 14.7z"/>
                                <path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.7 13-4.7l-6-5c-2 1.4-4.5 2.2-7 2.2-5.4 0-9.9-3.1-11.3-7.5l-6.6 5.1C9.4 39.2 16 43.5 24 43.5z"/>
                                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2 3.9-3.8 5.3l6 5c-.4.3 6.5-4.7 6.5-14.3 0-1.2-.1-2.4-.4-3.5z"/>
                            </svg>
                            Sign in with Google
                        </button>

                        <div className="my-6 flex items-center gap-3" style={{ color: "rgba(255,255,255,0.35)" }}>
                            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
                            <span className="text-overline" style={{ fontSize: "0.56rem" }}>or with email</span>
                            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
                        </div>

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
