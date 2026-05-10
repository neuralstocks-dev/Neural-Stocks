import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Sun, Moon, LogOut, Menu, X, ExternalLink } from "lucide-react";
import SocialLinks from "@/components/SocialLinks";
import KidsTopRibbon from "@/components/KidsTopRibbon";
import StockDNATopRibbon from "@/components/StockDNATopRibbon";

const NAV_ITEMS = [
    { to: "/dashboard", label: "Dashboard", testid: "nav-dashboard" },
    { to: "/portfolio", label: "Portfolio", testid: "nav-portfolio" },
    { to: "/alerts", label: "Alerts", testid: "nav-alerts" },
    { to: "/scorecard", label: "Scorecard", testid: "nav-scorecard" },
    { to: "/backtest", label: "Backtest", testid: "nav-backtest" },
    { to: "/pricing", label: "Pricing", testid: "nav-pricing" },
    { to: "/why", label: "Why us", testid: "nav-why" },
    { to: "/manual", label: "Manual", testid: "nav-manual" },
    { to: "/technical", label: "Technical", testid: "nav-technical" },
    { to: "/resources", label: "Resources", testid: "nav-resources" },
];

export default function AppShell({ children }) {
    const { user, logout } = useAuth();
    const { theme, toggle } = useTheme();
    const navigate = useNavigate();
    const loc = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close drawer whenever route changes
    useEffect(() => {
        setMobileOpen(false);
    }, [loc.pathname]);

    // Lock body scroll while the mobile drawer is open
    useEffect(() => {
        if (mobileOpen) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = prev;
            };
        }
    }, [mobileOpen]);

    const onLogout = () => {
        logout();
        navigate("/login");
    };

    const isActive = (to) => loc.pathname.startsWith(to);

    const renderNavLink = (item, mobile = false) => (
        <Link
            key={item.to}
            to={item.to}
            className={`${mobile ? "block py-3 text-base" : "text-sm whitespace-nowrap"} font-medium link-underline ${
                isActive(item.to)
                    ? "text-[hsl(var(--text-primary))]"
                    : "text-[hsl(var(--text-secondary))]"
            }`}
            data-testid={mobile ? `${item.testid}-mobile` : item.testid}
        >
            {item.label}
        </Link>
    );

    return (
        <div className="min-h-screen grain">
            <header
                className="sticky top-0 z-30"
                style={{
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    background: "hsl(var(--background) / 0.72)",
                    borderBottom: "1px solid hsl(var(--border-default))",
                    // Respect iOS notch / Android cutout. Pushes the entire
                    // header content (logo, nav, hamburger) below the unsafe
                    // top inset so taps actually land on the buttons.
                    paddingTop: "env(safe-area-inset-top)",
                }}
                data-testid="app-header"
            >
                {/* Row 1 — Brand (left) + primary nav (right). At <xl the right
                    side collapses to theme toggle + hamburger; the utility
                    cluster (admin / plan / email / logout) moves to Row 2. */}
                <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-3">
                    <Link
                        to="/"
                        className="flex items-center gap-3 shrink-0"
                        data-testid="brand-link"
                    >
                        <div
                            style={{
                                width: 36,
                                height: 36,
                                background: "hsl(220 35% 8%)",
                                display: "grid",
                                placeItems: "center",
                                flexShrink: 0,
                                borderRadius: 4,
                                overflow: "hidden",
                            }}
                        >
                            <img
                                src="/neulab-mark.png"
                                alt="NeuLab"
                                width={32}
                                height={32}
                                style={{
                                    width: 32,
                                    height: 32,
                                    objectFit: "contain",
                                    display: "block",
                                }}
                                data-testid="brand-logo-img"
                            />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span
                                className="font-serif text-lg tracking-wide whitespace-nowrap"
                                style={{ letterSpacing: "0.08em", fontWeight: 600 }}
                            >
                                NEULAB
                            </span>
                            <span
                                className="text-overline whitespace-nowrap hidden min-[1400px]:inline-block"
                                style={{ fontSize: "0.56rem", marginTop: 3 }}
                            >
                                Neural Stock Intelligence&trade;
                            </span>
                        </div>
                    </Link>

                    <nav className="hidden xl:flex items-center gap-5 2xl:gap-6">
                        {NAV_ITEMS.map((it) => renderNavLink(it))}
                        {user?.is_admin && (
                            <Link
                                to="/admin"
                                className={`text-sm font-medium link-underline ${
                                    isActive("/admin")
                                        ? "text-[hsl(var(--hold))]"
                                        : "text-[hsl(var(--text-secondary))]"
                                }`}
                                data-testid="nav-admin"
                            >
                                Admin
                            </Link>
                        )}
                        <Link
                            to="/settings"
                            className={`text-sm font-medium link-underline ${
                                isActive("/settings")
                                    ? "text-[hsl(var(--text-primary))]"
                                    : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-settings"
                        >
                            Settings
                        </Link>
                        {/* Permanent cross-promo to KidStocks. Always visible
                            in the adult nav so parents who land in the app
                            after dismissing the dashboard nudge still have
                            an obvious one-tap path to the kid product. */}
                        <a
                            href="https://kidstocks.net"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
                            style={{
                                color: "hsl(var(--gold))",
                                padding: "4px 10px",
                                border: "1px solid hsl(var(--gold) / 0.55)",
                                borderRadius: 999,
                            }}
                            title="KidStocks — AI-powered learning for ages 8-18"
                            data-testid="nav-kidstocks"
                        >
                            For Kids 8-18
                            <ExternalLink size={12} strokeWidth={1.8} />
                        </a>
                    </nav>

                    {/* Compact right-side cluster — only on <xl. Theme + hamburger
                        stay accessible from row 1. Admin/plan/email/logout move
                        into the drawer (already wired below). */}
                    <div className="flex items-center gap-2 xl:hidden">
                        <button
                            onClick={toggle}
                            className="btn-ghost !p-2"
                            aria-label="Toggle theme"
                            data-testid="theme-toggle-mobile"
                        >
                            {theme === "dark" ? (
                                <Sun size={16} strokeWidth={1.5} />
                            ) : (
                                <Moon size={16} strokeWidth={1.5} />
                            )}
                        </button>
                        <button
                            onClick={() => setMobileOpen(true)}
                            className="btn-ghost !p-2"
                            aria-label="Open menu"
                            aria-expanded={mobileOpen}
                            data-testid="mobile-menu-button"
                        >
                            <Menu size={18} strokeWidth={1.5} />
                        </button>
                    </div>
                </div>

                {/* Row 2 — Utility cluster. Only on xl+; mobile users still see
                    these inside the hamburger drawer. Right-aligned so the row
                    feels visually anchored under the nav above. */}
                <div
                    className="hidden xl:block max-w-[1400px] mx-auto px-4 md:px-8"
                    style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                    data-testid="header-utility-row"
                >
                    <div className="h-10 flex items-center justify-end gap-3">
                        {user?.is_admin && (
                            <span
                                className="text-overline inline-flex items-center px-2 py-1"
                                style={{
                                    border: "1px solid hsl(var(--hold))",
                                    color: "hsl(var(--hold))",
                                    borderRadius: 2,
                                    fontSize: "0.56rem",
                                }}
                                data-testid="admin-badge"
                            >
                                ADMIN
                            </span>
                        )}
                        {user?.plan && !user?.is_admin && (
                            <Link
                                to="/pricing"
                                className="text-overline inline-flex items-center px-2 py-1"
                                style={{
                                    border: "1px solid hsl(var(--border-default))",
                                    borderRadius: 2,
                                    color:
                                        user.plan === "elite"
                                            ? "hsl(var(--hold))"
                                            : user.plan === "pro"
                                            ? "hsl(var(--buy))"
                                            : "hsl(var(--text-secondary))",
                                    fontSize: "0.56rem",
                                }}
                                data-testid="plan-badge"
                            >
                                {user.plan.toUpperCase()} PLAN
                            </Link>
                        )}
                        {user && (
                            <span
                                className="text-overline max-w-[220px] truncate"
                                data-testid="current-user-email"
                            >
                                {user.email}
                            </span>
                        )}
                        <button
                            onClick={toggle}
                            className="btn-ghost !p-2"
                            aria-label="Toggle theme"
                            data-testid="theme-toggle"
                        >
                            {theme === "dark" ? (
                                <Sun size={16} strokeWidth={1.5} />
                            ) : (
                                <Moon size={16} strokeWidth={1.5} />
                            )}
                        </button>
                        {user && (
                            <button
                                onClick={onLogout}
                                className="btn-ghost !p-2 inline-flex"
                                aria-label="Logout"
                                data-testid="logout-button"
                            >
                                <LogOut size={16} strokeWidth={1.5} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Mobile nav drawer */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-50 xl:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Main navigation"
                    data-testid="mobile-menu-drawer"
                >
                    {/* Backdrop */}
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close menu"
                        className="absolute inset-0"
                        style={{
                            background: "rgba(0,0,0,0.6)",
                            backdropFilter: "blur(4px)",
                            WebkitBackdropFilter: "blur(4px)",
                        }}
                        data-testid="mobile-menu-backdrop"
                    />
                    {/* Panel */}
                    <div
                        className="absolute top-0 right-0 h-full w-[82%] max-w-sm flex flex-col"
                        style={{
                            background: "hsl(var(--background))",
                            borderLeft: "1px solid hsl(var(--border-default))",
                            animation: "slideInRight 220ms ease-out",
                            paddingTop: "env(safe-area-inset-top)",
                            paddingBottom: "env(safe-area-inset-bottom)",
                        }}
                    >
                        <div
                            className="flex items-center justify-between px-5 h-16"
                            style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                        >
                            <span
                                className="font-serif text-base tracking-wide"
                                style={{ letterSpacing: "0.08em", fontWeight: 600 }}
                            >
                                MENU
                            </span>
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="btn-ghost !p-2"
                                aria-label="Close menu"
                                data-testid="mobile-menu-close"
                            >
                                <X size={18} strokeWidth={1.5} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {user && (
                                <div
                                    className="mb-4 pb-4"
                                    style={{ borderBottom: "1px solid hsl(var(--border-divider))" }}
                                >
                                    <p
                                        className="text-overline"
                                        style={{ color: "hsl(var(--text-muted))", fontSize: "0.56rem" }}
                                    >
                                        Signed in as
                                    </p>
                                    <p
                                        className="text-sm mt-1 break-all"
                                        data-testid="mobile-current-user-email"
                                    >
                                        {user.email}
                                    </p>
                                    <div className="flex gap-2 mt-2">
                                        {user.is_admin && (
                                            <span
                                                className="text-overline inline-flex items-center px-2 py-1"
                                                style={{
                                                    border: "1px solid hsl(var(--hold))",
                                                    color: "hsl(var(--hold))",
                                                    borderRadius: 2,
                                                    fontSize: "0.56rem",
                                                }}
                                            >
                                                ADMIN
                                            </span>
                                        )}
                                        {user.plan && !user.is_admin && (
                                            <span
                                                className="text-overline inline-flex items-center px-2 py-1"
                                                style={{
                                                    border: "1px solid hsl(var(--border-default))",
                                                    borderRadius: 2,
                                                    color:
                                                        user.plan === "elite"
                                                            ? "hsl(var(--hold))"
                                                            : user.plan === "pro"
                                                            ? "hsl(var(--buy))"
                                                            : "hsl(var(--text-secondary))",
                                                    fontSize: "0.56rem",
                                                }}
                                            >
                                                {user.plan.toUpperCase()} PLAN
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <nav className="flex flex-col gap-1">
                                {NAV_ITEMS.map((it) => renderNavLink(it, true))}
                                {user?.is_admin && (
                                    <Link
                                        to="/admin"
                                        className={`block py-3 text-base font-medium link-underline ${
                                            isActive("/admin")
                                                ? "text-[hsl(var(--hold))]"
                                                : "text-[hsl(var(--text-secondary))]"
                                        }`}
                                        data-testid="nav-admin-mobile"
                                    >
                                        Admin
                                    </Link>
                                )}
                                <Link
                                    to="/settings"
                                    className={`block py-3 text-base font-medium link-underline ${
                                        isActive("/settings")
                                            ? "text-[hsl(var(--text-primary))]"
                                            : "text-[hsl(var(--text-secondary))]"
                                    }`}
                                    data-testid="nav-settings-mobile"
                                >
                                    Settings
                                </Link>
                                {/* Permanent KidStocks cross-promo (also in
                                    desktop nav). Mirrored here so mobile users
                                    have the same one-tap path. */}
                                <a
                                    href="https://kidstocks.net"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block py-3 text-base font-medium inline-flex items-center gap-2"
                                    style={{ color: "hsl(var(--gold))" }}
                                    data-testid="nav-kidstocks-mobile"
                                >
                                    For Kids 8-18
                                    <ExternalLink size={14} strokeWidth={1.8} />
                                </a>
                            </nav>
                        </div>

                        {user && (
                            <div
                                className="px-5 py-4"
                                style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                            >
                                <button
                                    onClick={onLogout}
                                    className="btn-ghost w-full flex items-center justify-center gap-2"
                                    data-testid="logout-button-mobile"
                                >
                                    <LogOut size={14} strokeWidth={1.5} />
                                    <span className="text-sm">Log out</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <main className="relative z-10">
                <KidsTopRibbon />
                <StockDNATopRibbon />
                {children}
            </main>

            {/* Global authenticated footer — Support & Admin email + TikTok handle */}
            <footer
                className="relative z-10 mt-12"
                style={{ borderTop: "1px solid hsl(var(--border-divider))" }}
                data-testid="app-footer"
            >
                <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <p
                        className="text-overline"
                        style={{
                            color: "hsl(var(--text-muted))",
                            fontSize: "0.56rem",
                            letterSpacing: "0.16em",
                        }}
                    >
                        &copy; 2026 NeuLab Inc. · Neural Stock Intelligence&trade; · Not financial advice
                    </p>
                    <div className="flex items-center gap-4">
                        <a
                            href="https://kidstocks.net"
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="footer-kids-link"
                            className="text-overline hover:opacity-100 transition-opacity"
                            style={{
                                color: "hsl(var(--accent-gold))",
                                fontSize: "0.56rem",
                                letterSpacing: "0.16em",
                                opacity: 0.85,
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                            }}
                            title="KidStocks — AI-powered learning for ages 8-18"
                        >
                            ✨ For Kids 8-18 &rarr;
                        </a>
                        <SocialLinks variant="default" size="sm" />
                    </div>
                </div>
            </footer>
        </div>
    );
}
