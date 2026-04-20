/** Safely stringify an error message that may be either a string or an object. */
export function errMessage(detail, fallback = "Something went wrong") {
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") {
        return detail.message || detail.detail || detail.msg || JSON.stringify(detail);
    }
    return String(detail);
}
