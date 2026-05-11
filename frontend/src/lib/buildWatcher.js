/**
 * Lightweight build-version watcher.
 *
 * Why: even with `Cache-Control: no-cache` on index.html, users with a tab
 * left open overnight won't pick up new code until they reload. We watch
 * the bundle hash by polling `/asset-manifest.json` (CRA emits this for
 * free, and it updates on every redeploy because the hashes change).
 *
 * UX: silent until a new version is detected. Then a small bottom-centre
 * pill appears: "New version available · Refresh". Tapping reloads the
 * page. Dismissable. Re-checks happen ONLY on tab refocus + every 10 min
 * — zero impact on backend bandwidth.
 *
 * Returns a cleanup function. Wire it in once near the app root.
 */

const MANIFEST_URL = "/asset-manifest.json";
const CHECK_INTERVAL_MS = 10 * 60 * 1000;  // 10 minutes
const STORAGE_KEY = "sai_build_dismissed_hash";

let initialHash = null;
let pillEl = null;

async function _fetchCurrentHash() {
    try {
        const r = await fetch(MANIFEST_URL, { cache: "no-store" });
        if (!r.ok) return null;
        const m = await r.json();
        // Use the entrypoint hash if present, otherwise the main.js path
        const entry = m.entrypoints?.find((e) => /main\..*\.js/.test(e)) || m.files?.["main.js"];
        return entry || null;
    } catch {
        return null;
    }
}

function _renderUpdatePill(onClick) {
    if (pillEl) return;
    pillEl = document.createElement("div");
    pillEl.setAttribute("data-testid", "build-update-pill");
    pillEl.style.cssText = `
        position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
        z-index: 99999; display: flex; align-items: center; gap: 12px;
        padding: 10px 16px; border-radius: 999px;
        background: rgba(20,20,30,0.92); color: #fafafa;
        border: 1px solid rgba(197,164,94,0.55);
        font-family: 'IBM Plex Mono', ui-monospace, monospace;
        font-size: 12px; letter-spacing: 0.6px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45);
        backdrop-filter: blur(8px);
        cursor: pointer; user-select: none;
        animation: sai-pill-in .35s ease-out;
    `;
    const style = document.createElement("style");
    style.textContent = `@keyframes sai-pill-in {
        from { opacity: 0; transform: translate(-50%, 14px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
    }`;
    document.head.appendChild(style);

    const label = document.createElement("span");
    label.textContent = "New version available";
    label.style.opacity = "0.9";
    const refresh = document.createElement("button");
    refresh.textContent = "REFRESH";
    refresh.style.cssText = `
        background: #c5a45e; color: #14141e; border: none;
        padding: 4px 11px; border-radius: 999px; font-weight: 700;
        font-family: inherit; font-size: 11px; letter-spacing: 1px;
        cursor: pointer;
    `;
    refresh.onclick = (e) => { e.stopPropagation(); onClick(); };
    const dismiss = document.createElement("button");
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss update");
    dismiss.style.cssText = `
        background: transparent; border: none; color: #888;
        font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px;
    `;
    dismiss.onclick = (e) => {
        e.stopPropagation();
        try { localStorage.setItem(STORAGE_KEY, initialHash || "x"); } catch {}
        pillEl?.remove();
        pillEl = null;
    };
    pillEl.append(label, refresh, dismiss);
    pillEl.onclick = onClick;
    document.body.appendChild(pillEl);
}

async function _check() {
    if (pillEl) return;  // pill already up
    const current = await _fetchCurrentHash();
    if (!current) return;
    if (!initialHash) {
        initialHash = current;
        return;
    }
    if (current === initialHash) return;
    let dismissedFor = null;
    try { dismissedFor = localStorage.getItem(STORAGE_KEY); } catch {}
    if (dismissedFor && dismissedFor === current) return;
    _renderUpdatePill(() => window.location.reload());
}

export function startBuildWatcher() {
    if (typeof window === "undefined") return () => {};
    // Initial snapshot — don't show anything on first load
    _check();
    const interval = setInterval(_check, CHECK_INTERVAL_MS);
    const onVis = () => { if (!document.hidden) _check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVis);
    };
}
