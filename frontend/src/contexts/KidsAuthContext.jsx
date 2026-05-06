/**
 * KidsAuthContext — separate auth state from adult Neural.
 *
 * Storage: `sai_kid_token` in localStorage (different key from adult
 * `sai_token`) — strict isolation; both products can be logged in
 * simultaneously without conflict (handy for testing).
 *
 * The kid axios instance uses an Authorization header with the kid
 * token; the adult axios instance is untouched. A logged-in kid
 * cannot accidentally call adult APIs because we don't share clients.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { API_BASE } from "@/lib/api";

const KID_TOKEN_KEY = "sai_kid_token";

// Dedicated axios instance — bearer-token, never touches adult cookies.
const kidsApi = axios.create({ baseURL: API_BASE });
kidsApi.interceptors.request.use((cfg) => {
    const t = localStorage.getItem(KID_TOKEN_KEY);
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
});

const Ctx = createContext(null);

export function KidsAuthProvider({ children }) {
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const t = localStorage.getItem(KID_TOKEN_KEY);
        if (!t) {
            setStudent(null);
            setLoading(false);
            return;
        }
        try {
            const r = await kidsApi.get("/kids/auth/me");
            setStudent(r.data);
        } catch {
            localStorage.removeItem(KID_TOKEN_KEY);
            setStudent(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const login = useCallback(async (email, password) => {
        const r = await kidsApi.post("/kids/auth/login", { email, password });
        localStorage.setItem(KID_TOKEN_KEY, r.data.token);
        setStudent(r.data.student);
        return r.data.student;
    }, []);

    const signup = useCallback(async (body) => {
        const r = await kidsApi.post("/kids/auth/signup", body);
        // 8-12 → response has no token; the kid waits for parental consent.
        // 13+ → response has a token; we set it like a login.
        if (r.data?.token) {
            localStorage.setItem(KID_TOKEN_KEY, r.data.token);
            setStudent(r.data.student);
        }
        return r.data;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(KID_TOKEN_KEY);
        setStudent(null);
    }, []);

    const value = useMemo(
        () => ({ student, loading, refresh, login, signup, logout, kidsApi }),
        [student, loading, refresh, login, signup, logout]
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useKidsAuth() {
    const v = useContext(Ctx);
    if (!v) throw new Error("useKidsAuth must be used inside KidsAuthProvider");
    return v;
}

export { kidsApi };
