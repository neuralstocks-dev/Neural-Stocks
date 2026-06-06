import React, { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [phase, setPhase] = useState(token ? "reset" : "request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError(""); setMsg(""); setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email });
      setMsg("If that email is registered, a reset link has been sent. Check your inbox.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError(""); setMsg("");
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/reset-password`, { token, new_password: password });
      setMsg("Password reset successfully!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Invalid or expired link. Please request a new one.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)", color: "#f5f5f0",
    fontFamily: "'IBM Plex Mono', monospace", fontSize: "14px",
    borderRadius: 2, boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0b0b0b", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#131313", border: "1px solid #2a2a2a", padding: "40px 32px" }}>
        <p style={{ fontSize: 10, letterSpacing: "0.18em", color: "#b8994f", textTransform: "uppercase", margin: "0 0 8px" }}>
          Neural Stock Intelligence™
        </p>
        <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: "#f5f5f0", margin: "0 0 24px", letterSpacing: "-0.01em" }}>
          {phase === "request" ? "Forgot password?" : "Set new password"}
        </h1>

        {phase === "request" ? (
          <form onSubmit={handleRequest}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, letterSpacing: "0.14em", color: "#888", textTransform: "uppercase", marginBottom: 6 }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@example.com" />
            </div>
            {error && <p style={{ color: "#e26c6c", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            {msg && <p style={{ color: "#79d694", fontSize: 13, marginBottom: 12 }}>{msg}</p>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "13px", background: "#b8994f", color: "#0b0b0b", border: "none", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 10, letterSpacing: "0.14em", color: "#888", textTransform: "uppercase", marginBottom: 6 }}>New password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Min. 8 characters" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 10, letterSpacing: "0.14em", color: "#888", textTransform: "uppercase", marginBottom: 6 }}>Confirm password</label>
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} style={inputStyle} placeholder="Repeat password" />
            </div>
            {error && <p style={{ color: "#e26c6c", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            {msg && <p style={{ color: "#79d694", fontSize: 13, marginBottom: 12 }}>{msg} Redirecting to login…</p>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "13px", background: "#b8994f", color: "#0b0b0b", border: "none", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        <p style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "#666" }}>
          <Link to="/login" style={{ color: "#b8994f", textDecoration: "none" }}>← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
