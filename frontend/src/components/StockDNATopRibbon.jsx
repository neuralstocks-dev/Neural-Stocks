/**
 * StockDNATopRibbon — always-visible thin ribbon below the AppShell
 * header advertising the StockDNA quiz on every authenticated page.
 *
 * Mirrors the placement / non-dismissibility of `KidsTopRibbon` so the
 * two ribbons stack cleanly: KidsTopRibbon (gold) on top, StockDNA
 * (violet) directly below. Both are guest-aware (links don't require
 * auth) so they double as evergreen funnels for the public quiz.
 */
import React from "react";
import { ExternalLink } from "lucide-react";

export default function StockDNATopRibbon() {
    return (
        <a
            href="/stockdna"
            data-testid="stockdna-top-ribbon"
            className="block w-full transition-opacity"
            style={{
                background: "linear-gradient(135deg, hsl(259 78% 60% / 0.16) 0%, hsl(259 78% 60% / 0.04) 100%)",
                borderBottom: "1px solid hsl(259 78% 60% / 0.32)",
                color: "hsl(259 80% 75%)",
                textDecoration: "none",
                opacity: 0.95,
            }}
            title="StockDNA — discover your investor personality"
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
                <span style={{ fontSize: "0.95rem", lineHeight: 1 }}>🧬</span>
                <span>
                    <span className="hidden sm:inline">5 minutes to your investor personality. </span>
                    <span className="sm:hidden">New · 5 min: </span>
                    <strong style={{ fontWeight: 700 }}>What's your StockDNA?</strong>
                    <span style={{ marginLeft: 4, opacity: 0.85 }}>· Take the quiz →</span>
                </span>
                <ExternalLink size={11} strokeWidth={1.8} className="flex-shrink-0" />
            </div>
        </a>
    );
}
