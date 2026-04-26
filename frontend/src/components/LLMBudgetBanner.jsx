/**
 * LLMBudgetBanner
 *
 * Friendly replacement for the generic red "AI analysis temporarily
 * unavailable" error string. Surfaces:
 *   1. A clear plain-English explanation of what happened
 *   2. A primary "Top up Universal Key" button (opens Emergent profile
 *      in a new tab) so the fix is one click away
 *   3. A "What does this mean?" toggle that expands to explain cost
 *      economics — only LLM verdict generation is gated; everything
 *      else still works
 *
 * Detection: pass it the error message/detail; it self-decides whether
 * to render or stay invisible. The parent page just always mounts it.
 */
import { useState } from "react";
import { ExternalLink, AlertTriangle, Wallet } from "lucide-react";

// Best-known landing for the Emergent platform profile. The user can
// navigate from there to Universal Key → Add Balance in 2 clicks.
const EMERGENT_PROFILE_URL = "https://app.emergent.sh/";

function _looksLikeBudgetError(payload) {
    if (!payload) return false;
    if (typeof payload === "string") {
        const s = payload.toLowerCase();
        return s.includes("budget exceeded") || s.includes("budget has been exceeded") || s.includes("universal key");
    }
    if (typeof payload === "object") {
        if (payload.error_code === "llm_budget_exceeded") return true;
        return _looksLikeBudgetError(payload.message);
    }
    return false;
}

/**
 * @param {{ error: string | object | null | undefined }} props
 *   error: the value coming from `setError(...)`. Can be a plain string,
 *          a structured `{error_code, message}` payload, or null/empty.
 */
export default function LLMBudgetBanner({ error }) {
    const [expanded, setExpanded] = useState(false);
    if (!_looksLikeBudgetError(error)) return null;

    return (
        <div
            className="my-6 module"
            style={{
                background: "hsla(38,70%,55%,0.05)",
                borderColor: "hsl(var(--hold))",
                borderLeft: "3px solid hsl(var(--hold))",
            }}
            data-testid="llm-budget-banner"
        >
            <div className="p-5 md:p-6">
                <div className="flex items-start gap-3">
                    <AlertTriangle
                        size={20}
                        strokeWidth={1.6}
                        style={{ color: "hsl(var(--hold))", marginTop: 2, flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                        <p
                            className="text-overline"
                            style={{ color: "hsl(var(--hold))", fontSize: "0.62rem" }}
                        >
                            AI verdict generation paused
                        </p>
                        <h3
                            className="font-serif mt-2"
                            style={{ fontSize: "1.4rem", lineHeight: 1.15, letterSpacing: "-0.005em" }}
                        >
                            Your Emergent Universal Key needs a top up.
                        </h3>
                        <p
                            className="mt-3 text-sm leading-relaxed"
                            style={{ color: "hsl(var(--text-secondary))" }}
                        >
                            Every AI verdict makes one Claude Sonnet 4.5 call (~$0.01) billed against
                            your Universal Key balance. The balance is empty — so new analyses are
                            paused until you add credit. <strong style={{ color: "hsl(var(--text-primary))" }}>
                            Existing verdicts, charts, watchlists, alerts, PDF exports, Random-Forest
                            scans, and Telegram pushes all keep working.</strong>
                        </p>
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            <a
                                href={EMERGENT_PROFILE_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-primary inline-flex items-center gap-2"
                                data-testid="llm-budget-topup-cta"
                                style={{ textDecoration: "none" }}
                            >
                                <Wallet size={14} strokeWidth={1.7} />
                                Top up Universal Key
                                <ExternalLink size={12} strokeWidth={1.7} style={{ opacity: 0.7 }} />
                            </a>
                            <button
                                type="button"
                                onClick={() => setExpanded((v) => !v)}
                                className="link-underline text-overline inline-flex items-center gap-1.5"
                                style={{ color: "hsl(var(--text-secondary))", fontSize: "0.6rem" }}
                                data-testid="llm-budget-explain-toggle"
                                aria-expanded={expanded}
                            >
                                What does this mean?
                                <span style={{ fontSize: "0.55rem", opacity: 0.7 }}>
                                    {expanded ? "▾" : "▸"}
                                </span>
                            </button>
                        </div>

                        {expanded && (
                            <div
                                className="mt-4 p-4"
                                style={{
                                    background: "hsl(var(--bg))",
                                    border: "1px solid hsl(var(--border-divider))",
                                    borderRadius: 2,
                                    animation: "fadeIn 220ms ease",
                                }}
                                data-testid="llm-budget-explain-body"
                            >
                                <p
                                    className="text-overline"
                                    style={{ color: "hsl(var(--text-secondary))", fontSize: "0.6rem" }}
                                >
                                    Cost economics in plain English
                                </p>
                                <ul
                                    className="mt-3 space-y-2.5 text-xs leading-relaxed"
                                    style={{ color: "hsl(var(--text-secondary))" }}
                                >
                                    <li className="flex gap-2">
                                        <span style={{ color: "hsl(var(--text-muted))" }}>·</span>
                                        <span>
                                            <strong style={{ color: "hsl(var(--text-primary))" }}>
                                                Hosting (~50 credits/month)
                                            </strong>
                                            : keeps the app, database, and background scanners alive.
                                            Already covered by your Emergent subscription.
                                        </span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: "hsl(var(--text-muted))" }}>·</span>
                                        <span>
                                            <strong style={{ color: "hsl(var(--text-primary))" }}>
                                                Universal Key (~$0.01 per verdict)
                                            </strong>
                                            : pays the LLM provider (Claude Sonnet 4.5) for each
                                            analysis. Billed separately and only used for new verdicts —
                                            re-loading existing ones is free.
                                        </span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: "hsl(var(--text-muted))" }}>·</span>
                                        <span>
                                            <strong style={{ color: "hsl(var(--text-primary))" }}>
                                                Recommended top-up
                                            </strong>
                                            : even a $5 add covers ~500 verdicts. Enable{" "}
                                            <em>Auto top-up</em> on the same page so this doesn't
                                            block you mid-flight again.
                                        </span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span style={{ color: "hsl(var(--text-muted))" }}>·</span>
                                        <span>
                                            <strong style={{ color: "hsl(var(--text-primary))" }}>
                                                What still works right now
                                            </strong>
                                            : every existing verdict (with V2 calibration breadcrumbs
                                            + RF probabilities), charts, watchlists, Bandarmology,
                                            backtests, scorecard, alerts, Telegram, PDF exports.
                                        </span>
                                    </li>
                                </ul>
                                <p
                                    className="mt-4 font-mono"
                                    style={{ color: "hsl(var(--text-muted))", fontSize: "0.62rem" }}
                                >
                                    Quick path: Profile → Universal Key → Add Balance →
                                    toggle Auto top-up.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
