/* eslint-disable max-len, react/no-danger */
/**
 * StockDNAQuiz — themed engine that hosts the full landing → quiz →
 * loading → result flow. Pure client-side, no backend calls. Public.
 *
 * Theme prop drives every colour / font / corner-radius decision so a
 * single component works for both the cyber-dark adult site and the
 * cream-warm kid site.
 *
 * Acceptance:
 *   - 10-question quiz (8 base + 1 market-specific + 1 company-specific)
 *   - 8 investor archetypes, weighted-trait scoring
 *   - Bilingual EN/ID with live language toggle that re-renders without
 *     resetting answers
 *   - Recompute-safe RETAKE
 *   - data-testids on every interactive element + result content
 */
import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, ArrowRight, Share2, Copy, RotateCcw, ExternalLink, Globe, BookOpen } from "lucide-react";
import { QBASE, MKT_Q, CO_Q, REFERENCES } from "@/lib/stockDNA.data";
import { TYPES } from "@/lib/stockDNA.types";
import { STRINGS } from "@/lib/stockDNA.strings";

const SCREEN = { LAND: "land", QUIZ: "quiz", LOAD: "load", RESULT: "result" };

export default function StockDNAQuiz({ theme }) {
    const [lang, setLang] = useState("en");
    const [screen, setScreen] = useState(SCREEN.LAND);
    const [market, setMarket] = useState(null); // 'IDX' | 'INTL' | 'BOTH'
    const [answers, setAnswers] = useState({});
    const [qi, setQi] = useState(0);
    const [loadMsgIdx, setLoadMsgIdx] = useState(0);
    const [result, setResult] = useState(null);
    const [comment, setComment] = useState("");
    const [savedOK, setSavedOK] = useState(false);
    const T = STRINGS[lang];

    // Build the 10 effective questions for the chosen market
    const questions = useMemo(() => {
        if (!market) return [];
        return QBASE.map((q) => {
            if (q.isMkt) return { ...MKT_Q[market], src: q.src };
            if (q.isCo) return { ...CO_Q[market], src: q.src };
            return q;
        });
    }, [market]);

    // Loading screen rotates messages
    useEffect(() => {
        if (screen !== SCREEN.LOAD) return undefined;
        const iv = setInterval(() => setLoadMsgIdx((i) => (i + 1) % 4), 700);
        return () => clearInterval(iv);
    }, [screen]);

    const startQuiz = () => {
        if (!market) return;
        setAnswers({});
        setQi(0);
        setScreen(SCREEN.QUIZ);
    };

    const pick = (i) => setAnswers({ ...answers, [qi]: i });
    const next = () => {
        if (answers[qi] === undefined) return;
        if (qi < questions.length - 1) setQi(qi + 1);
        else compute();
    };
    const prev = () => qi > 0 && setQi(qi - 1);

    const compute = () => {
        setScreen(SCREEN.LOAD);
        setLoadMsgIdx(0);
        setTimeout(() => {
            const sc = {};
            Object.keys(answers).forEach((k) => {
                const traits = questions[k].opts[answers[k]].t;
                Object.keys(traits).forEach((tr) => { sc[tr] = (sc[tr] || 0) + traits[tr]; });
            });
            const top = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
            setResult(TYPES[top] || TYPES.balanced);
            setScreen(SCREEN.RESULT);
            window.scrollTo(0, 0);
        }, 2600);
    };

    const retake = () => {
        setAnswers({});
        setQi(0);
        setComment("");
        setSavedOK(false);
        setResult(null);
        setScreen(SCREEN.QUIZ);
        window.scrollTo(0, 0);
    };

    const doShare = async () => {
        if (!result) return;
        const txt = `🧬 My StockDNA: ${result.em} ${lang === "id" ? result.ni : result.ne}\nMarket: ${market} · Risk: ${lang === "id" ? result.ri : result.re}\nDiscover yours at neulab.xyz / kidstocks.net`;
        if (navigator.share) {
            try { await navigator.share({ title: "My StockDNA", text: txt }); } catch (_e) { /* user cancelled */ }
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(txt);
            // eslint-disable-next-line no-alert
            alert(lang === "id" ? "✓ Disalin!" : "✓ Copied!");
        }
    };
    const doCopy = async () => {
        if (!result || !navigator.clipboard) return;
        await navigator.clipboard.writeText(`StockDNA™: ${result.em} ${lang === "id" ? result.ni : result.ne} | ${market} | by NeuLab Inc.`);
        // eslint-disable-next-line no-alert
        alert(lang === "id" ? "✓ Disalin!" : "✓ Copied!");
    };

    // Shared visual helpers driven by the theme prop
    const css = theme;

    return (
        <div
            data-testid="stockdna-shell"
            style={{
                minHeight: "100vh",
                background: css.bg,
                color: css.text,
                fontFamily: css.fontBody,
                paddingTop: "calc(env(safe-area-inset-top) + 60px)",
                paddingBottom: 60,
                position: "relative",
                overflowX: "hidden",
            }}
        >
            <TopBar theme={css} lang={lang} setLang={setLang} />
            {screen === SCREEN.LAND && (
                <LandingScreen
                    theme={css} T={T} market={market} setMarket={setMarket} startQuiz={startQuiz}
                />
            )}
            {screen === SCREEN.QUIZ && (
                <QuizScreen
                    theme={css} T={T} lang={lang} questions={questions} qi={qi}
                    answers={answers} pick={pick} next={next} prev={prev}
                />
            )}
            {screen === SCREEN.LOAD && <LoadingScreen theme={css} T={T} msgIdx={loadMsgIdx} />}
            {screen === SCREEN.RESULT && result && (
                <ResultScreen
                    theme={css} T={T} lang={lang} market={market} result={result}
                    comment={comment} setComment={setComment} savedOK={savedOK}
                    onSave={() => setSavedOK(true)}
                    onShare={doShare} onCopy={doCopy} onRetake={retake}
                />
            )}
        </div>
    );
}

/* ---------- Top bar ---------- */
function TopBar({ theme, lang, setLang }) {
    return (
        <div
            data-testid="stockdna-topbar"
            style={{
                position: "fixed",
                top: 0, left: 0, right: 0,
                paddingTop: "env(safe-area-inset-top)",
                background: theme.headerBg,
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                borderBottom: `1px solid ${theme.border}`,
                zIndex: 100,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", maxWidth: 1200, margin: "0 auto" }}>
                <a href={theme.homeUrl} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: theme.text }} data-testid="stockdna-home-link">
                    <span style={{ width: 34, height: 34, background: `linear-gradient(135deg,${theme.primary},${theme.primary2})`, clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🧬</span>
                    <span>
                        <span style={{ fontFamily: theme.fontHeading, fontWeight: 800, fontSize: 18, letterSpacing: 0.5, display: "block", lineHeight: 1, color: theme.text }}>
                            StockDNA<sup style={{ fontSize: 9, color: theme.primary }}>™</sup>
                        </span>
                        <span style={{ fontSize: 8, color: theme.muted, letterSpacing: 2, textTransform: "uppercase" }}>{theme.brandSuffix}</span>
                    </span>
                </a>
                <div style={{ display: "flex", background: theme.panel2, border: `1px solid ${theme.border}`, borderRadius: theme.radius, overflow: "hidden" }} data-testid="stockdna-lang-switcher">
                    {["en", "id"].map((l) => (
                        <button
                            key={l}
                            onClick={() => setLang(l)}
                            data-testid={`stockdna-lang-${l}`}
                            style={{
                                fontFamily: theme.fontHeading, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                                padding: "7px 14px", border: "none", cursor: "pointer", textTransform: "uppercase",
                                background: lang === l ? theme.primary : "transparent",
                                color: lang === l ? theme.primaryFg : theme.muted,
                            }}
                        >{l}</button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ---------- Landing ---------- */
function LandingScreen({ theme, T, market, setMarket, startQuiz }) {
    const markets = [
        { k: "IDX", flag: "🇮🇩", label: "IDX", sub: T.market_idx },
        { k: "INTL", flag: "🌐", label: T.market_global_label, sub: T.market_global_sub },
        { k: "BOTH", flag: "⚡", label: T.market_both_label, sub: T.market_both_sub },
    ];
    return (
        <div data-testid="stockdna-landing" style={{ maxWidth: 720, margin: "0 auto", padding: "30px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 80, marginBottom: 12, lineHeight: 1, animation: "fl 3.5s ease-in-out infinite" }}>🧬</div>
            <h1 style={{
                fontFamily: theme.fontHeading, fontWeight: 800, fontSize: "clamp(36px,7vw,80px)",
                letterSpacing: -2, lineHeight: 1.05, margin: 0,
                background: `linear-gradient(135deg,${theme.text} 0%,${theme.primary} 55%,${theme.primary2} 100%)`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
                StockDNA<sup style={{ fontSize: "0.4em", color: theme.primary, WebkitTextFillColor: theme.primary }}>™</sup>
            </h1>
            <p style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: theme.primary, marginTop: 6 }}>{T.title}</p>
            <p style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", margin: "10px 0 24px", fontSize: 9, letterSpacing: 2, color: theme.muted, textTransform: "uppercase" }}>
                <span style={{ width: 24, height: 1, background: theme.muted }} />
                {T.powered_by}
                <a href={theme.homeUrl} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, textDecoration: "none", fontWeight: 700 }}>NeuLab Inc.</a>
                <span style={{ width: 24, height: 1, background: theme.muted }} />
            </p>
            <p style={{ fontSize: 14, color: theme.muted, maxWidth: 470, lineHeight: 1.7, margin: "0 auto 22px" }} dangerouslySetInnerHTML={{ __html: T.hero_desc.replace("<em>", `<em style="color:${theme.primary};font-style:normal;font-weight:600">`) }} />

            <p style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: theme.primary, margin: "20px 0 12px" }}>{T.market_label}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 26 }}>
                {markets.map((m) => (
                    <button
                        key={m.k}
                        onClick={() => setMarket(m.k)}
                        data-testid={`stockdna-market-${m.k}`}
                        style={{
                            background: market === m.k ? `${theme.primary}1a` : theme.panel,
                            border: `2px solid ${market === m.k ? theme.primary : theme.border}`,
                            padding: "14px 20px", cursor: "pointer", borderRadius: theme.radius,
                            minWidth: 120, color: theme.text, fontFamily: theme.fontBody,
                            transition: "all .2s",
                        }}
                    >
                        <div style={{ fontSize: 26, marginBottom: 4 }}>{m.flag}</div>
                        <div style={{ fontFamily: theme.fontHeading, fontWeight: 700, fontSize: 13 }}>{m.label}</div>
                        <div style={{ fontSize: 9, color: theme.muted, marginTop: 2 }}>{m.sub}</div>
                    </button>
                ))}
            </div>
            <button
                onClick={startQuiz}
                disabled={!market}
                data-testid="stockdna-start-btn"
                style={{
                    fontFamily: theme.fontHeading, fontSize: 15, fontWeight: 800, letterSpacing: 2,
                    padding: "17px 46px", background: market ? theme.primary : theme.panel2,
                    color: market ? theme.primaryFg : theme.muted, border: "none",
                    cursor: market ? "pointer" : "not-allowed",
                    clipPath: theme.angled ? "polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)" : "none",
                    borderRadius: theme.angled ? 0 : theme.radius,
                    textTransform: "uppercase",
                    boxShadow: market ? `0 0 28px ${theme.primary}40` : "none",
                    opacity: market ? 1 : 0.4,
                    transition: "all .2s",
                }}
            >{T.cta_start}</button>

            <div style={{ display: "flex", gap: 32, marginTop: 40, flexWrap: "wrap", justifyContent: "center" }}>
                {[["8", T.stat_types], ["10", T.stat_questions], ["5 min", T.stat_time], ["IDX+", T.stat_coverage]].map(([n, l]) => (
                    <div key={l}>
                        <div style={{ fontFamily: theme.fontHeading, fontSize: 26, fontWeight: 800, color: theme.primary }}>{n}</div>
                        <div style={{ fontSize: 9, color: theme.muted, letterSpacing: 1, marginTop: 2 }}>{l}</div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 28, background: theme.panel, border: `1px solid ${theme.border}`, borderLeft: `3px solid ${theme.primary2}`, padding: "14px 20px", maxWidth: 540, margin: "28px auto 0", textAlign: "left", borderRadius: `0 ${theme.radius}px ${theme.radius}px 0` }}>
                <div style={{ fontFamily: theme.fontHeading, fontSize: 9, fontWeight: 700, letterSpacing: 2, color: theme.primary2, textTransform: "uppercase", marginBottom: 7 }}>
                    <BookOpen size={11} style={{ display: "inline", marginRight: 5 }} /> {T.research_basis}
                </div>
                <p style={{ fontSize: 11, color: theme.muted, lineHeight: 1.7, margin: 0 }}>{T.research_body}</p>
            </div>
            <style>{`@keyframes fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
        </div>
    );
}

/* ---------- Quiz ---------- */
function QuizScreen({ theme, T, lang, questions, qi, answers, pick, next, prev }) {
    const tot = questions.length;
    const q = questions[qi];
    const pct = Math.round((qi / tot) * 100);
    const labels = ["A", "B", "C", "D"];
    const isLast = qi === tot - 1;
    const ready = answers[qi] !== undefined;
    return (
        <div data-testid="stockdna-quiz" style={{ maxWidth: 650, margin: "0 auto", padding: "20px" }}>
            <div style={{ marginBottom: 20 }}>
                <div style={{ background: theme.panel2, height: 3, borderRadius: 2, overflow: "hidden", marginBottom: 9 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${theme.primary},${theme.primary2})`, transition: "width .5s cubic-bezier(.4,0,.2,1)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: theme.muted, letterSpacing: 2 }}>
                    <span data-testid="stockdna-progress-label">{T.question_of(qi + 1, tot)}</span>
                    <span>{pct}%</span>
                </div>
            </div>

            <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: "28px 30px", borderRadius: theme.radius }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: theme.primary2, textTransform: "uppercase", marginBottom: 8, fontStyle: "italic" }}>{q.src}</div>
                <h2 style={{ fontFamily: theme.fontHeading, fontSize: "clamp(16px,2.5vw,21px)", fontWeight: 700, lineHeight: 1.55, color: theme.text, marginBottom: 22 }}>
                    {lang === "id" ? q.i : q.e}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {(q.opts || []).map((o, i) => {
                        const sel = answers[qi] === i;
                        return (
                            <button
                                key={i}
                                onClick={() => pick(i)}
                                data-testid={`stockdna-opt-${i}`}
                                style={{
                                    background: sel ? `${theme.primary}1a` : theme.panel2,
                                    border: `1px solid ${sel ? theme.primary : theme.border}`,
                                    color: sel ? theme.primary : theme.text,
                                    fontFamily: theme.fontBody, fontSize: 13, padding: "13px 16px",
                                    cursor: "pointer", textAlign: "left", borderRadius: theme.radius,
                                    display: "flex", alignItems: "flex-start", gap: 11, lineHeight: 1.5,
                                    transition: "all .15s",
                                }}
                            >
                                <span style={{ fontFamily: theme.fontHeading, fontWeight: 800, fontSize: 11, color: theme.primary, minWidth: 16, marginTop: 1 }}>{labels[i]}</span>
                                <span>{lang === "id" ? o.i : o.e}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                <button
                    onClick={prev}
                    disabled={qi === 0}
                    data-testid="stockdna-back-btn"
                    style={{
                        background: "none", border: `1px solid ${theme.border}`, color: theme.muted,
                        fontFamily: theme.fontBody, fontSize: 11, padding: "9px 18px", cursor: qi === 0 ? "default" : "pointer",
                        borderRadius: theme.radius, visibility: qi === 0 ? "hidden" : "visible",
                    }}
                >← {T.back}</button>
                <button
                    onClick={next}
                    disabled={!ready}
                    data-testid="stockdna-next-btn"
                    style={{
                        fontFamily: theme.fontHeading, fontSize: 12, fontWeight: 800, letterSpacing: 1,
                        padding: "11px 28px", background: theme.primary, color: theme.primaryFg, border: "none",
                        cursor: ready ? "pointer" : "not-allowed",
                        clipPath: theme.angled ? "polygon(7px 0%,100% 0%,calc(100% - 7px) 100%,0% 100%)" : "none",
                        borderRadius: theme.angled ? 0 : theme.radius,
                        opacity: ready ? 1 : 0.3,
                        transition: "opacity .2s",
                    }}
                >{isLast ? T.see_result : T.next}</button>
            </div>
        </div>
    );
}

/* ---------- Loading ---------- */
function LoadingScreen({ theme, T, msgIdx }) {
    return (
        <div data-testid="stockdna-loading" style={{ maxWidth: 500, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
            <div style={{
                width: 88, height: 101, margin: "0 auto 22px", background: `linear-gradient(135deg,${theme.primary},${theme.primary2})`,
                clipPath: "polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38,
                animation: "hr2 1.4s ease-in-out infinite alternate",
            }}>🧬</div>
            <h2 style={{ fontFamily: theme.fontHeading, fontSize: 18, fontWeight: 800, color: theme.primary, marginBottom: 7 }}>{T.loading_title}</h2>
            <p style={{ fontSize: 10, color: theme.muted, letterSpacing: 3 }}>{T.loading_msgs[msgIdx]}</p>
            <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 18 }}>
                {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 8, height: 8, background: theme.primary, borderRadius: "50%", animation: `db 1.2s ease-in-out infinite ${i * 0.2}s` }} />
                ))}
            </div>
            <style>{`
                @keyframes hr2{0%{transform:rotate(-12deg) scale(.95)}100%{transform:rotate(12deg) scale(1.05)}}
                @keyframes db{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.6);opacity:1}}
            `}</style>
        </div>
    );
}

/* ---------- Result ---------- */
function ResultScreen({ theme, T, lang, market, result, comment, setComment, savedOK, onSave, onShare, onCopy, onRetake }) {
    const isE = lang === "en";
    const stocks = market === "IDX" ? result.sx : market === "INTL" ? result.si : result.sx.slice(0, 3).concat(result.si.slice(0, 3));
    const insights = isE ? result.ie : result.ii;
    const [riskWidth, setRiskWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setRiskWidth(result.risk), 300);
        return () => clearTimeout(t);
    }, [result.risk]);

    return (
        <div data-testid="stockdna-result" style={{ maxWidth: 740, margin: "0 auto", padding: "10px 16px 80px" }}>
            {/* Header */}
            <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 30, marginBottom: 14, borderRadius: theme.radius, position: "relative", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.primary, animation: "pulse 1.5s ease infinite" }} />
                    <span style={{ fontSize: 9, letterSpacing: 3, color: theme.primary, textTransform: "uppercase" }}>{T.result_eyebrow}</span>
                    <span style={{ fontSize: 8, padding: "3px 9px", borderRadius: 2, background: `${theme.primary}1a`, color: theme.primary, letterSpacing: 1, textTransform: "uppercase", border: `1px solid ${theme.primary}33` }}>
                        {market === "IDX" ? "🇮🇩 IDX" : market === "INTL" ? "🌐 GLOBAL" : "🌐+🇮🇩 BOTH"}
                    </span>
                </div>
                <h2 data-testid="stockdna-result-type" style={{ fontFamily: theme.fontHeading, fontSize: "clamp(28px,6vw,52px)", fontWeight: 800, letterSpacing: -1.5, lineHeight: 1, marginBottom: 9, color: result.color }}>
                    {result.em} {isE ? result.ne : result.ni}
                </h2>
                <p style={{ fontSize: 13, color: theme.text, lineHeight: 1.8, opacity: 0.85, maxWidth: 620, marginBottom: 22 }}>{isE ? result.de : result.di}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 9 }}>
                    {result.tr.map((tr, i) => (
                        <div key={i} style={{ background: theme.panel2, border: `1px solid ${theme.border}`, padding: "11px 13px", borderRadius: 2, textAlign: "center" }}>
                            <div style={{ fontSize: 20, marginBottom: 4 }}>{tr.i}</div>
                            <div style={{ fontSize: 8, color: theme.muted, letterSpacing: 1, textTransform: "uppercase" }}>{isE ? tr.le : tr.li}</div>
                            <div style={{ fontFamily: theme.fontHeading, fontSize: 11, fontWeight: 700, color: theme.text, marginTop: 2 }}>{isE ? tr.ve : tr.vi}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Risk meter */}
            <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 18, borderRadius: theme.radius, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: theme.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                    <span>{T.risk_tolerance}</span>
                    <span style={{ fontFamily: theme.fontHeading, fontWeight: 700, color: theme.primary }}>{isE ? result.re : result.ri}</span>
                </div>
                <div style={{ height: 8, background: theme.panel2, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${riskWidth}%`, background: `linear-gradient(90deg,${theme.primary},${theme.primary2},#ef4444)`, transition: "width 1.8s cubic-bezier(.4,0,.2,1)" }} />
                </div>
            </div>

            <SectionHeader theme={theme}>{T.section_stocks}</SectionHeader>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 9 }} data-testid="stockdna-stocks">
                {stocks.map((s, i) => (
                    <div key={s.t + i} style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 14, borderRadius: 2 }}>
                        <div style={{ fontFamily: theme.fontHeading, fontSize: 18, fontWeight: 800, color: result.color }}>{s.t}</div>
                        <div style={{ fontSize: 9, color: theme.muted, marginTop: 2 }}>{s.n}</div>
                        <div style={{ fontSize: 11, color: theme.text, marginTop: 9, lineHeight: 1.5 }}>{isE ? s.e : s.i}</div>
                    </div>
                ))}
            </div>

            <SectionHeader theme={theme}>{T.section_insights}</SectionHeader>
            <div data-testid="stockdna-insights">
                {insights.map((x, i) => (
                    <div key={i} style={{ background: theme.panel, borderLeft: `3px solid ${theme.primary2}`, padding: "14px 18px", marginBottom: 9, fontSize: 12, lineHeight: 1.65, borderRadius: `0 ${theme.radius}px ${theme.radius}px 0` }}>
                        <strong style={{ color: theme.text, fontFamily: theme.fontHeading }}>{x.s}</strong> <span style={{ color: theme.text, opacity: 0.75 }}>{x.t}</span>
                    </div>
                ))}
            </div>

            <SectionHeader theme={theme}>{T.section_research}</SectionHeader>
            <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 22, borderRadius: theme.radius }}>
                <div style={{ fontFamily: theme.fontHeading, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: theme.primary2, marginBottom: 12 }}>📚 {T.refs_title}</div>
                {REFERENCES.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 11, padding: "9px 0", borderBottom: i < REFERENCES.length - 1 ? `1px solid ${theme.border}` : "none" }}>
                        <span style={{ fontFamily: theme.fontHeading, fontWeight: 800, fontSize: 9, color: theme.primary, minWidth: 20, marginTop: 1 }}>[{i + 1}]</span>
                        <span style={{ fontSize: 10, color: theme.muted, lineHeight: 1.6 }}>
                            <span dangerouslySetInnerHTML={{ __html: (isE ? r.e : r.i).replace(/<em>/g, `<em style="color:${theme.text};font-style:italic;font-weight:500">`) }} />
                            {" "}<a href={r.u} target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, textDecoration: "none", fontSize: 9 }}>→ DOI</a>
                        </span>
                    </div>
                ))}
            </div>

            {/* Thoughts box */}
            <SectionHeader theme={theme}>{T.section_thoughts}</SectionHeader>
            <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 26, borderRadius: theme.radius }}>
                <p style={{ fontSize: 12, color: theme.muted, marginBottom: 13, lineHeight: 1.7 }}>{T.comment_prompt}</p>
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value.slice(0, 500))}
                    placeholder={T.comment_ph}
                    data-testid="stockdna-comment-input"
                    style={{
                        width: "100%", background: theme.panel2, border: `1px solid ${theme.border}`,
                        color: theme.text, fontFamily: theme.fontBody, fontSize: 12, padding: "13px 15px",
                        resize: "vertical", minHeight: 90, borderRadius: theme.radius, outline: "none", lineHeight: 1.6,
                    }}
                />
                <div style={{ fontSize: 9, color: theme.muted, textAlign: "right", marginTop: 3 }}>{comment.length}/500</div>
                <button
                    onClick={onSave}
                    data-testid="stockdna-save-btn"
                    style={{
                        fontFamily: theme.fontHeading, fontSize: 11, fontWeight: 800, letterSpacing: 1,
                        padding: "11px 26px", background: theme.primary2, color: "#fff", border: "none",
                        cursor: "pointer", marginTop: 11, textTransform: "uppercase", borderRadius: 2,
                    }}
                >{T.save_thoughts}</button>
                {savedOK && (
                    <div data-testid="stockdna-saved-ok" style={{ background: `${theme.primary}14`, border: `1px solid ${theme.primary}33`, padding: "13px 16px", borderRadius: 2, fontSize: 12, color: theme.primary, marginTop: 11 }}>
                        ✓ {T.saved_ok}
                    </div>
                )}
            </div>

            {/* Cross-promo cards */}
            <SectionHeader theme={theme}>{T.section_deeper}</SectionHeader>
            <div style={{ background: `linear-gradient(135deg,${theme.primary}0a,${theme.primary2}10)`, border: `1px solid ${theme.primary}26`, padding: 28, borderRadius: theme.radius }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: `${theme.accent}1a`, border: `1px solid ${theme.accent}40`, color: theme.accent, fontSize: 9, letterSpacing: 2, textTransform: "uppercase", padding: "5px 12px", borderRadius: 2, marginBottom: 13 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: theme.accent, animation: "pulse 1s ease infinite" }} />
                    {T.urgency}
                </div>
                <h3 style={{ fontFamily: theme.fontHeading, fontSize: "clamp(18px,3vw,26px)", fontWeight: 800, color: theme.text, marginBottom: 8, lineHeight: 1.2 }}>{T.cta_headline}</h3>
                <p style={{ fontSize: 12, color: theme.muted, lineHeight: 1.75, marginBottom: 20, maxWidth: 540 }} dangerouslySetInnerHTML={{ __html: T.cta_sub.replace(/<strong>/g, `<strong style="color:${theme.text}">`) }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <a href="https://neulab.xyz" target="_blank" rel="noopener noreferrer" data-testid="stockdna-cta-adult" style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 18, borderRadius: theme.radius, textDecoration: "none", display: "block", color: theme.text }}>
                        <div style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: theme.muted, marginBottom: 7 }}>{T.for_adults}</div>
                        <div style={{ fontSize: 26, marginBottom: 7 }}>📊</div>
                        <div style={{ fontFamily: theme.fontHeading, fontSize: 14, fontWeight: 800, color: theme.text, marginBottom: 3 }}>NeuLab Stock Analyser</div>
                        <div style={{ fontSize: 10, color: theme.primary, marginBottom: 7 }}>neulab.xyz</div>
                        <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.6 }}>{T.adult_desc}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 12, fontFamily: theme.fontHeading, fontSize: 10, fontWeight: 700, color: theme.primary, letterSpacing: 1, textTransform: "uppercase" }}>
                            {T.analyse_now} <ArrowRight size={11} />
                        </div>
                    </a>
                    <a href="https://kidstocks.net" target="_blank" rel="noopener noreferrer" data-testid="stockdna-cta-kids" style={{ background: theme.panel, border: `1px solid ${theme.border}`, padding: 18, borderRadius: theme.radius, textDecoration: "none", display: "block", color: theme.text }}>
                        <div style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", color: theme.muted, marginBottom: 7 }}>{T.for_kids}</div>
                        <div style={{ fontSize: 26, marginBottom: 7 }}>🌱</div>
                        <div style={{ fontFamily: theme.fontHeading, fontSize: 14, fontWeight: 800, color: theme.accent, marginBottom: 3 }}>KidStocks</div>
                        <div style={{ fontSize: 10, color: theme.accent, marginBottom: 7 }}>kidstocks.net</div>
                        <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.6 }}>{T.kids_desc}</div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 12, fontFamily: theme.fontHeading, fontSize: 10, fontWeight: 700, color: theme.accent, letterSpacing: 1, textTransform: "uppercase" }}>
                            {T.start_learning} <ArrowRight size={11} />
                        </div>
                    </a>
                </div>
                <p style={{ fontSize: 10, color: theme.muted, textAlign: "center", borderTop: `1px solid ${theme.border}`, paddingTop: 14 }} dangerouslySetInnerHTML={{ __html: T.proof.replace(/<span>/g, `<span style="color:${theme.primary}">`) }} />
            </div>

            {/* Share buttons */}
            <SectionHeader theme={theme}>{T.section_share}</SectionHeader>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                <button onClick={onShare} data-testid="stockdna-share-btn" style={shareBtn(theme)}><Share2 size={12} style={{ display: "inline", marginRight: 4 }} /> {T.share}</button>
                <button onClick={onCopy} data-testid="stockdna-copy-btn" style={shareBtn(theme)}><Copy size={12} style={{ display: "inline", marginRight: 4 }} /> {T.copy_result}</button>
                <button onClick={onRetake} data-testid="stockdna-retake-btn" style={{ ...shareBtn(theme), color: theme.primary2, border: `1px solid ${theme.primary2}` }}>
                    <RotateCcw size={12} style={{ display: "inline", marginRight: 4 }} /> {T.retake}
                </button>
            </div>

            <p style={{ fontSize: 9, color: theme.muted, textAlign: "center", marginTop: 44, paddingTop: 18, borderTop: `1px solid ${theme.border}`, letterSpacing: 1, lineHeight: 2.2 }}>
                <strong style={{ color: theme.primary, fontFamily: theme.fontHeading }}>StockDNA™</strong> — {T.powered_by} <a href="https://neulab.xyz" target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, textDecoration: "none" }}>NeuLab Inc.</a><br />
                <a href="https://neulab.xyz" target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, textDecoration: "none" }}>neulab.xyz</a> · <a href="https://kidstocks.net" target="_blank" rel="noopener noreferrer" style={{ color: theme.primary, textDecoration: "none" }}>kidstocks.net</a><br />
                <span>{T.disclaimer}</span>
            </p>

            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}`}</style>
        </div>
    );
}

function SectionHeader({ theme, children }) {
    return (
        <div style={{ fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: theme.primary, margin: "24px 0 12px", display: "flex", alignItems: "center", gap: 9 }}>
            {children}
            <span style={{ flex: 1, height: 1, background: theme.border }} />
        </div>
    );
}

function shareBtn(theme) {
    return {
        fontFamily: theme.fontHeading, fontSize: 10, fontWeight: 700, letterSpacing: 1,
        padding: "10px 20px", border: `1px solid ${theme.border}`, background: theme.panel2, color: theme.text,
        cursor: "pointer", textTransform: "uppercase", borderRadius: 2,
    };
}
