import React, { createContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const raw = localStorage.getItem("sai_user");
        return raw ? JSON.parse(raw) : null;
    });
    const [bootstrapping, setBootstrapping] = useState(true);
    // React.StrictMode (and any future double-mount scenarios) intentionally
    // fires this effect twice in dev. The magic-link redemption is a
    // *one-time-use* server-side operation — the second fire would always
    // 401 and race the first fire's success state, breaking auto-login.
    // This ref guarantees the bootstrap (and especially the magic redeem)
    // runs exactly once per AuthProvider lifetime.
    const bootstrappedRef = useRef(false);

    useEffect(() => {
        if (bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        // If we're returning from Google OAuth, skip bootstrap — AuthCallback will handle it
        if (window.location.hash?.includes("session_id=")) {
            setBootstrapping(false);
            return;
        }

        // Magic-link auto-login from Telegram alerts. URL format:
        //   /analysis/AAPL?autorun=1&t=<one-time-uuid>
        // We redeem the token, swap our auth state for the returned JWT,
        // then strip the param so the URL doesn't leak via shares/history.
        // Runs BEFORE the regular session bootstrap so we don't redirect
        // through /login first.
        const redeemMagicAndBootstrap = async () => {
            const params = new URLSearchParams(window.location.search);
            const magicTok = params.get("t");
            if (magicTok) {
                try {
                    const { data } = await api.post("/auth/magic", { token: magicTok });
                    localStorage.setItem("sai_token", data.token);
                    localStorage.setItem("sai_user", JSON.stringify(data.user));
                    setUser(data.user);
                    // Strip the magic token from the URL — keep all other
                    // query params (autorun=1 etc.) intact.
                    params.delete("t");
                    const remaining = params.toString();
                    const cleanUrl =
                        window.location.pathname +
                        (remaining ? "?" + remaining : "") +
                        window.location.hash;
                    window.history.replaceState({}, "", cleanUrl);
                    setBootstrapping(false);
                    return;
                } catch {
                    // Token expired / already used / bogus — strip the
                    // bad param so the user doesn't end up in a retry
                    // loop, then fall through to normal session bootstrap
                    // below. If they have an existing JWT it'll refresh
                    // their session; if not, ProtectedRoute redirects
                    // them to /login as expected.
                    params.delete("t");
                    const remaining = params.toString();
                    window.history.replaceState(
                        {}, "",
                        window.location.pathname +
                            (remaining ? "?" + remaining : "") +
                            window.location.hash
                    );
                }
            }

            const token = localStorage.getItem("sai_token");
            if (!token) {
                setBootstrapping(false);
                return;
            }
            try {
                const r = await api.get("/auth/me");
                setUser(r.data);
                localStorage.setItem("sai_user", JSON.stringify(r.data));
            } catch {
                localStorage.removeItem("sai_token");
                localStorage.removeItem("sai_user");
                setUser(null);
            } finally {
                setBootstrapping(false);
            }
        };
        redeemMagicAndBootstrap();
    }, []);

    const login = useCallback(async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        localStorage.setItem("sai_token", data.token);
        localStorage.setItem("sai_user", JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
    }, []);

    const signup = useCallback(async (email, password, full_name) => {
        const { data } = await api.post("/auth/register", {
            email,
            password,
            full_name,
        });
        localStorage.setItem("sai_token", data.token);
        localStorage.setItem("sai_user", JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
    }, []);

    const exchangeGoogleSession = useCallback(async (session_id) => {
        const { data } = await api.post("/auth/google/session", { session_id });
        localStorage.setItem("sai_token", data.token);
        localStorage.setItem("sai_user", JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const r = await api.get("/auth/me");
            setUser(r.data);
            localStorage.setItem("sai_user", JSON.stringify(r.data));
            return r.data;
        } catch {
            return null;
        }
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem("sai_token");
        localStorage.removeItem("sai_user");
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, bootstrapping, login, signup, logout, exchangeGoogleSession, refreshUser }),
        [user, bootstrapping, login, signup, logout, exchangeGoogleSession, refreshUser]
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
