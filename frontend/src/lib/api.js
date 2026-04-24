import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
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
            if (localStorage.getItem("sai_token")) {
                localStorage.removeItem("sai_token");
                localStorage.removeItem("sai_user");
                if (window.location.pathname !== "/login") {
                    window.location.assign("/login");
                }
            }
        }
        return Promise.reject(err);
    }
);

export default api;
