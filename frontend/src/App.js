import React, { useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/context/ThemeContext";
import AppShell from "@/components/AppShell";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DashboardPage from "@/pages/DashboardPage";
import AnalysisReportPage from "@/pages/AnalysisReportPage";
import PricingPage from "@/pages/PricingPage";
import PublicVerdictPage from "@/pages/PublicVerdictPage";
import PublicTimelinePage from "@/pages/PublicTimelinePage";
import KidsPreviewPage from "@/pages/KidsPreviewPage";
import { KidsAuthProvider } from "@/contexts/KidsAuthContext";
import KidsShell from "@/components/KidsShell";
import { KidsLoginPage, KidsSignupPage } from "@/pages/KidsAuthPages";
import { KidsAwaitingConsentPage, KidsParentalConsentPage } from "@/pages/KidsConsentPages";
import { KidsParentLoginPage, KidsParentDashboardPage } from "@/pages/KidsParentPages";
import KidsLandingPage from "@/pages/KidsLandingPage";
import KidsForParentsPage from "@/pages/KidsForParentsPage";
import {
    KidsDashboardPage,
    KidsDiscoverPage,
    KidsPortfolioPage,
    KidsWatchlistPage,
    KidsAnalyzePage,
} from "@/pages/KidsAppPages";
import PublicTryVerdictPage from "@/pages/PublicTryVerdictPage";
import AuthCallback from "@/pages/AuthCallback";
import AdminPage from "@/pages/AdminPage";
import AdminCostPage from "@/pages/AdminCostPage";
import ScorecardPage from "@/pages/ScorecardPage";
import WhyUsPage from "@/pages/WhyUsPage";
import PortfolioPage from "@/pages/PortfolioPage";
import SettingsPage from "@/pages/SettingsPage";
import TechnicalPage from "@/pages/TechnicalPage";
import UserManualPage from "@/pages/UserManualPage";
import ResourcesPage from "@/pages/ResourcesPage";
import ResourceDetailPage from "@/pages/ResourceDetailPage";
import PaypalSmokeTestPage from "@/pages/PaypalSmokeTestPage";
import BacktestPage from "@/pages/BacktestPage";
import AlertsPage from "@/pages/AlertsPage";
import StockDNAPage from "@/pages/StockDNAPage";
import KidsStockDNAPage from "@/pages/KidsStockDNAPage";
import { Loader2 } from "lucide-react";

/**
 * ProtectedLayout — single source of truth for the authenticated chrome.
 *
 * Wraps every authenticated route in <AppShell> via React Router's nested
 * routes + <Outlet />, so a new page CANNOT forget to render the global
 * header / nav / mobile drawer / iOS notch padding. Replaces 13
 * per-page <AppShell> wrappers.
 *
 * Bonus: the AppShell DOM persists across navigations between protected
 * routes (only the <main> body re-renders), eliminating the brief header
 * flash on slow phones the testing agent flagged twice.
 */
function ProtectedLayout() {
    const { user, bootstrapping } = useAuth();
    if (bootstrapping) {
        return (
            <div className="min-h-screen grid place-items-center">
                <Loader2 className="animate-spin" size={24} />
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    return (
        <AppShell>
            <Outlet />
        </AppShell>
    );
}

function RootRedirect() {
    const { user, bootstrapping } = useAuth();
    // Domain-aware routing: visitors to kidstocks.net (or *.kidstocks.net)
    // land on the kid-friendly KidStocks landing page, NOT the adult NeuLab
    // dashboard. Hostname check runs synchronously before bootstrap finishes
    // so kidstocks.net traffic skips the adult-auth bootstrap entirely.
    if (typeof window !== "undefined") {
        const host = window.location.hostname.toLowerCase();
        if (host === "kidstocks.net" || host.endsWith(".kidstocks.net")) {
            return <Navigate to="/kids/about" replace />;
        }
    }
    if (bootstrapping) {
        return (
            <div className="min-h-screen grid place-items-center">
                <Loader2 className="animate-spin" size={24} />
            </div>
        );
    }
    return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

function AppRoutes() {
    const location = useLocation();

    // Brand-aware favicon: swap to the KidStocks mark on /kids/* routes
    // and on the kidstocks.net hostname; restore the NeuLab favicon
    // everywhere else. Targets ALL <link rel="icon"> tags so that
    // browsers (which prefer the .ico) pick up the change.
    // Also overrides og:image / twitter:image per-route — this only
    // helps JS-aware scrapers (LinkedIn, Slack), but it's defence in
    // depth and lays groundwork for future SSR.
    useEffect(() => {
        const host = window.location.hostname.toLowerCase();
        const onKidSurface = (
            location.pathname.startsWith("/kids")
            || host === "kidstocks.net"
            || host.endsWith(".kidstocks.net")
        );
        const allIconLinks = document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
        allIconLinks.forEach((link) => {
            if (!link.dataset.originalHref) {
                link.dataset.originalHref = link.getAttribute("href") || "";
                link.dataset.originalType = link.getAttribute("type") || "";
            }
            if (onKidSurface) {
                link.setAttribute("href", "/kidstocks-logo.svg");
                link.setAttribute("type", "image/svg+xml");
            } else {
                link.setAttribute("href", link.dataset.originalHref);
                if (link.dataset.originalType) {
                    link.setAttribute("type", link.dataset.originalType);
                } else {
                    link.removeAttribute("type");
                }
            }
        });

        // Per-page OG image override — for-parents page shares its own card.
        const isForParents = location.pathname === "/kids/for-parents";
        const ogImagePath = isForParents ? "/og-kids-parents.png" : "/og-kids-landing.png";
        const setMeta = (selector, attr, value) => {
            const el = document.querySelector(selector);
            if (el) el.setAttribute(attr, value);
        };
        const fullUrl = window.location.origin + ogImagePath;
        setMeta('meta[property="og:image"]', "content", fullUrl);
        setMeta('meta[name="twitter:image"]', "content", fullUrl);
        setMeta('meta[property="og:url"]', "content", window.location.href);
    }, [location.pathname]);

    // CRITICAL race-condition guard: process Google OAuth callback BEFORE normal routes
    if (location.hash?.includes("session_id=")) {
        return <AuthCallback />;
    }
    return (
        <Routes>
            {/* Public routes */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/v/:shareId" element={<PublicVerdictPage />} />
            <Route path="/t/:shareId" element={<PublicTimelinePage />} />
            <Route path="/kids/preview" element={<Navigate to="/kids/preview/AAPL?age=11-13" replace />} />
            <Route path="/kids/preview/:ticker" element={<KidsPreviewPage />} />
            <Route path="/kids/about" element={<KidsLandingPage />} />
            <Route path="/kids/for-parents" element={<KidsForParentsPage />} />
            <Route path="/kids/parent/login" element={<KidsParentLoginPage />} />
            <Route path="/kids/parent/dashboard" element={<KidsParentDashboardPage />} />

            {/* StockDNA — public investor-personality quiz, two themed
                surfaces. Both routes are guest-accessible (no auth gate). */}
            <Route path="/stockdna" element={<StockDNAPage />} />
            <Route path="/kids/stockdna" element={<KidsStockDNAPage />} />

            {/* KidStocks V1 — separate auth scope, separate shell. */}
            <Route path="/kids/login" element={<KidsAuthProvider><KidsLoginPage /></KidsAuthProvider>} />
            <Route path="/kids/signup" element={<KidsAuthProvider><KidsSignupPage /></KidsAuthProvider>} />
            <Route path="/kids/awaiting-consent" element={<KidsAwaitingConsentPage />} />
            <Route path="/kids/parental-consent/:token" element={<KidsParentalConsentPage />} />
            <Route element={<KidsAuthProvider><KidsShell /></KidsAuthProvider>}>
                <Route path="/kids/dashboard" element={<KidsDashboardPage />} />
                <Route path="/kids/discover" element={<KidsDiscoverPage />} />
                <Route path="/kids/portfolio" element={<KidsPortfolioPage />} />
                <Route path="/kids/watchlist" element={<KidsWatchlistPage />} />
                <Route path="/kids/analyze/:ticker" element={<KidsAnalyzePage />} />
            </Route>
            <Route path="/kids" element={<Navigate to="/kids/dashboard" replace />} />
            <Route path="/try/:ticker" element={<PublicTryVerdictPage />} />
            <Route path="/ts/:shareId" element={<PublicTryVerdictPage />} />

            {/* Authenticated routes — all share <AppShell> via the layout. */}
            <Route element={<ProtectedLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/analysis/:ticker" element={<AnalysisReportPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/scorecard" element={<ScorecardPage />} />
                <Route path="/backtest" element={<BacktestPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/why" element={<WhyUsPage />} />
                <Route path="/manual" element={<UserManualPage />} />
                <Route path="/technical" element={<TechnicalPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/resources/:slug" element={<ResourceDetailPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/cost" element={<AdminCostPage />} />
                <Route path="/portfolio" element={<PortfolioPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/admin/paypal-smoke-test" element={<PaypalSmokeTestPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <div className="App">
            <ThemeProvider>
                <BrowserRouter>
                    <AuthProvider>
                        <AppRoutes />
                    </AuthProvider>
                </BrowserRouter>
            </ThemeProvider>
        </div>
    );
}

export default App;
