/**
 * useExperimentVariant — generalised A/B variant picker.
 *
 * Usage:
 *   const variant = useExperimentVariant("login_tagline", FALLBACK);
 *   return <h1 style={{ color: variant.render.color }}>{variant.render.line1}</h1>;
 *
 * Behaviour:
 *   1. Reads pinned variant key from localStorage (per-experiment key).
 *   2. Fetches the variant registry for this experiment.
 *   3. If pinned variant still exists → return it.
 *   4. Otherwise random-pick, pin, fire one impression event.
 *
 * Attribution: `api.js` auto-forwards `X-Exp-{experiment_key}: {variant_key}`
 * headers for every pinned experiment, so signup-conversion experiments
 * are credited server-side on /auth/register and /auth/google/session.
 * Non-signup conversions (CTA clicks) call `trackConversion(key)`.
 */
import { useEffect, useState } from "react";
import axios from "axios";
import { BACKEND_URL } from "@/lib/api";

const API = BACKEND_URL;
const pinKey = (experimentKey) => `sai_exp_${experimentKey}`;

export function useExperimentVariant(experimentKey, fallback) {
    const [variant, setVariant] = useState(fallback);

    useEffect(() => {
        if (!experimentKey) return;
        let cancelled = false;
        (async () => {
            const pinned = typeof window !== "undefined" ? localStorage.getItem(pinKey(experimentKey)) : null;
            try {
                const res = await axios.get(`${API}/api/experiments/${encodeURIComponent(experimentKey)}/variants`);
                const variants = res?.data?.variants || [];
                if (!variants.length) return;

                if (pinned) {
                    const match = variants.find((v) => v.key === pinned);
                    if (match) {
                        if (!cancelled) setVariant(match);
                        return;
                    }
                    // Pinned key retired — re-pick
                }

                const pick = variants[Math.floor(Math.random() * variants.length)];
                if (typeof window !== "undefined") {
                    localStorage.setItem(pinKey(experimentKey), pick.key);
                }
                if (!cancelled) setVariant(pick);
                // Fire-and-forget impression
                axios.post(
                    `${API}/api/experiments/${encodeURIComponent(experimentKey)}/impression`,
                    { variant_key: pick.key }
                ).catch(() => { /* silent */ });
            } catch {
                // Network hiccup — keep the fallback, don't pin
            }
        })();
        return () => { cancelled = true; };
    }, [experimentKey]);

    return variant;
}

/**
 * trackConversion — call this for non-signup conversion events (e.g. the
 * TryNowBox submit button was clicked). Pulls the pinned variant from
 * localStorage and fires a conversion event. No-op if no variant is pinned.
 */
export function trackConversion(experimentKey) {
    if (!experimentKey || typeof window === "undefined") return;
    const variantKey = localStorage.getItem(pinKey(experimentKey));
    if (!variantKey) return;
    axios.post(
        `${API}/api/experiments/${encodeURIComponent(experimentKey)}/conversion`,
        { variant_key: variantKey }
    ).catch(() => { /* silent */ });
}

/**
 * getPinnedVariant — synchronous read for non-hook contexts.
 */
export function getPinnedVariant(experimentKey) {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(pinKey(experimentKey));
}
