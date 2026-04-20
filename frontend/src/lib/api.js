import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("sai_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (r) => r,
    (err) => {
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
