import React, { createContext, useEffect, useState, useCallback } from "react";
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
        const token = localStorage.getItem("sai_token");
        if (!token) {
            setBootstrapping(false);
            return;
        }
        api
            .get("/auth/me")
            .then((r) => {
                setUser(r.data);
                localStorage.setItem("sai_user", JSON.stringify(r.data));
            })
            .catch(() => {
                localStorage.removeItem("sai_token");
                localStorage.removeItem("sai_user");
                setUser(null);
            })
            .finally(() => setBootstrapping(false));
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

    return (
        <AuthContext.Provider
            value={{ user, bootstrapping, login, signup, logout, exchangeGoogleSession, refreshUser }}
        >
            {children}
        </AuthContext.Provider>
    );
}
