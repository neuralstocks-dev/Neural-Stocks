/**
 * useTaglineVariant — zero-cost A/B framework hook.
 *
 * On mount:
 *   1. Read `sai_tagline_variant` from localStorage (pinned to 1 variant
 *      per visitor for render consistency).
 *   2. If no pin: fetch the active variants registry, randomly pick one,
 *      pin it, and fire a one-time impression event to the backend.
 *   3. Return the picked variant object so the caller can render it.
 *
 * Attribution: `api.js` auto-forwards the pinned variant in a header on
 * every request, so the /auth/register and /auth/google endpoints credit
 * the variant when a signup happens. No cookies needed.
 */
import { useEffect, useState } from "react";
import axios from "axios";

const PIN_KEY = "sai_tagline_variant";
const API = process.env.REACT_APP_BACKEND_URL;

// Safe default used while the registry is loading, or when the network
// fails. Keeps the LoginPage hero readable even if experiments are down.
const FALLBACK = {
    key: "analyst_why",
    line1: "An analyst",
    line2: "who explains why.",
    color: "#F59E0B",
};

export function useTaglineVariant() {
    const [variant, setVariant] = useState(FALLBACK);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const pinned = typeof window !== "undefined" ? localStorage.getItem(PIN_KEY) : null;
            try {
                const res = await axios.get(`${API}/api/experiments/tagline/variants`);
                const variants = res?.data?.variants || [];
                if (!variants.length) return;

                // Return pinned if still valid in the active registry
                if (pinned) {
                    const pinnedVariant = variants.find((v) => v.key === pinned);
                    if (pinnedVariant) {
                        if (!cancelled) setVariant(pinnedVariant);
                        return;
                    }
                    // Stale pin (variant retired) — fall through to re-pick
                }

                // Random pick, pin, fire impression
                const pick = variants[Math.floor(Math.random() * variants.length)];
                if (typeof window !== "undefined") {
                    localStorage.setItem(PIN_KEY, pick.key);
                }
                if (!cancelled) setVariant(pick);
                // Fire-and-forget impression — don't block or await
                axios.post(`${API}/api/experiments/tagline/impression`, {
                    variant_key: pick.key,
                }).catch(() => { /* silent */ });
            } catch {
                // Network or server hiccup: keep FALLBACK, don't pin anything
            }
        })();
        return () => { cancelled = true; };
    }, []);

    return variant;
}
