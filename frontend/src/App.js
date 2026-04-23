import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/context/ThemeContext";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DashboardPage from "@/pages/DashboardPage";
import AnalysisReportPage from "@/pages/AnalysisReportPage";
import PricingPage from "@/pages/PricingPage";
import PublicVerdictPage from "@/pages/PublicVerdictPage";
import AuthCallback from "@/pages/AuthCallback";
import AdminPage from "@/pages/AdminPage";
import ScorecardPage from "@/pages/ScorecardPage";
import WhyUsPage from "@/pages/WhyUsPage";
import PortfolioPage from "@/pages/PortfolioPage";
import SettingsPage from "@/pages/SettingsPage";
import TechnicalPage from "@/pages/TechnicalPage";
import PaypalSmokeTestPage from "@/pages/PaypalSmokeTestPage";
import { Loader2 } from "lucide-react";

function Protected({ children }) {
    const { user, bootstrapping } = useAuth();
    if (bootstrapping) {
        return (
            <div className="min-h-screen grid place-items-center">
                <Loader2 className="animate-spin" size={24} />
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    return children;
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
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/v/:shareId" element={<PublicVerdictPage />} />
            <Route
                path="/dashboard"
                element={
                    <Protected>
                        <DashboardPage />
                    </Protected>
                }
            />
            <Route
                path="/analysis/:ticker"
                element={
                    <Protected>
                        <AnalysisReportPage />
                    </Protected>
                }
            />
            <Route
                path="/pricing"
                element={
                    <Protected>
                        <PricingPage />
                    </Protected>
                }
            />
            <Route
                path="/scorecard"
                element={
                    <Protected>
                        <ScorecardPage />
                    </Protected>
                }
            />
            <Route
                path="/why"
                element={
                    <Protected>
                        <WhyUsPage />
                    </Protected>
                }
            />
            <Route
                path="/technical"
                element={
                    <Protected>
                        <TechnicalPage />
                    </Protected>
                }
            />
            <Route
                path="/admin"
                element={
                    <Protected>
                        <AdminPage />
                    </Protected>
                }
            />
            <Route
                path="/portfolio"
                element={
                    <Protected>
                        <PortfolioPage />
                    </Protected>
                }
            />
            <Route
                path="/settings"
                element={
                    <Protected>
                        <SettingsPage />
                    </Protected>
                }
            />
            <Route
                path="/admin/paypal-smoke-test"
                element={
                    <Protected>
                        <PaypalSmokeTestPage />
                    </Protected>
                }
            />
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
