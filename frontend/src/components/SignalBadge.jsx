import React from "react";

export default function SignalBadge({ signal, size = "md" }) {
    const s = (signal || "").toUpperCase();
    const cls = s === "BUY" ? "signal-buy" : s === "SELL" ? "signal-sell" : "signal-hold";
    const sz = size === "lg" ? "px-3 py-1.5 text-sm" : "px-2 py-0.5 text-[0.68rem]";
    return (
        <span
            className={`${cls} ${sz} font-mono font-medium uppercase`}
            style={{ letterSpacing: "0.16em", borderRadius: 2 }}
            data-testid={`signal-badge-${s.toLowerCase()}`}
        >
            {s || "—"}
        </span>
    );
}
