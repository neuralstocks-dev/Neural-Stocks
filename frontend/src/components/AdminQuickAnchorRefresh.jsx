import React, { useEffect, useState, useCallback } from "react";
import { Coins, Check, RefreshCcw } from "lucide-react";
import api from "@/lib/api";

/**
 * <AdminQuickAnchorRefresh />
 *
 * Inline one-tap "refresh Universal Key anchor" widget for the main
 * admin panel. The full /admin/cost page handles the projection chart,
 * email/Telegram reminder prefs, and historical anchor edits — but
 * 95% of the time you just want to type the new balance from
 * dashboard.emergent.sh and hit Enter. That used to be a multi-step
 * page navigation; now it's a 5-second inline form.
 *
 * Behaviour:
 *   1. Fetches the current anchor (`balance_anchor.credits_at_top_up`)
 *      and shows it as muted placeholder text — "Last set 93.46 · 2h ago".
 *      Lets the admin eyeball whether a refresh is even needed before
 *      typing.
 *   2. Single number input + "Set" button. Posts to
 *      `POST /admin/cost/balance-anchor` (the existing endpoint —
 *      identical contract to the /admin/cost form). Server stamps
 *      `top_up_at` to NOW.
 *   3. On success, flips to "✓ Anchored at {N}" for 3 seconds before
 *      reverting to the input — confirms the write landed without
 *      bouncing the admin to a new page.
 *   4. Inline error display if the post fails (validation /  permission /
 *      network) — never silently swallows.
 *
 * Out of scope (intentionally — would bloat the panel):
 *   - Anchor history (visible on /admin/cost)
 *   - Reminder email/Telegram pref toggles (visible on /admin/cost)
 *   - Projection chart (visible on /admin/cost)
 *   - Full anchor edit form with preview (visible on /admin/cost)
 */
export default function AdminQuickAnchorRefresh() {
    const [current, setCurrent] = useState(null);
    const [topUpAt, setTopUpAt] = useState(null);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const [justSavedAt, setJustSavedAt] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const r = await api.get("/admin/cost/summary?days=1");
            const a = r.data?.balance_anchor;
            if (a && a.credits_at_top_up != null) {
                setCurrent(a.credits_at_top_up);
                setTopUpAt(a.top_up_at);
            } else {
                setCurrent(null);
                setTopUpAt(null);
            }
        } catch {
            // Soft-fail — the inline widget is non-critical, the user
            // can always click through to the full /admin/cost page.
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const submit = async () => {
        const n = parseFloat(input);
        if (!Number.isFinite(n) || n < 0) {
            setErr("Enter a non-negative number");
            return;
        }
        setBusy(true);
        setErr("");
        try {
            await api.post("/admin/cost/balance-anchor", { credits_at_top_up: n });
            setJustSavedAt(n);
            setInput("");
            await refresh();
            // Auto-hide the success state after 3s so the input
            // re-appears for the next refresh without admin action.
            setTimeout(() => setJustSavedAt(null), 3000);
        } catch (ex) {
            setErr(ex?.response?.data?.detail || "Anchor save failed");
        } finally {
            setBusy(false);
        }
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submit();
        }
    };

    const ageLabel = (() => {
        if (!topUpAt) return null;
        try {
            const ms = Date.now() - new Date(topUpAt).getTime();
            const m = Math.floor(ms / 60000);
            if (m < 1) return "just now";
            if (m < 60) return `${m}m ago`;
            const h = Math.floor(m / 60);
            if (h < 24) return `${h}h ago`;
            const d = Math.floor(h / 24);
            return `${d}d ago`;
        } catch {
            return null;
        }
    })();

    return (
        <div
            className="module mt-6 p-5 md:p-6"
            style={{ borderColor: "hsl(var(--border-divider))" }}
            data-testid="admin-quick-anchor-refresh"
        >
            <div className="flex items-center gap-2 mb-3">
                <Coins size={13} strokeWidth={1.7} style={{ color: "hsl(var(--text-secondary))" }} />
                <p className="text-overline" style={{ fontSize: "10px", color: "hsl(var(--text-secondary))" }}>
                    Universal Key anchor · quick refresh
                </p>
            </div>
            <p className="text-xs" style={{ color: "hsl(var(--text-muted))", lineHeight: 1.5 }}>
                Drives the daily ops digest <code style={{ color: "hsl(var(--text-secondary))" }}>universal_key_balance</code> and the cost-projection chart.
                Pull the current balance from <a href="https://app.emergent.sh/profile" target="_blank" rel="noreferrer" style={{ color: "hsl(var(--gold))" }}>app.emergent.sh → Universal Key</a> and paste it below.
            </p>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
                {justSavedAt != null ? (
                    <p
                        className="font-mono text-sm inline-flex items-center gap-2"
                        style={{ color: "hsl(var(--buy))" }}
                        data-testid="admin-quick-anchor-saved"
                    >
                        <Check size={14} strokeWidth={2} /> Anchored at {justSavedAt.toFixed(2)} credits
                    </p>
                ) : (
                    <>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            placeholder={current != null ? `Last: ${current.toFixed(2)}` : "e.g. 93.46"}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={onKeyDown}
                            disabled={busy}
                            className="font-mono text-sm px-3 py-2"
                            style={{
                                background: "transparent",
                                border: "1px solid hsl(var(--border-divider))",
                                color: "hsl(var(--text-primary))",
                                width: "180px",
                            }}
                            data-testid="admin-quick-anchor-input"
                        />
                        <button
                            type="button"
                            onClick={submit}
                            disabled={busy || !input}
                            className="btn-ghost text-sm inline-flex items-center gap-1.5"
                            style={{
                                cursor: busy || !input ? "not-allowed" : "pointer",
                                opacity: busy || !input ? 0.6 : 1,
                                borderColor: "hsl(var(--gold))",
                            }}
                            data-testid="admin-quick-anchor-submit"
                        >
                            {busy ? (
                                <>
                                    <RefreshCcw size={11} strokeWidth={1.7} className="animate-spin" />
                                    Saving…
                                </>
                            ) : (
                                "Set anchor"
                            )}
                        </button>
                    </>
                )}
                {current != null && ageLabel && justSavedAt == null && (
                    <span
                        className="font-mono text-xs"
                        style={{ color: "hsl(var(--text-muted))" }}
                        data-testid="admin-quick-anchor-age"
                    >
                        Last set {current.toFixed(2)} · {ageLabel}
                    </span>
                )}
            </div>

            {err && (
                <p
                    className="mt-2 text-xs"
                    style={{ color: "hsl(var(--sell))" }}
                    data-testid="admin-quick-anchor-error"
                >
                    {err}
                </p>
            )}
        </div>
    );
}
