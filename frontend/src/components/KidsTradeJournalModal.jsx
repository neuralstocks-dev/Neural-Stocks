/**
 * KidsTradeJournalModal — post-trade reflection prompt.
 *
 * After a successful BUY/SELL we surface this modal so the kid can
 * write down WHY they made the trade, WHICH signal convinced them,
 * and WHAT their exit plan is. Submitting awards a small StockCoin
 * bonus (capped daily server-side; we just display whatever the
 * server returns).
 *
 * Three age-appropriate prompts that vary by side. The modal can be
 * skipped — no penalty — but the bonus is forfeited.
 */
import React, { useState } from "react";
import { Sparkles, Loader2, X, MessageCircle } from "lucide-react";

const ACCENT = "#ff7676";
const NAVY = "#1a1a2e";
const SAND = "#fff8f0";
const SAND_BORDER = "#e5d5b8";
const GREEN = "#76b876";
const GOLD = "#ffb570";

const PROMPTS = {
    BUY: {
        why: "Why do you think this stock will do well?",
        signal: "Which signal from the analysis convinced you most?",
        exit_plan: "When would you sell? (e.g. price drops 15%, news changes…)",
    },
    SELL: {
        why: "Why are you selling now?",
        signal: "What changed your mind since you bought it?",
        exit_plan: "Would you buy this stock again later? Why?",
    },
};

export function KidsTradeJournalModal({ trade, kidsApi, onClose, onBonusEarned }) {
    const [why, setWhy] = useState("");
    const [signal, setSignal] = useState("");
    const [exitPlan, setExitPlan] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [result, setResult] = useState(null);

    if (!trade) return null;
    const prompts = PROMPTS[trade.side] || PROMPTS.BUY;
    const isComplete = why.trim() && signal.trim() && exitPlan.trim();

    const submit = async () => {
        setBusy(true); setErr("");
        try {
            const r = await kidsApi.post(`/kids/trades/${trade.trade_id}/journal`, {
                why: why.trim(),
                signal: signal.trim(),
                exit_plan: exitPlan.trim(),
            });
            setResult(r.data);
            if (r.data?.bonus_awarded_sc > 0 && onBonusEarned) {
                onBonusEarned(r.data.bonus_awarded_sc, r.data.new_balance);
            }
        } catch (e) {
            setErr(e?.response?.data?.detail || "Couldn't save your reflection — try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            data-testid="kids-journal-modal"
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(26,26,46,0.55)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                zIndex: 9999,
                padding: 0,
            }}
            onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
        >
            <div
                style={{
                    background: "#fff",
                    borderRadius: "20px 20px 0 0",
                    padding: "22px 22px calc(72px + env(safe-area-inset-bottom)) 22px",
                    width: "100%",
                    maxWidth: 540,
                    maxHeight: "92vh",
                    overflowY: "auto",
                    boxShadow: "0 -8px 24px rgba(0,0,0,0.18)",
                }}
            >
                {result ? (
                    <ResultPane result={result} side={trade.side} qty={trade.qty} ticker={trade.ticker} onClose={onClose} />
                ) : (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: ACCENT, fontWeight: 700, margin: 0 }}>
                                Trade Journal
                            </p>
                            <button onClick={onClose} aria-label="Close" data-testid="kids-journal-skip" style={{ background: "transparent", border: "none", padding: 4, cursor: "pointer" }}>
                                <X size={18} color={NAVY} opacity={0.6} />
                            </button>
                        </div>
                        <h3 style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.35, marginTop: 4 }}>
                            {trade.side === "BUY" ? "Nice buy!" : "Nice sell!"} Tell future-you why.
                        </h3>
                        <div style={{ background: SAND, border: `1px solid ${SAND_BORDER}`, borderRadius: 12, padding: "10px 14px", marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                            <Sparkles size={16} color={GOLD} />
                            <p style={{ margin: 0, fontSize: 13, color: "#7a5a00" }}>
                                Answer all 3 to earn <strong>+50 StockCoins</strong> and a stronger investing brain.
                            </p>
                        </div>

                        <PromptInput label={prompts.why} value={why} onChange={setWhy} testId="journal-why" />
                        <PromptInput label={prompts.signal} value={signal} onChange={setSignal} testId="journal-signal" />
                        <PromptInput label={prompts.exit_plan} value={exitPlan} onChange={setExitPlan} testId="journal-exit-plan" />

                        {err && <p style={{ color: ACCENT, fontSize: 12, marginTop: 8 }}>{err}</p>}

                        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                            <button
                                onClick={onClose}
                                disabled={busy}
                                data-testid="kids-journal-skip-button"
                                style={{ padding: "12px 16px", background: "transparent", border: `1.5px solid ${SAND_BORDER}`, borderRadius: 12, fontSize: 13, fontWeight: 600, color: NAVY, cursor: "pointer" }}
                            >
                                Skip for now
                            </button>
                            <button
                                onClick={submit}
                                disabled={busy || !isComplete}
                                data-testid="kids-journal-submit"
                                style={{
                                    flex: 1,
                                    padding: 12,
                                    background: isComplete ? ACCENT : "#ccc",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: 12,
                                    fontSize: 14,
                                    fontWeight: 700,
                                    cursor: busy || !isComplete ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8,
                                }}
                            >
                                {busy ? <Loader2 size={14} className="animate-spin" /> : <><MessageCircle size={14} /> Save reflection</>}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function PromptInput({ label, value, onChange, testId }) {
    return (
        <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: NAVY, display: "block", marginBottom: 6 }}>{label}</label>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={2}
                maxLength={500}
                data-testid={testId}
                style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: `1.5px solid ${SAND_BORDER}`,
                    borderRadius: 12,
                    fontSize: 14,
                    fontFamily: "inherit",
                    background: SAND,
                    boxSizing: "border-box",
                    color: NAVY,
                    resize: "vertical",
                }}
            />
        </div>
    );
}

function ResultPane({ result, side, qty, ticker, onClose }) {
    const earnedBonus = result.bonus_awarded_sc > 0;
    const capHit = result.daily_cap_hit;
    return (
        <div data-testid="kids-journal-result" style={{ textAlign: "center", padding: "8px 4px" }}>
            <div style={{ fontSize: 56, marginBottom: 6 }}>
                {earnedBonus ? "🎉" : capHit ? "💡" : "✓"}
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                {earnedBonus ? `+${result.bonus_awarded_sc} StockCoins!` : "Reflection saved"}
            </h3>
            <p style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.55 }}>
                {earnedBonus ? (
                    <>Your {side === "BUY" ? "buy" : "sell"} of {qty} {ticker} is locked in your journal. New balance: <strong style={{ color: GREEN }}>{(result.new_balance || 0).toLocaleString(undefined,{maximumFractionDigits:2})} SC</strong></>
                ) : capHit ? (
                    <>You've already earned today's max bonus — but every reflection still makes you a sharper investor. Come back tomorrow for more!</>
                ) : (
                    <>Saved.</>
                )}
            </p>
            <button
                onClick={onClose}
                data-testid="kids-journal-result-close"
                style={{
                    marginTop: 18,
                    padding: "12px 28px",
                    background: ACCENT,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                }}
            >
                Got it
            </button>
        </div>
    );
}
