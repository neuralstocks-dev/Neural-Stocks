import React, { createContext, useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const raw = localStorage.getItem("sai_user");
        return raw ? JSON.parse(raw) : null;
    });
    const [bootstrapping, setBootstrapping] = useState(true);

    useEffect(() => {
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
                    // Token expired / already used / bogus — fall through
                    // to normal bootstrap so the user lands on /login if
                    // they aren't already authenticated. Strip the bad
                    // param either way to avoid retry loops.
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
