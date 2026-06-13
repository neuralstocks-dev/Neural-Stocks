import axios from "axios";

// Resolve the API base URL with same-origin auto-detection.
//
// In Emergent's deployment, /api/* on the user's current domain is always
// proxied to the backend pod for that deployment. So when the frontend bundle
// is served from a domain that ALSO owns /api routes (i.e., production custom
// domains like https://neulab.xyz, or the *.preview.emergentagent.com URL),
// using same-origin avoids a class of cross-deployment bugs where:
//   - the JWT issued by deployment A is sent to deployment B that signs with
//     a different JWT_SECRET → silent 401s that show as infinite spinners,
//   - cookies / CORS / 3rd-party-cookie blocking break auth flows,
//   - a stale REACT_APP_BACKEND_URL baked into an old bundle points to a
//     long-dead preview URL.
//
// The .env REACT_APP_BACKEND_URL stays as the canonical source for local /
// non-browser environments (SSR, tests). At runtime in the browser we prefer
// same-origin so each deployment talks to its own backend.
function resolveBackendBase() {
    const envUrl = process.env.REACT_APP_BACKEND_URL;
    if (envUrl) return envUrl;
    if (typeof window === "undefined") return "";
    return window.location.origin;
}

const BACKEND_URL = resolveBackendBase();
export { BACKEND_URL };
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("sai_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // Forward every pinned A/B variant so the backend can attribute
    // signup-type conversions. Header format: X-Exp-{experiment_key}: {variant_key}.
    if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i);
            if (!storageKey || !storageKey.startsWith("sai_exp_")) continue;
            const expKey = storageKey.slice("sai_exp_".length);
            const variantKey = localStorage.getItem(storageKey);
            if (variantKey) {
                config.headers[`X-Exp-${expKey.replace(/_/g, "-")}`] = variantKey;
            }
        }
    }
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
        // Normalize FastAPI dict-details (e.g., 428 disclaimer_required) into a string
        // so consumers can always setState with a safe string to render.
        const d = err?.response?.data?.detail;
        if (d && typeof d === "object") {
            err.response.data._detail_object = d; // keep original for programmatic checks
            err.response.data.detail = d.message || d.msg || d.detail || JSON.stringify(d);
        }
        if (err?.response?.status === 401) {
            // Force relogin only if a token was present (i.e., session expired)
            // Don't redirect if we're on the dashboard (new user onboarding) —
            // let the component handle the error gracefully.
            if (localStorage.getItem("sai_token")) {
                localStorage.removeItem("sai_token");
                localStorage.removeItem("sai_user");
                const path = window.location.pathname;
                if (path !== "/login" && path !== "/dashboard") {
                    window.location.assign("/login");
                }
            }
        }
        return Promise.reject(err);
    }
);

export default api;
