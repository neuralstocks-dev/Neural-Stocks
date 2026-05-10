/**
 * NeuToolsPage — public toolkit landing + 6 interactive tools at /neutools.
 *
 * Styled to match the neulab.xyz noir aesthetic: deep navy bg
 * (#0A0C10), antique gold accents (#c5a45e), green for emphasis,
 * Cormorant Garamond headings + IBM Plex Mono body — same tokens as
 * StockDNAPage.
 *
 * Tools:
 *   1. StockHoroscope (EN+ID)  4. Latte Factor (EN+ID)
 *   2. StockCalc      (EN+ID)  5. StockSlang   (EN only)
 *   3. Bear Survival  (EN+ID)  6. StockTimeMachine (EN+ID)
 *
 * Routes:
 *   /neutools            → landing grid
 *   /neutools/:toolId    → individual tool page
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ArrowRight, Search, Share2 } from "lucide-react";
import {
    NEUTOOLS, TOOL_INFO, BEAR_SCENARIOS, HORO_TYPES, HORO_READINGS,
    SLANG_TERMS, NEUTOOLS_I18N,
} from "@/lib/neuToolsData";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── NSI design tokens (mirrors StockDNAPage / global tokens) ──
const T = {
    bg: "#0A0C10",
    panel: "#13161B",
    panel2: "#1c2027",
    primary: "#c5a45e",       // antique gold
    accent: "#22c55e",         // green (matches NSI "in focus")
    danger: "#ef4444",
    amber: "#f59e0b",
    text: "#e8eaf6",
    muted: "#8b95a8",
    border: "rgba(255,255,255,0.08)",
    fontHeading: '"Cormorant Garamond", "Playfair Display", serif',
    fontBody: '"IBM Plex Mono", "DM Mono", monospace',
};

// ─────────────────────────────────────────────────────────────
// Top-level page router (grid vs. detail)
// ─────────────────────────────────────────────────────────────
export default function NeuToolsPage() {
    const { toolId } = useParams();
    const navigate = useNavigate();
    const [lang, setLang] = useState(() => {
        try { return localStorage.getItem("nt_lang") === "id" ? "id" : "en"; }
        catch { return "en"; }
    });
    useEffect(() => {
        document.title = "NeuTools™ — Investor Toolkit · NeuLab";
        try { localStorage.setItem("nt_lang", lang); } catch (_) { /* ignore */ }
    }, [lang]);

    const i18n = NEUTOOLS_I18N[lang];
    const tool = toolId ? NEUTOOLS.find((t) => t.tid === toolId) : null;

    // StockSlang is English-only — silently force lang to EN on that tool
    const effectiveLang = tool && !tool.bilingual ? "en" : lang;

    return (
        <div
            data-testid="neutools-page"
            style={{
                minHeight: "100vh",
                background: T.bg,
                color: T.text,
                fontFamily: T.fontBody,
            }}
        >
            <NeuToolsHeader lang={lang} setLang={setLang} />
            {/* Page-level pulse keyframe — used by the "market context refreshing" indicator in HoroscopeUI. */}
            <style>{`@keyframes pulse{0%,100%{opacity:.35}50%{opacity:.85}}`}</style>
            {tool ? (
                <ToolDetail
                    tool={tool} lang={effectiveLang} i18n={NEUTOOLS_I18N[effectiveLang]}
                    onBack={() => navigate("/neutools")}
                />
            ) : (
                <NeuToolsLanding lang={lang} i18n={i18n} onOpen={(id) => navigate(`/neutools/${id}`)} />
            )}
            <NeuToolsFooter />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Header — brand + language switcher (matches StockDNA chrome)
// ─────────────────────────────────────────────────────────────
function NeuToolsHeader({ lang, setLang }) {
    return (
        <header
            style={{
                position: "sticky", top: 0, zIndex: 50,
                background: "rgba(10,12,16,0.92)",
                backdropFilter: "blur(14px)",
                borderBottom: `1px solid ${T.border}`,
                padding: "12px 18px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
        >
            <Link
                to="/dashboard"
                style={{
                    display: "flex", alignItems: "center", gap: 10,
                    textDecoration: "none", color: T.text,
                }}
            >
                <span
                    style={{
                        width: 28, height: 28, display: "grid", placeItems: "center",
                        background: T.primary, color: T.bg, fontWeight: 800, fontSize: 14,
                        letterSpacing: 1,
                    }}
                >N</span>
                <span style={{ lineHeight: 1.1 }}>
                    <div style={{ fontFamily: T.fontHeading, fontSize: 18, letterSpacing: 2, color: T.text }}>
                        NeuTools<sup style={{ fontSize: 9, color: T.primary, marginLeft: 2 }}>™</sup>
                    </div>
                    <div style={{ fontSize: 8, color: T.muted, letterSpacing: 2, textTransform: "uppercase" }}>
                        by NeuLab Inc.
                    </div>
                </span>
            </Link>
            <div style={{ display: "flex", gap: 4, border: `1px solid ${T.border}`, background: T.panel }}>
                {["en", "id"].map((k) => (
                    <button
                        key={k}
                        onClick={() => setLang(k)}
                        data-testid={`neutools-lang-${k}`}
                        style={{
                            fontFamily: T.fontBody, fontSize: 10, letterSpacing: 1,
                            padding: "6px 12px", border: "none", cursor: "pointer",
                            background: lang === k ? T.primary : "transparent",
                            color: lang === k ? T.bg : T.muted,
                            fontWeight: lang === k ? 700 : 400,
                        }}
                    >{k.toUpperCase()}</button>
                ))}
            </div>
        </header>
    );
}

// ─────────────────────────────────────────────────────────────
// Landing — hero + tool grid
// ─────────────────────────────────────────────────────────────
function NeuToolsLanding({ lang, i18n, onOpen }) {
    const [filter, setFilter] = useState("");
    const list = useMemo(() => {
        if (!filter) return NEUTOOLS;
        const q = filter.toLowerCase();
        return NEUTOOLS.filter((t) => {
            const d = t[lang] || t.en;
            return d.nm.toLowerCase().includes(q)
                || d.ds.toLowerCase().includes(q)
                || d.tg.toLowerCase().includes(q);
        });
    }, [filter, lang]);

    return (
        <main>
            {/* Hero */}
            <section
                style={{
                    padding: "56px 18px 40px", textAlign: "center",
                    borderBottom: `1px solid ${T.border}`,
                }}
            >
                <div
                    style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        border: `1px solid ${T.primary}33`, padding: "5px 13px",
                        marginBottom: 18, fontSize: 9, letterSpacing: 2,
                        color: T.primary, textTransform: "uppercase",
                    }}
                    data-testid="neutools-eyebrow"
                >
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.primary }} />
                    {i18n.eyebrow}
                </div>
                <h1
                    style={{
                        fontFamily: T.fontHeading,
                        fontSize: "clamp(44px, 10vw, 96px)",
                        letterSpacing: 4, lineHeight: 0.95, color: T.text,
                        margin: "0 0 8px",
                    }}
                    data-testid="neutools-h1"
                >
                    {i18n.title_lead}<span style={{ color: T.primary, fontStyle: "italic" }}>{i18n.title_accent}</span>
                    <sup style={{ fontSize: 18, color: T.primary, marginLeft: 4 }}>™</sup>
                </h1>
                <div
                    style={{
                        fontFamily: T.fontHeading, fontSize: "clamp(12px,2.5vw,18px)",
                        letterSpacing: 3, color: T.muted, marginBottom: 12,
                    }}
                >{i18n.title_sub}</div>
                <p
                    style={{
                        fontSize: "clamp(13px,2vw,15px)", color: T.muted, maxWidth: 520,
                        margin: "0 auto 28px", lineHeight: 1.7,
                    }}
                    dangerouslySetInnerHTML={{ __html: i18n.intro }}
                />
                <div style={{ display: "flex", gap: 28, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
                    {[["6", i18n.stat_tools], ["$0", i18n.stat_cost], ["100%", i18n.stat_private], ["IDX+", i18n.stat_cov]].map(([n, l], i) => (
                        <div key={i} style={{ textAlign: "center" }}>
                            <div style={{ fontFamily: T.fontHeading, fontSize: 32, letterSpacing: 1, color: T.primary }}>{n}</div>
                            <div style={{ fontSize: 8, color: T.muted, letterSpacing: 2, marginTop: 2 }}>{l}</div>
                        </div>
                    ))}
                </div>
                <div
                    style={{
                        maxWidth: 420, margin: "0 auto", display: "flex",
                        border: `1px solid ${T.border}`, background: T.panel,
                    }}
                >
                    <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder={i18n.search_ph}
                        data-testid="neutools-search"
                        style={{
                            flex: 1, background: "none", border: "none", outline: "none",
                            color: T.text, fontFamily: T.fontBody, fontSize: 12, padding: "11px 14px",
                        }}
                    />
                    <span style={{ padding: "10px 14px", color: T.muted }}>
                        <Search size={14} />
                    </span>
                </div>
            </section>

            {/* Grid */}
            <section style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 18px 64px" }}>
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 22, flexWrap: "wrap", gap: 8,
                }}>
                    <div style={{ fontFamily: T.fontHeading, fontSize: 22, letterSpacing: 2 }}>{i18n.grid_title}</div>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 1 }}>
                        {list.length} {i18n.grid_count}
                    </div>
                </div>
                <div
                    data-testid="neutools-grid"
                    style={{
                        display: "grid", gap: 14,
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    }}
                >
                    {list.map((t) => {
                        const d = t[lang] || t.en;
                        return (
                            <button
                                key={t.tid}
                                onClick={() => onOpen(t.tid)}
                                data-testid={`neutools-card-${t.tid}`}
                                style={{
                                    background: T.panel, border: `1px solid ${T.border}`,
                                    padding: 22, cursor: "pointer", textAlign: "left",
                                    transition: "all .2s", color: T.text,
                                    display: "flex", flexDirection: "column", gap: 10,
                                    fontFamily: T.fontBody, position: "relative",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = `${T.primary}66`;
                                    e.currentTarget.style.background = T.panel2;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = T.border;
                                    e.currentTarget.style.background = T.panel;
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: 26, color: T.primary, lineHeight: 1 }}>{t.ic}</span>
                                    <span style={{
                                        fontSize: 8, letterSpacing: 1, color: T.muted,
                                        border: `1px solid ${T.border}`, padding: "2px 7px",
                                    }}>{t.n}</span>
                                </div>
                                <div style={{
                                    fontFamily: T.fontHeading, fontSize: 20, letterSpacing: 1,
                                    color: T.text, lineHeight: 1.1,
                                }}>{d.nm}</div>
                                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, flex: 1 }}>
                                    {d.ds}
                                </div>
                                <div style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    marginTop: 4,
                                }}>
                                    <span style={{
                                        fontSize: 8, letterSpacing: 1, color: T.primary,
                                        border: `1px solid ${T.primary}33`, padding: "2px 7px",
                                    }}>{d.ct}</span>
                                    <ArrowRight size={14} color={T.primary} />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>
        </main>
    );
}

// ─────────────────────────────────────────────────────────────
// Tool Detail — wraps info panels + the interactive UI
// ─────────────────────────────────────────────────────────────
function ToolDetail({ tool, lang, i18n, onBack }) {
    const d = tool[lang] || tool.en;
    const infoForLang = TOOL_INFO[tool.tid][lang] || TOOL_INFO[tool.tid].en;

    return (
        <main style={{ maxWidth: 800, margin: "0 auto", padding: "18px 18px 64px" }}>
            <button
                onClick={onBack}
                data-testid="neutools-back"
                style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "none", border: "none", color: T.muted,
                    fontFamily: T.fontBody, fontSize: 10, letterSpacing: 1,
                    cursor: "pointer", padding: "10px 0 14px",
                }}
            >
                <ArrowLeft size={12} />
                <span style={{ color: T.primary, textDecoration: "underline" }}>← {i18n.back_all}</span>
            </button>

            {/* Header */}
            <header
                style={{
                    background: T.panel, border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${T.primary}`,
                    padding: "26px 24px", marginBottom: 14,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 34, color: T.primary, lineHeight: 1 }}>{tool.ic}</span>
                    <span style={{
                        fontSize: 9, letterSpacing: 2, color: T.primary,
                        border: `1px solid ${T.primary}66`, padding: "2px 9px",
                    }}>TOOL {tool.n}</span>
                </div>
                <h2 style={{
                    fontFamily: T.fontHeading,
                    fontSize: "clamp(26px,5vw,42px)", letterSpacing: 2,
                    color: T.text, lineHeight: 1, margin: "0 0 8px",
                }}>{d.nm}<sup style={{ fontSize: 14, color: T.primary }}>™</sup></h2>
                <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
                    {d.tg} · {d.ct}
                </div>
            </header>

            {/* English-only notice for StockSlang */}
            {!tool.bilingual && (
                <div
                    data-testid="neutools-en-only-notice"
                    style={{
                        background: `${T.primary}11`, border: `1px solid ${T.primary}33`,
                        padding: "10px 14px", marginBottom: 14, fontSize: 11,
                        color: T.primary, letterSpacing: 1,
                    }}
                >
                    <strong>EN-ONLY</strong> · {i18n.slang_engonly}
                </div>
            )}

            <InfoPanel label={i18n.sec_what} html={infoForLang.wh} />
            <InfoPanel label={i18n.sec_why} html={infoForLang.wy} />
            <StepsPanel label={i18n.sec_how} steps={infoForLang.hw} />
            <RefsPanel label={i18n.sec_refs} refs={infoForLang.rf} />

            {/* Interactive UI per tool */}
            <ToolUI toolId={tool.tid} lang={lang} />

            {/* CTA */}
            <section
                style={{
                    background: `linear-gradient(135deg, ${T.primary}10, ${T.accent}08)`,
                    border: `1px solid ${T.primary}33`,
                    padding: 18, marginTop: 14, display: "flex",
                    alignItems: "center", justifyContent: "space-between",
                    flexWrap: "wrap", gap: 12,
                }}
            >
                <div>
                    <h3 style={{ fontFamily: T.fontHeading, fontSize: 16, letterSpacing: 1, color: T.text }}>
                        {i18n.cta_h}
                    </h3>
                    <p style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{i18n.cta_p}</p>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    <Link to="/dashboard" style={ctaBtnStyle(true)}>NEULAB DASHBOARD</Link>
                    <Link to="/stockdna" style={ctaBtnStyle(false)}>STOCKDNA QUIZ</Link>
                </div>
            </section>
        </main>
    );
}

function ctaBtnStyle(primary) {
    return {
        fontFamily: T.fontBody, fontSize: 9, letterSpacing: 1,
        padding: "8px 13px", textDecoration: "none",
        background: primary ? T.primary : "transparent",
        color: primary ? T.bg : T.primary,
        border: `1px solid ${T.primary}`,
        fontWeight: primary ? 700 : 500,
    };
}

function InfoPanel({ label, html }) {
    return (
        <section style={panelStyle}>
            <h4 style={ipLabelStyle}>{label}</h4>
            <div
                style={{ fontSize: 13, color: T.muted, lineHeight: 1.8 }}
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </section>
    );
}

function StepsPanel({ label, steps }) {
    return (
        <section style={panelStyle}>
            <h4 style={ipLabelStyle}>{label}</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 12 }}>
                        <div style={{ fontFamily: T.fontHeading, fontSize: 18, color: T.primary, minWidth: 22, lineHeight: 1 }}>
                            {i + 1}
                        </div>
                        <div
                            style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, paddingTop: 1 }}
                            dangerouslySetInnerHTML={{ __html: s }}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}

function RefsPanel({ label, refs }) {
    return (
        <section style={panelStyle}>
            <h4 style={ipLabelStyle}>{label}</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {refs.map((r, i) => (
                    <div key={i} style={{
                        display: "flex", gap: 9, background: T.panel2,
                        border: `1px solid ${T.border}`, padding: 11,
                    }}>
                        <span style={{ fontSize: 9, color: T.primary, minWidth: 20 }}>[{i + 1}]</span>
                        <span
                            style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}
                            dangerouslySetInnerHTML={{ __html: r }}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}

const panelStyle = {
    background: T.panel, border: `1px solid ${T.border}`,
    padding: 20, marginBottom: 12,
};
const ipLabelStyle = {
    fontFamily: T.fontBody, fontSize: 9, letterSpacing: 3,
    textTransform: "uppercase", color: T.primary, marginBottom: 12,
    paddingBottom: 8, borderBottom: `1px solid ${T.border}`,
};

// ─────────────────────────────────────────────────────────────
// Tool UI dispatcher
// ─────────────────────────────────────────────────────────────
function ToolUI({ toolId, lang }) {
    if (toolId === "horo") return <HoroscopeUI lang={lang} />;
    if (toolId === "calc") return <CalcUI lang={lang} />;
    if (toolId === "bear") return <BearUI lang={lang} />;
    if (toolId === "latte") return <LatteUI lang={lang} />;
    if (toolId === "slang") return <SlangUI />;
    if (toolId === "tm") return <TimeMachineUI lang={lang} />;
    return null;
}

// ── Shared form styling ──
const cuiStyle = {
    background: T.panel, border: `1px solid ${T.border}`,
    borderTop: `2px solid ${T.primary}`, padding: 22, marginBottom: 12,
};
const ctitStyle = {
    fontFamily: T.fontHeading, fontSize: 18, letterSpacing: 1,
    color: T.text, marginBottom: 18,
};
const flStyle = {
    fontFamily: T.fontBody, fontSize: 9, letterSpacing: 2,
    textTransform: "uppercase", color: T.muted, marginBottom: 4,
};
const fiStyle = {
    width: "100%", background: T.panel2, border: `1px solid ${T.border}`,
    color: T.text, fontFamily: T.fontBody, fontSize: 12, padding: "10px 12px",
    outline: "none",
};
const bgoStyle = {
    width: "100%", fontFamily: T.fontHeading, fontSize: 16, letterSpacing: 2,
    padding: 13, background: T.primary, color: T.bg, border: "none",
    cursor: "pointer", marginTop: 6, textTransform: "uppercase", fontWeight: 700,
};
const resStyle = {
    background: T.panel2, border: `1px solid ${T.primary}33`,
    padding: 20, marginTop: 14,
};

const rupiah = (n) => {
    if (n >= 1e12) return "Rp " + (n / 1e12).toFixed(1) + " T";
    if (n >= 1e9) return "Rp " + (n / 1e9).toFixed(1) + " M";
    if (n >= 1e6) return "Rp " + (n / 1e6).toFixed(1) + " Jt";
    return "Rp " + Math.round(n).toLocaleString();
};

// Map StockDNA archetype keys → StockHoroscope type keys. Most align 1:1;
// the four that differ get mapped here. Read by HoroscopeUI so a user who
// already took the StockDNA quiz lands directly on their reading.
const DNA_TO_HORO = {
    visionary: "visionary",
    analyst: "analyst",
    bold: "maverick",
    steady: "steady",
    explorer: "explorer",
    conservative: "guardian",
    balanced: "strategist",
    patient: "timelord",
};

// ── 1. StockHoroscope ──
function HoroscopeUI({ lang }) {
    // Auto-select the archetype the user identified with in StockDNA — if any.
    // Falls back to null (manual picker) when no result has been saved.
    const initialPick = (() => {
        try {
            const dna = localStorage.getItem("stockdna_archetype");
            return dna && DNA_TO_HORO[dna] && HORO_READINGS[DNA_TO_HORO[dna]]
                ? DNA_TO_HORO[dna]
                : null;
        } catch (_) { return null; }
    })();
    const [pick, setPick] = useState(initialPick);
    const [autoSourced, setAutoSourced] = useState(Boolean(initialPick));
    // Live macro data — fetched from /api/neutools/market-pulse (server-cached
    // 5 min). The reading itself is personality-based interpretation and does
    // NOT depend on these numbers — they are contextual atmosphere only. If
    // they fail we degrade quietly so the reading still feels intentional.
    const [md, setMd] = useState(null);
    const [mdState, setMdState] = useState("loading"); // loading|ready|refreshing

    useEffect(() => {
        let cancelled = false;
        let retryTimer = null;
        const attempt = async (tryNum) => {
            try {
                const r = await axios.get(`${API_BASE}/neutools/market-pulse`, { timeout: 15000 });
                if (cancelled) return;
                setMd(r.data);
                setMdState("ready");
            } catch (_) {
                if (cancelled) return;
                // Silently retry up to 2 more times (5s, then 15s) before
                // surfacing anything to the user. Most yfinance hiccups
                // resolve on the second attempt.
                if (tryNum < 3) {
                    retryTimer = setTimeout(() => attempt(tryNum + 1), tryNum === 1 ? 5000 : 15000);
                } else {
                    setMdState("refreshing"); // benign label — never "UNAVAILABLE"
                }
            }
        };
        attempt(1);
        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, []);

    const reading = pick ? (HORO_READINGS[pick][lang] || HORO_READINGS[pick].en) : null;

    // Weather classification driven by REAL VIX
    const vixNum = md?.vix ?? null;
    const weatherEn = vixNum == null ? null
        : vixNum > 28 ? "STORM WARNING"
        : vixNum > 22 ? "OVERCAST"
        : vixNum < 14 ? "CLEAR SKIES"
        : "PARTLY CLOUDY";

    return (
        <section style={cuiStyle}>
            <div style={ctitStyle}>✦ {lang === "id" ? "Bacaan Pasar Harian Anda" : "Your Daily Market Reading"}</div>
            {autoSourced && pick && (
                <div
                    data-testid="horo-autopicked-banner"
                    style={{
                        background: "#7c3aed14",
                        border: "1px solid #7c3aed55",
                        padding: "8px 12px",
                        marginBottom: 14,
                        fontSize: 11,
                        color: "#c4b5fd",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    <span>
                        🧬 {lang === "id"
                            ? "Dipersonalisasi dari hasil StockDNA Anda — "
                            : "Personalised from your StockDNA — "}
                        <strong style={{ color: "#ddd6fe" }}>
                            {HORO_TYPES[pick]?.[lang] || HORO_TYPES[pick]?.en}
                        </strong>
                    </span>
                    <button
                        onClick={() => { setAutoSourced(false); setPick(null); }}
                        data-testid="horo-switch-archetype"
                        style={{
                            background: "transparent",
                            border: "1px solid #7c3aed55",
                            color: "#c4b5fd",
                            fontFamily: T.fontBody,
                            fontSize: 9,
                            letterSpacing: 1,
                            padding: "4px 10px",
                            cursor: "pointer",
                        }}
                    >
                        {lang === "id" ? "GANTI" : "SWITCH"}
                    </button>
                </div>
            )}
            <div style={{ ...flStyle, marginBottom: 10 }}>
                {lang === "id" ? "PILIH TIPE INVESTOR ANDA" : "SELECT YOUR INVESTOR TYPE"}
            </div>
            <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))",
                gap: 7, marginBottom: 16,
            }}>
                {Object.entries(HORO_TYPES).map(([k, t]) => (
                    <button
                        key={k}
                        onClick={() => { setPick(k); setAutoSourced(false); }}
                        data-testid={`horo-type-${k}`}
                        style={{
                            background: pick === k ? `${T.primary}22` : T.panel2,
                            border: `1px solid ${pick === k ? T.primary : T.border}`,
                            color: pick === k ? T.primary : T.muted,
                            padding: 11, cursor: "pointer", textAlign: "center",
                            fontFamily: T.fontBody, fontSize: 9, letterSpacing: 1,
                        }}
                    >{t[lang] || t.en}</button>
                ))}
            </div>

            <div
                data-testid="horo-market-bar"
                style={{
                    background: T.panel2, border: `1px solid ${T.border}`,
                    padding: 13, marginBottom: 14, display: "flex",
                    alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
                }}
            >
                {md && weatherEn ? (
                    <>
                        <div>
                            <div style={{ fontFamily: T.fontHeading, fontSize: 14, letterSpacing: 1, color: T.text }}>
                                {weatherEn}
                            </div>
                            <div style={{ fontSize: 10, color: T.muted }}>
                                VIX: {md.vix ?? "—"} · S&P 5D: {md.sp500_5d_pct != null ? (md.sp500_5d_pct >= 0 ? "+" : "") + md.sp500_5d_pct + "%" : "—"} · IHSG 5D: {md.ihsg_5d_pct != null ? (md.ihsg_5d_pct >= 0 ? "+" : "") + md.ihsg_5d_pct + "%" : "—"}
                            </div>
                        </div>
                        <div
                            style={{ fontSize: 8, letterSpacing: 1, color: T.accent, opacity: 0.8 }}
                            title={`As of ${md.as_of}${md.cached ? " (cached)" : ""}`}
                        >
                            ● LIVE · yfinance
                        </div>
                    </>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                            style={{
                                width: 8, height: 8, borderRadius: "50%",
                                background: T.muted, opacity: 0.6,
                                animation: "pulse 1.6s ease-in-out infinite",
                            }}
                        />
                        <div>
                            <div style={{ fontFamily: T.fontHeading, fontSize: 13, letterSpacing: 1, color: T.muted }}>
                                {mdState === "loading"
                                    ? (lang === "id" ? "MEMUAT KONTEKS PASAR…" : "LOADING MARKET CONTEXT…")
                                    : (lang === "id" ? "KONTEKS PASAR MENYEGAR…" : "MARKET CONTEXT REFRESHING…")}
                            </div>
                            <div style={{ fontSize: 10, color: T.muted, opacity: 0.75 }}>
                                {lang === "id"
                                    ? "Bacaan Anda di bawah ini tetap dipersonalisasi."
                                    : "Your reading below is still personalised."}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {reading && (
                <div data-testid="horo-card" style={resStyle}>
                    <div style={{
                        fontFamily: '"Georgia",serif', fontStyle: "italic",
                        fontSize: "clamp(14px,2.5vw,17px)", color: T.text,
                        borderLeft: `3px solid ${T.primary}`, paddingLeft: 14, marginBottom: 16, lineHeight: 1.5,
                    }}>{reading.sig}</div>
                    <SectionLabel>{lang === "id" ? "PANDUAN ANDA" : "YOUR GUIDANCE"}</SectionLabel>
                    <P html={reading.guid} />
                    <SectionLabel>⚡ {lang === "id" ? "GERAKAN KEKUATAN" : "POWER MOVE"}</SectionLabel>
                    <P html={reading.pwr} />
                    <SectionLabel>🚫 {lang === "id" ? "HINDARI HARI INI" : "AVOID TODAY"}</SectionLabel>
                    <P html={reading.avoid} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, margin: "12px 0" }}>
                        <SectorChip lucky label={lang === "id" ? "SEKTOR BERUNTUNG" : "LUCKY SECTOR"} value={reading.lucky} />
                        <SectorChip label={lang === "id" ? "TIDAK BERUNTUNG" : "UNLUCKY SECTOR"} value={reading.unlucky} />
                    </div>
                    <div style={{
                        textAlign: "center", padding: 13, borderTop: `1px solid ${T.border}`,
                        fontFamily: '"Georgia",serif', fontStyle: "italic",
                        color: T.amber, fontSize: 13, marginTop: 12,
                    }}>★ {reading.fort} ★</div>
                </div>
            )}
        </section>
    );
}

function SectionLabel({ children }) {
    return <div style={{ fontFamily: T.fontBody, fontSize: 9, letterSpacing: 2, color: T.primary, textTransform: "uppercase", marginBottom: 5, marginTop: 11 }}>{children}</div>;
}
function P({ html }) {
    return <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: html }} />;
}
function SectorChip({ lucky, label, value }) {
    const color = lucky ? T.accent : T.danger;
    return (
        <div style={{ border: `1px solid ${color}55`, background: `${color}0a`, padding: 11, textAlign: "center" }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: T.muted, marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: T.fontHeading, fontSize: 14, letterSpacing: 1, color }}>{value}</div>
        </div>
    );
}

// ── 2. StockCalc ──
function CalcUI({ lang }) {
    const [amt, setAmt] = useState(500000);
    const [rate, setRate] = useState(12);
    const [years, setYears] = useState(20);
    const [goal, setGoal] = useState("num");
    const [out, setOut] = useState(null);

    const run = () => {
        const mr = rate / 100 / 12, mo = years * 12;
        const fv = amt * (Math.pow(1 + mr, mo) - 1) / mr;
        const ti = amt * mo;
        setOut({ fv, ti, ig: fv - ti });
    };

    const goalLabels = {
        num: "", house: lang === "id" ? "🏠 Rumah" : "🏠 A House",
        car: lang === "id" ? "🚗 Mobil" : "🚗 A Car",
        retire: lang === "id" ? "🌴 Dana Pensiun" : "🌴 Retirement Fund",
    };

    return (
        <section style={cuiStyle}>
            <div style={ctitStyle}>≣ {lang === "id" ? "Kalkulator Impian Investasi" : "Investment Dream Calculator"}</div>
            <Row>
                <Field label={lang === "id" ? "Investasi Bulanan (Rp)" : "Monthly Investment (Rp)"}>
                    <input type="number" value={amt} onChange={(e) => setAmt(+e.target.value || 0)} style={fiStyle} data-testid="calc-amt" />
                </Field>
                <Field label={lang === "id" ? "Imbal Hasil %" : "Return %"}>
                    <div style={{ fontFamily: T.fontHeading, fontSize: 18, color: T.primary, marginBottom: 4 }}>{rate}%</div>
                    <input type="range" min="4" max="30" value={rate} onChange={(e) => setRate(+e.target.value)} style={rangeStyle} />
                </Field>
            </Row>
            <Row>
                <Field label={lang === "id" ? "Waktu (Tahun)" : "Time (Years)"}>
                    <div style={{ fontFamily: T.fontHeading, fontSize: 18, color: T.primary, marginBottom: 4 }}>{years}</div>
                    <input type="range" min="1" max="40" value={years} onChange={(e) => setYears(+e.target.value)} style={rangeStyle} />
                </Field>
                <Field label={lang === "id" ? "Tujuan Hidup" : "Life Goal"}>
                    <select value={goal} onChange={(e) => setGoal(e.target.value)} style={fiStyle}>
                        <option value="num">{lang === "id" ? "Tunjukkan Angkanya" : "Show The Number"}</option>
                        <option value="house">{lang === "id" ? "🏠 Rumah" : "🏠 A House"}</option>
                        <option value="car">{lang === "id" ? "🚗 Mobil" : "🚗 A Car"}</option>
                        <option value="retire">{lang === "id" ? "🌴 Pensiun" : "🌴 Retirement"}</option>
                    </select>
                </Field>
            </Row>
            <button onClick={run} style={bgoStyle} data-testid="calc-run">
                {lang === "id" ? "HITUNG IMPIAN SAYA" : "CALCULATE MY DREAM"}
            </button>
            {out && (
                <div style={resStyle} data-testid="calc-result">
                    <div style={{ fontFamily: T.fontHeading, fontSize: "clamp(30px,7vw,50px)", letterSpacing: 2, color: T.primary, lineHeight: 1 }}>
                        {rupiah(out.fv)}
                    </div>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 2, marginTop: 4, marginBottom: 12 }}>
                        {goal !== "num" ? `${lang === "id" ? "Cukup untuk: " : "Enough to buy: "}${goalLabels[goal]}` : lang === "id" ? "Nilai Akhir" : "Final Value"}
                    </div>
                    <Grid3 cells={[
                        [rupiah(out.ti), lang === "id" ? "Total Diinvestasikan" : "Total Invested"],
                        [rupiah(out.ig), lang === "id" ? "Bunga Diperoleh" : "Interest Earned", T.accent],
                        [Math.round(out.ig / out.ti * 100) + "%", lang === "id" ? "Imbal Hasil Total" : "Total Return"],
                    ]} />
                </div>
            )}
        </section>
    );
}

// ── 3. Bear Survival Quiz ──
function BearUI({ lang }) {
    const [cur, setCur] = useState(0);
    const [ans, setAns] = useState({});
    const [score, setScore] = useState(0);
    const [done, setDone] = useState(false);

    const pick = (oi) => {
        if (ans[cur] !== undefined) return;
        const correct = oi === BEAR_SCENARIOS[cur].best;
        setAns({ ...ans, [cur]: oi });
        if (correct) setScore((s) => s + 1);
        setTimeout(() => {
            if (cur + 1 < BEAR_SCENARIOS.length) setCur(cur + 1);
            else setDone(true);
        }, 2200);
    };
    const reset = () => { setCur(0); setAns({}); setScore(0); setDone(false); };

    if (done) {
        const pct = score / BEAR_SCENARIOS.length;
        const g = pct >= 0.8 ? "A" : pct >= 0.6 ? "B" : pct >= 0.4 ? "C" : pct >= 0.2 ? "D" : "F";
        const gc = { A: T.accent, B: "#448aff", C: T.amber, D: "#ff6e40", F: T.danger }[g];
        const msgs = {
            A: lang === "id" ? "Penyintas elit. Anda menghasilkan uang saat crash." : "Elite survivor. You make money during crashes.",
            B: lang === "id" ? "Disiplin kuat. Kebocoran emosional kecil." : "Strong discipline. Minor emotional leaks.",
            C: lang === "id" ? "Campuran. Anda bertahan tapi meninggalkan keuntungan." : "Mixed. You survive but leave gains behind.",
            D: lang === "id" ? "Risiko panik tinggi." : "High panic risk. Study crash history more deeply.",
            F: lang === "id" ? "Anda akan kehilangan sebagian besar kekayaan." : "You would lose most wealth in real crashes.",
        };
        return (
            <section style={cuiStyle}>
                <div style={{ textAlign: "center", padding: 28, background: T.panel2, border: `1px solid ${T.primary}33` }} data-testid="bear-final">
                    <div style={{ fontFamily: T.fontHeading, fontSize: 70, letterSpacing: 4, color: gc, lineHeight: 1 }}>{g}</div>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: T.muted, marginTop: 8 }}>
                        {lang === "id" ? "SKOR KETAHANAN" : "SURVIVAL SCORE"} · {score}/{BEAR_SCENARIOS.length} {lang === "id" ? "BENAR" : "CORRECT"}
                    </div>
                    <p style={{ fontSize: 13, color: T.muted, maxWidth: 360, margin: "16px auto 0", lineHeight: 1.7 }}>{msgs[g]}</p>
                    <button onClick={reset} style={{ ...bgoStyle, maxWidth: 220, marginTop: 18 }} data-testid="bear-reset">
                        {lang === "id" ? "ULANGI" : "RESET"}
                    </button>
                </div>
            </section>
        );
    }

    const s = BEAR_SCENARIOS[cur];
    return (
        <section style={cuiStyle}>
            <div style={{ fontFamily: T.fontBody, fontSize: 9, color: T.muted, letterSpacing: 2, marginBottom: 12 }}>
                {lang === "id" ? "SKENARIO" : "SCENARIO"} {cur + 1} {lang === "id" ? "DARI" : "OF"} {BEAR_SCENARIOS.length}
            </div>
            <div style={{ background: T.panel2, border: `1px solid ${T.border}`, padding: 18 }} data-testid={`bear-scenario-${cur}`}>
                <div style={{ fontFamily: T.fontHeading, fontSize: 30, letterSpacing: 2, color: T.danger, marginBottom: 4 }}>{s.y}</div>
                <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, marginBottom: 4 }}>{lang === "id" ? s.ctx_id : s.ctx_en}</div>
                <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.6, marginBottom: 14 }}>{lang === "id" ? s.det_id : s.det_en}</div>
                <div style={{ fontFamily: T.fontHeading, fontSize: 15, letterSpacing: 1, color: T.text, marginBottom: 10 }}>{lang === "id" ? s.q_id : s.q_en}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {(lang === "id" ? s.o_id : s.o_en).map((label, j) => {
                        const picked = ans[cur] === j;
                        const correct = j === s.best;
                        const revealed = ans[cur] !== undefined;
                        let style = {
                            background: T.panel, border: `1px solid ${T.border}`,
                            padding: "11px 14px", cursor: revealed ? "default" : "pointer",
                            color: T.text, textAlign: "left", fontSize: 12.5,
                            transition: "all .15s", display: "flex", gap: 9,
                            alignItems: "flex-start", fontFamily: T.fontBody,
                        };
                        if (revealed) {
                            if (picked && correct) { style = { ...style, borderColor: T.accent, background: `${T.accent}15`, color: T.accent }; }
                            else if (picked && !correct) { style = { ...style, borderColor: T.danger, background: `${T.danger}10`, color: T.danger }; }
                            else if (correct) { style = { ...style, borderColor: T.accent, background: `${T.accent}10`, color: T.accent }; }
                        }
                        return (
                            <button key={j} onClick={() => pick(j)} disabled={revealed} style={style}>
                                <span style={{ fontFamily: T.fontHeading, fontSize: 13, color: T.primary, minWidth: 16 }}>{"ABCD"[j]}</span>
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
                {ans[cur] !== undefined && (
                    <div style={{
                        background: T.panel, borderLeft: `3px solid ${T.amber}`, padding: 13, marginTop: 10,
                        fontSize: 12, color: T.muted, lineHeight: 1.7,
                    }}>
                        <strong style={{ color: T.amber }}>{lang === "id" ? "Yang Sebenarnya Terjadi:" : "What Actually Happened:"}</strong>
                        <br />{lang === "id" ? s.rev_id : s.rev_en}
                    </div>
                )}
            </div>
        </section>
    );
}

// ── 4. Latte Factor ──
function LatteUI({ lang }) {
    const [name, setName] = useState(lang === "id" ? "Kopi Susu Harian" : "Daily Kopi Susu");
    const [cost, setCost] = useState(35000);
    const [rate, setRate] = useState(12);
    const [stk, setStk] = useState("BBCA");
    const [out, setOut] = useState(null);

    const run = () => {
        const calc = (yr) => {
            const mr = rate / 100 / 12, mo = cost * 30.44;
            return mo * (Math.pow(1 + mr, yr * 12) - 1) / mr;
        };
        setOut({ v10: calc(10), v20: calc(20), v30: calc(30) });
    };

    return (
        <section style={cuiStyle}>
            <div style={ctitStyle}>◐ {lang === "id" ? "Kalkulator Faktor Latte" : "Latte Factor Calculator"}</div>
            <Row>
                <Field label={lang === "id" ? "Nama Kebiasaan" : "Habit Name"}>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={fiStyle} data-testid="latte-name" />
                </Field>
                <Field label={lang === "id" ? "Biaya Harian (Rp)" : "Daily Cost (Rp)"}>
                    <input type="number" value={cost} onChange={(e) => setCost(+e.target.value || 0)} style={fiStyle} data-testid="latte-cost" />
                </Field>
            </Row>
            <Row>
                <Field label={lang === "id" ? "Imbal Hasil Jika Diinvestasikan %" : "Return If Invested %"}>
                    <div style={{ fontFamily: T.fontHeading, fontSize: 18, color: T.primary, marginBottom: 4 }}>{rate}%</div>
                    <input type="range" min="4" max="25" value={rate} onChange={(e) => setRate(+e.target.value)} style={rangeStyle} />
                </Field>
                <Field label={lang === "id" ? "Saham Referensi" : "Reference Stock"}>
                    <select value={stk} onChange={(e) => setStk(e.target.value)} style={fiStyle}>
                        <option>BBCA</option><option>IHSG</option><option>S&amp;P 500</option><option>NVDA</option><option>Apple</option>
                    </select>
                </Field>
            </Row>
            <button onClick={run} style={bgoStyle} data-testid="latte-run">
                {lang === "id" ? "HITUNG BIAYA NYATA" : "CALCULATE TRUE COST"}
            </button>
            {out && (
                <div style={resStyle} data-testid="latte-result">
                    <div style={{ fontFamily: T.fontHeading, fontSize: "clamp(28px,7vw,46px)", color: T.primary }}>{rupiah(out.v30)}</div>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 2, marginTop: 4, marginBottom: 12 }}>
                        {lang === "id" ? `Biaya nyata 30 tahun dari ${name} jika diinvestasikan di ${stk}` : `True 30-year cost of ${name} if invested in ${stk}`}
                    </div>
                    <Grid3 cells={[
                        [rupiah(out.v10), "10 " + (lang === "id" ? "Thn" : "Yrs")],
                        [rupiah(out.v20), "20 " + (lang === "id" ? "Thn" : "Yrs")],
                        [rupiah(cost * 365), lang === "id" ? "Biaya/Tahun" : "Cost/Year"],
                    ]} />
                </div>
            )}
        </section>
    );
}

// ── 5. StockSlang (English only) ──
function SlangUI() {
    const [q, setQ] = useState("");
    const [cat, setCat] = useState("");
    const list = useMemo(() => {
        const f = q.toLowerCase();
        return SLANG_TERMS.filter((s) =>
            (!f || s.t.toLowerCase().includes(f) || s.en.toLowerCase().includes(f))
            && (!cat || s.c === cat)
        );
    }, [q, cat]);
    const cats = ["", "Valuation", "Risk", "IDX", "Strategy", "Income", "Market", "Fundamental"];

    return (
        <section style={cuiStyle}>
            <div style={ctitStyle}>§ Financial Jargon Translator</div>
            <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search term…"
                style={{ ...fiStyle, marginBottom: 10 }}
                data-testid="slang-search"
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {cats.map((c) => (
                    <button
                        key={c || "all"} onClick={() => setCat(c)}
                        data-testid={`slang-cat-${c || "all"}`}
                        style={{
                            fontFamily: T.fontBody, fontSize: 9, letterSpacing: 1,
                            padding: "6px 12px", cursor: "pointer",
                            background: cat === c ? T.primary : "transparent",
                            color: cat === c ? T.bg : T.muted,
                            border: `1px solid ${cat === c ? T.primary : T.border}`,
                            fontWeight: cat === c ? 700 : 400,
                        }}
                    >{c || "All"}</button>
                ))}
            </div>
            <div data-testid="slang-list">
                {list.map((s) => (
                    <div key={s.t} style={{
                        background: T.panel2, border: `1px solid ${T.border}`,
                        padding: 14, marginBottom: 8,
                    }}>
                        <span style={{
                            fontSize: 7, background: `${T.primary}22`, border: `1px solid ${T.primary}55`,
                            color: T.primary, padding: "2px 7px", letterSpacing: 1, display: "inline-block",
                            marginBottom: 6,
                        }}>{s.c}</span>
                        <div style={{ fontFamily: T.fontHeading, fontSize: 17, letterSpacing: 1, color: T.text, marginBottom: 6 }}>{s.t}</div>
                        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, marginBottom: 8 }}>{s.en}</div>
                        <div style={{
                            background: T.panel, borderLeft: `2px solid ${T.accent}`,
                            padding: "7px 11px", fontFamily: T.fontBody, fontSize: 10, color: T.accent,
                        }}>💬 {s.se}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

// ── 6. StockTimeMachine ──
function TimeMachineUI({ lang }) {
    const [date, setDate] = useState("2020-01-01");
    const [amt, setAmt] = useState(5000000);
    const [did, setDid] = useState("spent");
    const [stk, setStk] = useState("bbca");
    const [out, setOut] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const NAMES = { bbca: "BBCA", ihsg: "IHSG", sp500: "S&P 500", nvda: "NVDA", apple: "Apple" };

    const run = async () => {
        setErr(""); setBusy(true); setOut(null);
        try {
            // Hit the real historical-return endpoint.
            const r = await axios.get(`${API_BASE}/neutools/historical-return`, {
                params: { ticker: stk, from: date },
                timeout: 20000,
            });
            const data = r.data;
            // What-if invested value at the date → today
            const fv = amt * (1 + data.total_return_pct / 100);
            // What the user actually did with the money
            const yrs = data.years;
            const actual = did === "saved" ? amt * Math.pow(1.02, yrs) : amt;
            const missed = fv - actual;
            // Regret score: capped 0–100 from total return %, gentler curve
            const regret = Math.min(100, Math.max(0, Math.round(data.total_return_pct / 10)));
            // Forward projection: 20 years at the realised annualised return
            const future20 = amt * Math.pow(1 + data.annualised_return_pct / 100, 20);
            setOut({
                fv, actual, missed, regret, future20, yrs,
                annualised: data.annualised_return_pct,
                total: data.total_return_pct,
                start_close: data.start_close,
                end_close: data.end_close,
                start_date: data.start_date,
                end_date: data.end_date,
                cached: data.cached,
            });
        } catch (e) {
            setErr(
                e?.response?.data?.detail
                || (lang === "id"
                    ? "Data historis tidak tersedia — coba tanggal atau saham lain."
                    : "Historical data unavailable — try another date or ticker.")
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <section style={cuiStyle}>
            <div style={ctitStyle}>⌛ StockTimeMachine</div>
            <Row>
                <Field label={lang === "id" ? "Tanggal Masa Lalu" : "Past Date"}>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={fiStyle} data-testid="tm-date" />
                </Field>
                <Field label={lang === "id" ? "Jumlah (Rp)" : "Amount (Rp)"}>
                    <input type="number" value={amt} onChange={(e) => setAmt(+e.target.value || 0)} style={fiStyle} data-testid="tm-amt" />
                </Field>
            </Row>
            <Row>
                <Field label={lang === "id" ? "Apa yang Anda lakukan?" : "What did you do with that money?"}>
                    <select value={did} onChange={(e) => setDid(e.target.value)} style={fiStyle}>
                        <option value="spent">{lang === "id" ? "Dibelanjakan" : "Spent it"}</option>
                        <option value="saved">{lang === "id" ? "Disimpan di bank (2%/thn)" : "Saved in bank (2% pa)"}</option>
                    </select>
                </Field>
                <Field label={lang === "id" ? "Seandainya diinvestasikan di:" : "If invested in:"}>
                    <select value={stk} onChange={(e) => setStk(e.target.value)} style={fiStyle}>
                        <option value="bbca">BBCA.JK</option>
                        <option value="ihsg">IHSG (^JKSE)</option>
                        <option value="sp500">S&amp;P 500 (^GSPC)</option>
                        <option value="nvda">NVDA</option>
                        <option value="apple">Apple (AAPL)</option>
                    </select>
                </Field>
            </Row>
            <button onClick={run} disabled={busy} style={{ ...bgoStyle, opacity: busy ? 0.6 : 1 }} data-testid="tm-run">
                {busy
                    ? (lang === "id" ? "MENGAMBIL DATA HISTORIS…" : "FETCHING HISTORICAL DATA…")
                    : (lang === "id" ? "BUKA MESIN WAKTU" : "OPEN THE TIME MACHINE")}
            </button>
            {err && (
                <div data-testid="tm-error" style={{
                    background: `${T.danger}15`, border: `1px solid ${T.danger}55`,
                    color: T.danger, padding: 12, marginTop: 12, fontSize: 12,
                }}>
                    {err}
                </div>
            )}
            {out && (
                <div style={resStyle} data-testid="tm-result">
                    <div style={{ fontFamily: T.fontHeading, fontSize: "clamp(28px,7vw,46px)", color: T.primary }}>{rupiah(out.fv)}</div>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: 2, marginTop: 4, marginBottom: 12 }}>
                        {rupiah(amt)} {lang === "id" ? "di" : "in"} {NAMES[stk]} {lang === "id" ? "dari" : "from"} {new Date(out.start_date).toLocaleDateString()} {lang === "id" ? "sekarang bernilai" : "would be worth this today"}
                    </div>
                    <Grid3 cells={[
                        [rupiah(out.actual), lang === "id" ? "Nilai Aktual" : "Actual Value", T.danger],
                        [rupiah(out.fv), lang === "id" ? "Jika Diinvestasikan" : "If Invested", T.accent],
                        [rupiah(out.missed), lang === "id" ? "Keuntungan Terlewat" : "Missed Gain"],
                    ]} />
                    <div style={{
                        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
                        gap: 8, marginTop: 4,
                    }}>
                        <div style={{ background: T.panel, border: `1px solid ${T.border}`, padding: 11 }}>
                            <div style={{ fontFamily: T.fontBody, fontSize: 12, color: T.text }}>
                                {(out.total >= 0 ? "+" : "") + out.total.toFixed(1)}%
                            </div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
                                {lang === "id" ? "Total Pengembalian" : "Total Return"}
                            </div>
                        </div>
                        <div style={{ background: T.panel, border: `1px solid ${T.border}`, padding: 11 }}>
                            <div style={{ fontFamily: T.fontBody, fontSize: 12, color: T.text }}>
                                {(out.annualised >= 0 ? "+" : "") + out.annualised.toFixed(2)}% pa
                            </div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
                                {lang === "id" ? "Pengembalian Tahunan" : "Annualised"}
                            </div>
                        </div>
                        <div style={{ background: T.panel, border: `1px solid ${T.border}`, padding: 11 }}>
                            <div style={{ fontFamily: T.fontBody, fontSize: 12, color: T.text }}>
                                {out.regret}/100
                            </div>
                            <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>
                                {lang === "id" ? "Skor Penyesalan" : "Regret Score"}
                            </div>
                        </div>
                    </div>
                    <div style={{ fontSize: 9, color: T.accent, marginTop: 10, letterSpacing: 1 }}>
                        ● LIVE · yfinance · {out.start_date} → {out.end_date}{out.cached ? " · cached" : ""}
                    </div>
                    <div style={{
                        fontSize: 12, color: T.muted, lineHeight: 1.7,
                        borderLeft: `2px solid ${T.primary}`, paddingLeft: 12, marginTop: 12,
                    }}>
                        {lang === "id"
                            ? <>Penyesalan adalah sinyal. Rp {amt.toLocaleString()} yang dimulai hari ini di {NAMES[stk]} selama 20 tahun (pada {out.annualised.toFixed(1)}% pa) = <strong style={{ color: T.primary }}>{rupiah(out.future20)}</strong>. Mulai sekarang di <Link to="/dashboard" style={{ color: T.accent }}>dashboard NSI</Link>.</>
                            : <>The regret is a signal. Rp {amt.toLocaleString()} started today in {NAMES[stk]} for 20 years (at {out.annualised.toFixed(1)}% pa) = <strong style={{ color: T.primary }}>{rupiah(out.future20)}</strong>. Start now on the <Link to="/dashboard" style={{ color: T.accent }}>NSI dashboard</Link>.</>}
                    </div>
                </div>
            )}
        </section>
    );
}

// ── form helpers ──
function Row({ children }) {
    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>{children}</div>;
}
function Field({ label, children }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={flStyle}>{label}</div>
            {children}
        </div>
    );
}
function Grid3({ cells }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, margin: "10px 0" }}>
            {cells.map(([v, l, color], i) => (
                <div key={i} style={{ background: T.panel, border: `1px solid ${T.border}`, padding: 11 }}>
                    <div style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 500, color: color || T.text }}>{v}</div>
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{l}</div>
                </div>
            ))}
        </div>
    );
}

const rangeStyle = {
    width: "100%", height: 3, background: T.panel2, border: "none",
    outline: "none", cursor: "pointer", accentColor: T.primary,
};

// ─────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────
function NeuToolsFooter() {
    return (
        <footer
            style={{
                background: T.panel, borderTop: `1px solid ${T.border}`,
                padding: "24px 18px", textAlign: "center",
            }}
        >
            <div style={{ fontSize: 8, letterSpacing: 3, color: T.muted, textTransform: "uppercase", marginBottom: 12 }}>
                Part of the NeuLab Inc. Ecosystem
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/dashboard" style={ctaBtnStyle(true)}>NEULAB DASHBOARD</Link>
                <Link to="/stockdna" style={ctaBtnStyle(false)}>STOCKDNA QUIZ</Link>
                <a href="https://kidstocks.net" target="_blank" rel="noreferrer" style={ctaBtnStyle(false)}>KIDSTOCKS.NET</a>
            </div>
            <div style={{ fontSize: 8, color: T.muted, marginTop: 12 }}>
                © 2026 NeuLab Inc. · NeuTools™ · Not financial advice · Educational use only
            </div>
        </footer>
    );
}
