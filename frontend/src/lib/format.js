export function formatPrice(v, currency = "USD") {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    // IDR (Indonesian Rupiah) has no fractional cents and conventionally shows
    // thousand-separator dots. Intl 'IDR' renders "Rp 6.450" which is correct.
    const ccy = (currency || "USD").toUpperCase();
    const isZeroDecimal = ccy === "IDR" || ccy === "JPY" || ccy === "KRW" || ccy === "VND";
    try {
        return new Intl.NumberFormat(ccy === "IDR" ? "id-ID" : "en-US", {
            style: "currency",
            currency: ccy,
            minimumFractionDigits: isZeroDecimal ? 0 : 2,
            maximumFractionDigits: isZeroDecimal ? 0 : 2,
        }).format(v);
    } catch {
        return `$${Number(v).toFixed(2)}`;
    }
}

export function formatNumber(v, digits = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return Number(v).toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
}

export function formatPct(v, digits = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${Number(v).toFixed(digits)}%`;
}

export function formatCompact(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
}

export function timeAgo(iso) {
    if (!iso) return "—";
    const then = new Date(iso).getTime();
    const diff = (Date.now() - then) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
