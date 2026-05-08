/**
 * KidsTopRibbon — always-visible thin gold ribbon below the AppShell
 * header, advertising KidStocks on every authenticated page.
 *
 * Non-dismissible by design. The dismissible dashboard card
 * (KidsDiscoverNudge) handles the long-form pitch; this ribbon
 * is the always-on, low-pressure parent funnel that follows the
 * user across Portfolio / Alerts / Scorecard / Backtest etc.
 *
 * Single line, gold accent, opens kidstocks.net in a new tab.
 */
import React from "react";
import { ExternalLink, Sparkles } from "lucide-react";

export default function KidsTopRibbon() {
    return (
        <a
            href="https://kidstocks.net"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="kids-top-ribbon"
            className="block w-full hover:opacity-100 transition-opacity"
            style={{
                background: "linear-gradient(135deg, hsl(var(--gold) / 0.12) 0%, hsl(var(--gold) / 0.04) 100%)",
                borderBottom: "1px solid hsl(var(--gold) / 0.30)",
                color: "hsl(var(--gold))",
                textDecoration: "none",
                opacity: 0.95,
            }}
            title="KidStocks — AI-powered learning for ages 8-18"
        >
            <div
                className="flex items-center justify-center gap-2 px-4 py-2 text-center"
                style={{
                    fontSize: "0.74rem",
                    letterSpacing: "0.04em",
                    fontWeight: 500,
                    lineHeight: 1.4,
                }}
            >
                <Sparkles size={12} strokeWidth={1.8} className="flex-shrink-0" />
                <span>
                    <span className="hidden sm:inline">For ages 8–18 — show your kid how the AI thinks. </span>
                    <span className="sm:hidden">Got a kid 8–18? </span>
                    <strong style={{ fontWeight: 700 }}>KidStocks</strong>
                    <span style={{ marginLeft: 4, opacity: 0.85 }}>· kidstocks.net</span>
                </span>
                <ExternalLink size={11} strokeWidth={1.8} className="flex-shrink-0" />
            </div>
        </a>
    );
}
