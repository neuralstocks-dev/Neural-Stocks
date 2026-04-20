import React, { createContext, useEffect, useState, useCallback } from "react";

export const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => localStorage.getItem("sai_theme") || "dark");

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove("dark", "light");
        root.classList.add(theme);
        localStorage.setItem("sai_theme", theme);
    }, [theme]);

    const toggle = useCallback(
        () => setTheme((t) => (t === "dark" ? "light" : "dark")),
        []
    );

    return (
        <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
    );
}
