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

    const logout = useCallback(() => {
        localStorage.removeItem("sai_token");
        localStorage.removeItem("sai_user");
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, bootstrapping, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
