/**
 * NeuToolsTopRibbon — thin ribbon advertising the NeuTools toolkit
 * (6 free investor tools). Sits directly below StockDNATopRibbon in
 * AppShell so the three ribbons stack cleanly: KidsTopRibbon (gold)
 * → StockDNATopRibbon (violet) → NeuToolsTopRibbon (emerald).
 *
 * Guest-aware (no auth required) so it doubles as an evergreen
 * funnel for the public toolkit.
 */
import React from "react";
import { ArrowRight } from "lucide-react";

export default function NeuToolsTopRibbon() {
    return (
        <a
            href="/neutools"
            data-testid="neutools-top-ribbon"
            className="block w-full transition-opacity"
            style={{
                background: "linear-gradient(135deg, hsl(150 70% 45% / 0.14) 0%, hsl(150 70% 45% / 0.04) 100%)",
                borderBottom: "1px solid hsl(150 70% 45% / 0.32)",
                color: "hsl(150 70% 70%)",
                textDecoration: "none",
                opacity: 0.95,
            }}
            title="NeuTools — 6 free investor tools by NeuLab Inc."
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
                <span style={{ fontSize: "0.95rem", lineHeight: 1 }}>🛠</span>
                <span>
                    <span className="hidden sm:inline">6 free investor tools — calculate, test, learn. </span>
                    <span className="sm:hidden">New: </span>
                    <strong style={{ fontWeight: 700 }}>NeuTools™</strong>
                    <span style={{ marginLeft: 4, opacity: 0.85 }}>· Open the toolkit →</span>
                </span>
                <ArrowRight size={11} strokeWidth={1.8} className="flex-shrink-0" />
            </div>
        </a>
    );
}
