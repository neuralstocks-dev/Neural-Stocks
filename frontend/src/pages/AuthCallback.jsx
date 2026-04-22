import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
    const navigate = useNavigate();
    const { exchangeGoogleSession } = useAuth();
    const hasProcessed = useRef(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (hasProcessed.current) return;
        hasProcessed.current = true;

        const hash = window.location.hash || "";
        const match = hash.match(/session_id=([^&]+)/);
        if (!match) {
            navigate("/login", { replace: true });
            return;
        }
        // If we already have a JWT (e.g. double-invoked effect in StrictMode, or
        // tab reopened), skip the exchange to avoid consuming the one-time
        // session_id twice.
        if (localStorage.getItem("sai_token")) {
            window.history.replaceState({}, document.title, "/dashboard");
            navigate("/dashboard", { replace: true });
            return;
        }
        const session_id = match[1];

        (async () => {
            try {
                await exchangeGoogleSession(session_id);
                window.history.replaceState({}, document.title, "/dashboard");
                navigate("/dashboard", { replace: true });
            } catch (err) {
                const detail = err?.response?.data?.detail;
                setError(detail || "Google sign-in failed. Please try signing in again.");
                // Auto-redirect after giving user time to read
                setTimeout(() => navigate("/login", { replace: true }), 3500);
            }
        })();
    }, [exchangeGoogleSession, navigate]);

    return (
        <div className="min-h-screen grid place-items-center bg-background text-foreground p-8" data-testid="auth-callback">
            <div className="text-center max-w-md">
                {error ? (
                    <>
                        <p className="text-overline mb-2" style={{ color: "hsl(var(--sell))" }}>
                            Sign-in error
                        </p>
                        <p className="font-serif text-2xl" style={{ letterSpacing: "-0.01em" }}>
                            {error}
                        </p>
                        <p className="text-xs mt-4" style={{ color: "hsl(var(--text-secondary))" }}>
                            This usually means the Google session expired or was already used.
                            Please return to login and click <strong>Sign in with Google</strong> again.
                        </p>
                        <p className="text-overline mt-6">Redirecting back to login…</p>
                    </>
                ) : (
                    <>
                        <Loader2 className="animate-spin mx-auto" size={28} />
                        <p className="text-overline mt-4">Completing Google sign-in…</p>
                    </>
                )}
            </div>
        </div>
    );
}
