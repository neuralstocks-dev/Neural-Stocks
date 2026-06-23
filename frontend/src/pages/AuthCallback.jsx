import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Google OAuth has been removed. This page exists only to catch any
// stale /auth/callback links and redirect cleanly to login.
export default function AuthCallback() {
    const navigate = useNavigate();
    useEffect(() => {
        navigate("/login", { replace: true });
    }, [navigate]);
    return null;
}
