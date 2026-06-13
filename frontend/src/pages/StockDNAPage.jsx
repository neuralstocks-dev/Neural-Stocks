/**
 * StockDNAPage — public, guest-accessible /stockdna route.
 *
 * Adult NeuLab/NSI cyber-noir theme: deep navy background, antique
 * gold + violet accents, IBM Plex Mono body / Cormorant Garamond
 * headings — matches the rest of neulab.xyz.
 */
import React, { useEffect } from "react";
import StockDNAQuiz from "@/components/StockDNAQuiz";

const ADULT_THEME = {
    bg: "#0A0C10",                          // deep navy (matches login bg)
    panel: "#13161B",
    panel2: "#1c2027",
    headerBg: "rgba(10,12,16,0.88)",
    primary: "#c5a45e",                     // antique gold (matches --gold)
    primaryFg: "#0A0C10",                   // dark text on gold
    primary2: "#7c3aed",                    // violet
    accent: "#f59e0b",                      // warm amber for urgency
    text: "#e8eaf6",
    muted: "#8b95a8",
    border: "rgba(255,255,255,0.08)",
    fontHeading: '"Cormorant Garamond", "Playfair Display", serif',
    fontBody: '"IBM Plex Mono", "DM Mono", monospace',
    radius: 2,
    angled: true,
    homeUrl: "https://stock.neulab.xyz",
    homeLabel: "stock.neulab.xyz",
    brandSuffix: "by NeuLab Inc.",
};

export default function StockDNAPage() {
    useEffect(() => {
        document.title = "StockDNA™ — Discover Your Investor Personality · NeuLab";
    }, []);
    return <StockDNAQuiz theme={ADULT_THEME} />;
}
