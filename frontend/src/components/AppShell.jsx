import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Sun, Moon, LogOut, LineChart } from "lucide-react";

export default function AppShell({ children }) {
    const { user, logout } = useAuth();
    const { theme, toggle } = useTheme();
    const navigate = useNavigate();
    const loc = useLocation();

    const onLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div className="min-h-screen grain">
            <header
                className="sticky top-0 z-30"
                style={{
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    background: "hsl(var(--background) / 0.72)",
                    borderBottom: "1px solid hsl(var(--border-default))",
                }}
                data-testid="app-header"
            >
                <div className="max-w-[1400px] mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
                    <Link
                        to="/"
                        className="flex items-center gap-3"
                        data-testid="brand-link"
                    >
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                border: "1px solid hsl(var(--text-primary))",
                                display: "grid",
                                placeItems: "center",
                            }}
                        >
                            <LineChart size={14} strokeWidth={1.5} />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span
                                className="font-serif text-lg tracking-wide"
                                style={{ letterSpacing: "0.08em", fontWeight: 600 }}
                            >
                                NEULAB
                            </span>
                            <span className="text-overline" style={{ fontSize: "0.56rem", marginTop: 3 }}>
                                Neural Stock Intelligence&trade;
                            </span>
                        </div>
                    </Link>

                    <nav className="hidden md:flex items-center gap-8">
                        <Link
                            to="/dashboard"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/dashboard") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-dashboard"
                        >
                            Dashboard
                        </Link>
                        <Link
                            to="/portfolio"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/portfolio") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-portfolio"
                        >
                            Portfolio
                        </Link>
                        <Link
                            to="/scorecard"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/scorecard") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-scorecard"
                        >
                            Scorecard
                        </Link>
                        <Link
                            to="/pricing"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/pricing") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-pricing"
                        >
                            Pricing
                        </Link>
                        <Link
                            to="/why"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/why") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-why"
                        >
                            Why us
                        </Link>
                        <Link
                            to="/technical"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/technical") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-technical"
                        >
                            Technical
                        </Link>
                        {user?.is_admin && (
                            <Link
                                to="/admin"
                                className={`text-sm font-medium link-underline ${
                                    loc.pathname.startsWith("/admin") ? "text-[hsl(var(--hold))]" : "text-[hsl(var(--text-secondary))]"
                                }`}
                                data-testid="nav-admin"
                            >
                                Admin
                            </Link>
                        )}
                        <Link
                            to="/settings"
                            className={`text-sm font-medium link-underline ${
                                loc.pathname.startsWith("/settings") ? "text-[hsl(var(--text-primary))]" : "text-[hsl(var(--text-secondary))]"
                            }`}
                            data-testid="nav-settings"
                        >
                            Settings
                        </Link>
                    </nav>

                    <div className="flex items-center gap-2">
                        {user?.is_admin && (
                            <span
                                className="text-overline hidden sm:inline-flex items-center px-2 py-1"
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
                                className="text-overline mr-1 hidden sm:inline-flex items-center px-2 py-1"
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
                            <span className="hidden md:inline text-overline mr-2" data-testid="current-user-email">
                                {user.email}
                            </span>
                        )}
                        <button
                            onClick={toggle}
                            className="btn-ghost !p-2"
                            aria-label="Toggle theme"
                            data-testid="theme-toggle"
                        >
                            {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
                        </button>
                        {user && (
                            <button
                                onClick={onLogout}
                                className="btn-ghost !p-2"
                                aria-label="Logout"
                                data-testid="logout-button"
                            >
                                <LogOut size={16} strokeWidth={1.5} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="relative z-10">{children}</main>
        </div>
    );
}
