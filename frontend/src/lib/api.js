import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("sai_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // Attribute tagline A/B conversions — if the visitor was pinned to a
    // variant on /login or /signup, forward it so the backend can credit
    // that variant when they register.
    const tv = localStorage.getItem("sai_tagline_variant");
    if (tv) config.headers["X-Tagline-Variant"] = tv;
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
