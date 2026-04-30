/**
 * Lightweight client-side telemetry — fire-and-forget beacons to the
 * in-house `/api/telemetry/event` endpoint. NEVER blocks the user.
 *
 * Usage:
 *   import { track, getOrCreateSessionId } from "@/lib/telemetry";
 *
 *   useEffect(() => { track("wizard_opened"); }, []);
 *   track("wizard_step2_complete", { ticker: "AAPL" });
 *
 * Anonymous ID is a stable per-browser UUID stored in localStorage so
 * we can group a single user's events across sessions. The session_id
 * is per-component-mount and lives in component state — pass it via
 * the second arg of `track()` if you need cross-event grouping (e.g.
 * the wizard's funnel).
 *
 * If the user is signed in, the backend extracts user_id from the
 * Bearer JWT we attach via `getAuthHeader()` — no need to send it from
 * the client.
 *
 * Why navigator.sendBeacon when available: survives page-unload (so the
 * "wizard_dismissed_early" event fires even if the user closes the tab
 * mid-modal). Falls back to `fetch` with `keepalive: true` for routes
 * that need a JSON Authorization header (sendBeacon doesn't support
 * custom headers).
 */

const ANON_ID_KEY = "sai_anon_id_v1";
const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

function _uuidShort() {
    // Cryptographically-strong-ish per-browser UUID. Falls back to
    // Math.random for older Safari before crypto.randomUUID landed.
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    }
    return (
        Math.random().toString(36).slice(2, 14) +
        Math.random().toString(36).slice(2, 14)
    );
}

export function getOrCreateAnonymousId() {
    if (typeof window === "undefined") return null;
    try {
        let id = localStorage.getItem(ANON_ID_KEY);
        if (!id) {
            id = _uuidShort();
            localStorage.setItem(ANON_ID_KEY, id);
        }
        return id;
    } catch {
        // Private mode / disabled storage — return a per-call ephemeral
        // id so events still group within a single page load.
        return _uuidShort();
    }
}

/**
 * Generate a fresh session_id for a single funnel grouping (e.g. one
 * wizard mount). Caller stores it in component state.
 */
export function newSessionId() {
    return _uuidShort();
}

function _getAuthHeader() {
    try {
        const t = localStorage.getItem("sai_token");
        return t ? { Authorization: `Bearer ${t}` } : {};
    } catch {
        return {};
    }
}

/**
 * Fire-and-forget telemetry beacon.
 *
 * @param {string} event       Canonical event name (must match the backend's _ALLOWED_EVENTS)
 * @param {object} [props]     Flat key→primitive bag of context (capped server-side)
 * @param {string} [sessionId] Optional per-funnel session id; if omitted, only anonymous_id groups events
 */
export function track(event, props = null, sessionId = null) {
    if (!event || !API_BASE) return;
    const body = JSON.stringify({
        event,
        session_id: sessionId,
        anonymous_id: getOrCreateAnonymousId(),
        props: props || {},
    });
    const url = `${API_BASE}/api/telemetry/event`;
    try {
        // Prefer fetch with keepalive — supports our Bearer token header.
        // Beacons MUST never await: hand to the network and return immediately.
        const promise = fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", ..._getAuthHeader() },
            body,
            keepalive: true,
        });
        // Swallow any errors — telemetry must never break a user flow.
        if (promise && typeof promise.catch === "function") {
            promise.catch(() => {});
        }
    } catch {
        // Final fallback: try sendBeacon (no auth header support, but
        // still groups by anonymous_id which is fine for funnels).
        try {
            if (typeof navigator !== "undefined" && navigator.sendBeacon) {
                const blob = new Blob([body], { type: "application/json" });
                navigator.sendBeacon(url, blob);
            }
        } catch {
            /* drop on the floor — see docstring */
        }
    }
}
