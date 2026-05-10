/**
 * KidsStockDNAPage — public, guest-accessible /kids/stockdna route.
 *
 * Kid-friendly cream + navy theme: warm sand background, coral-red
 * primary, soft gold secondary, navy text, Outfit / Quicksand fonts —
 * matches the rest of kidstocks.net.
 */
import React, { useEffect } from "react";
import StockDNAQuiz from "@/components/StockDNAQuiz";

const KIDS_THEME = {
    bg: "#fff8f0",                  // warm cream (KidStocks SAND)
    panel: "#ffffff",
    panel2: "#fff2e0",
    headerBg: "rgba(255,248,240,0.92)",
    primary: "#ff7676",             // coral red (kid-friendly, energetic)
    primaryFg: "#ffffff",
    primary2: "#ffb570",            // warm gold/peach
    accent: "#1a1a2e",              // navy for accent contrast
    text: "#1a1a2e",
    muted: "#6a6a82",
    border: "rgba(26,26,46,0.10)",
    fontHeading: '"Outfit", "Quicksand", system-ui, sans-serif',
    fontBody: '"Quicksand", "Outfit", system-ui, sans-serif',
    radius: 12,
    angled: false,
    homeUrl: "https://kidstocks.net",
    homeLabel: "kidstocks.net",
    brandSuffix: "by NeuLab Inc.",
};

export default function KidsStockDNAPage() {
    useEffect(() => {
        document.title = "StockDNA™ — Discover Your Investor Personality · KidStocks";
    }, []);
    return <StockDNAQuiz theme={KIDS_THEME} />;
}
