import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Clock } from "lucide-react";

function formatRemaining(expiresAt) {
    if (!expiresAt) return null;
    if (expiresAt === "forever") return "Permanent unlock";
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return "Expired";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s remaining`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m remaining`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m remaining`;
    return `${Math.floor(sec / 86400)}d remaining`;
}

export default function TestUnlockBanner({ quota }) {
    if (!quota?.test_unlock_active) return null;
    const remaining = formatRemaining(quota.test_unlock_expires_at);
    return (
        <section
            className="module mb-4 p-4 md:p-5 flex items-start md:items-center justify-between gap-4 flex-col md:flex-row"
            style={{
                borderColor: "hsl(var(--hold))",
                background: "hsl(var(--hold-bg))",
            }}
            data-testid="test-unlock-banner"
        >
            <div className="flex items-start md:items-center gap-3">
                <ShieldCheck size={20} strokeWidth={1.5} style={{ color: "hsl(var(--hold))" }} />
                <div>
                    <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                        Admin test-unlock active
                    </p>
                    <p className="font-serif text-lg md:text-xl mt-1" style={{ letterSpacing: "-0.01em" }}>
                        All Elite features are unlocked for this account.
                    </p>
                    <p className="text-xs mt-1 font-mono" style={{ color: "hsl(var(--text-secondary))" }}>
                        <Clock size={10} strokeWidth={1.5} className="inline mr-1" />
                        {remaining}{" "}
                        {quota.base_plan && quota.base_plan !== "elite" && (
                            <span>· Base plan: {quota.base_plan.toUpperCase()}</span>
                        )}
                    </p>
                </div>
            </div>
            <Link to="/pricing" className="btn-ghost !text-xs whitespace-nowrap">
                See what's included →
            </Link>
        </section>
    );
}
