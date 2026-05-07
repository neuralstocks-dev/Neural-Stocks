/**
 * KidsShell — logged-in shell for KidStocks (V1-α).
 *
 * Visually distinct from the adult AppShell: bright cream backdrop,
 * playful Outfit/Quicksand typography, large rounded nav pills.
 * Mobile-first — kids will primarily use phones.
 */
import React, { useState } from "react";
import { Link, NavLink, Outlet, Navigate, useNavigate } from "react-router-dom";
import { Sparkles, Wallet, LineChart, Star, LogOut, Menu, X, Search } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import KidsBrandMark from "@/components/KidsBrandMark";
import KidsFooter from "@/components/KidsFooter";
import { useKidsAuth } from "@/contexts/KidsAuthContext";

const NAV = [
    { to: "/kids/dashboard", label: "Home",      icon: Sparkles },
    { to: "/kids/discover",  label: "Discover",  icon: Search },
    { to: "/kids/portfolio", label: "Portfolio", icon: LineChart },
    { to: "/kids/watchlist", label: "Watchlist", icon: Star },
];

export default function KidsShell() {
    const { student, loading, logout } = useKidsAuth();
    const navigate = useNavigate();
    const [mobileOpen, setMobileOpen] = useState(false);

    if (loading) {
        return (
            <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#fff8f0" }}>
                <div className="animate-pulse" style={{ fontFamily: "Outfit, sans-serif", color: "#1a1a2e" }}>
                    Loading…
                </div>
            </div>
        );
    }
    if (!student) return <Navigate to="/kids/login" replace />;

    const handleLogout = () => { logout(); navigate("/kids/login"); };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#fff8f0",
                fontFamily: '"Outfit", "Quicksand", system-ui, -apple-system, sans-serif',
                color: "#1a1a2e",
            }}
            data-testid="kids-shell"
        >
            <header
                style={{
                    background: "#1a1a2e",
                    color: "#fff",
                    padding: "12px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    position: "sticky",
                    top: 0,
                    zIndex: 30,
                    paddingTop: "calc(env(safe-area-inset-top) + 12px)",
                }}
            >
                <KidsBrandMark size={26} wordmarkSize={18} color="#fff" taglineOpacity={0.7} linkTo="/kids/dashboard" />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                        data-testid="kids-balance-pill"
                        style={{
                            background: "#ffb570",
                            color: "#1a1a2e",
                            borderRadius: 999,
                            padding: "4px 12px",
                            fontSize: 13,
                            fontWeight: 700,
                        }}
                    >
                        💰 {(student.stock_coins_balance || 0).toLocaleString()} SC
                    </div>
                    <button
                        onClick={() => setMobileOpen((v) => !v)}
                        data-testid="kids-mobile-menu-button"
                        aria-label="Menu"
                        style={{
                            background: "transparent",
                            color: "#fff",
                            border: "1px solid rgba(255,255,255,0.3)",
                            borderRadius: 999,
                            padding: 8,
                            cursor: "pointer",
                            display: "grid",
                            placeItems: "center",
                        }}
                    >
                        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>
                </div>
            </header>

            {/* Desktop nav (≥md) */}
            <nav
                style={{
                    display: "none",
                    background: "#fff",
                    borderBottom: "1px solid #f0e8d8",
                    padding: "10px 20px",
                    gap: 8,
                    overflowX: "auto",
                }}
                className="kids-desktop-nav"
                data-testid="kids-desktop-nav"
            >
                {NAV.map((n) => {
                    const Icon = n.icon;
                    return (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            data-testid={`kids-nav-${n.label.toLowerCase()}`}
                            style={({ isActive }) => ({
                                background: isActive ? "#1a1a2e" : "transparent",
                                color: isActive ? "#fff" : "#1a1a2e",
                                border: isActive ? "2px solid #1a1a2e" : "2px solid #e5d5b8",
                                borderRadius: 12,
                                padding: "8px 14px",
                                fontSize: 13,
                                fontWeight: 600,
                                textDecoration: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                whiteSpace: "nowrap",
                            })}
                        >
                            <Icon size={14} />
                            {n.label}
                        </NavLink>
                    );
                })}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                    <LanguageSwitcher />
                    <button
                        onClick={handleLogout}
                        data-testid="kids-logout-button"
                        style={{
                            background: "transparent",
                            color: "#7a5a00",
                            border: "1.5px solid #e5d5b8",
                            borderRadius: 12,
                            padding: "8px 14px",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <LogOut size={14} /> Logout
                    </button>
                </div>
            </nav>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}
                    style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.85)", zIndex: 40, display: "grid", alignItems: "start", paddingTop: 64 }}
                    data-testid="kids-mobile-drawer"
                >
                    <div style={{ background: "#fff8f0", margin: "0 16px", padding: 16, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.2)" }}>
                        {NAV.map((n) => {
                            const Icon = n.icon;
                            return (
                                <NavLink
                                    key={n.to}
                                    to={n.to}
                                    onClick={() => setMobileOpen(false)}
                                    data-testid={`kids-nav-mobile-${n.label.toLowerCase()}`}
                                    style={({ isActive }) => ({
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        padding: "14px 12px",
                                        borderRadius: 12,
                                        textDecoration: "none",
                                        color: "#1a1a2e",
                                        fontSize: 16,
                                        fontWeight: 600,
                                        background: isActive ? "#ffb570" : "transparent",
                                        marginBottom: 4,
                                    })}
                                >
                                    <Icon size={18} />
                                    {n.label}
                                </NavLink>
                            );
                        })}
                        <button
                            onClick={() => { setMobileOpen(false); handleLogout(); }}
                            data-testid="kids-logout-mobile"
                            style={{
                                width: "100%",
                                marginTop: 8,
                                padding: 14,
                                borderRadius: 12,
                                background: "transparent",
                                border: "1.5px solid #e5d5b8",
                                color: "#7a5a00",
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                            }}
                        >
                            <LogOut size={16} /> Logout
                        </button>
                    </div>
                </div>
            )}

            <main style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 40px" }}>
                <Outlet />
            </main>

            <KidsFooter variant="dark" />

            <style>{`
                @media (min-width: 768px) {
                    .kids-desktop-nav { display: flex !important; }
                }
            `}</style>
        </div>
    );
}
