import React from "react";
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
import PaypalSmokeTestPage from "@/pages/PaypalSmokeTestPage";
import BacktestPage from "@/pages/BacktestPage";
import AlertsPage from "@/pages/AlertsPage";
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
