import React, { createContext, useEffect, useState, useCallback, useMemo } from "react";

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

    const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}
