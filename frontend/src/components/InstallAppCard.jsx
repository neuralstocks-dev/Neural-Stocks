import React, { useEffect, useState } from "react";
import { Download, Smartphone, Share2, Check, Plus } from "lucide-react";

/**
 * InstallAppCard
 * ----------------
 * Cross-platform "Add to Home Screen" CTA:
 *  - Android / Desktop Chrome & Edge: captures the `beforeinstallprompt` event
 *    and triggers the native install prompt on click.
 *  - iOS Safari: shows the manual Share → "Add to Home Screen" steps, because
 *    Apple doesn't fire `beforeinstallprompt`.
 *  - Already-installed standalone sessions: renders a muted confirmation.
 */
export default function InstallAppCard() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isIos, setIsIos] = useState(false);
    const [showIosHelp, setShowIosHelp] = useState(false);
    const [installed, setInstalled] = useState(false);

    useEffect(() => {
        const ua = window.navigator.userAgent || "";
        const iOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        setIsIos(iOS);

        const standalone =
            window.matchMedia?.("(display-mode: standalone)").matches ||
            // Legacy iOS
            window.navigator.standalone === true;
        setIsStandalone(!!standalone);

        const onBeforeInstall = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        const onInstalled = () => {
            setInstalled(true);
            setDeferredPrompt(null);
        };
        window.addEventListener("beforeinstallprompt", onBeforeInstall);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstall);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const onInstallClick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === "accepted") setInstalled(true);
        } catch {
            // user dismissed or browser restricted — no-op
        } finally {
            setDeferredPrompt(null);
        }
    };

    // ------------- render branches -------------

    if (isStandalone || installed) {
        return (
            <section
                className="module p-5 md:p-6 mt-8 flex items-start gap-4"
                data-testid="install-card-installed"
            >
                <div
                    className="flex-shrink-0"
                    style={{
                        width: 44,
                        height: 44,
                        border: "1px solid hsl(var(--buy))",
                        color: "hsl(var(--buy))",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: 2,
                    }}
                >
                    <Check size={18} strokeWidth={1.75} />
                </div>
                <div>
                    <p className="text-overline" style={{ color: "hsl(var(--buy))" }}>
                        App installed
                    </p>
                    <h3 className="font-serif text-lg mt-1" style={{ letterSpacing: "-0.005em" }}>
                        Neulab is running as a standalone app.
                    </h3>
                    <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                        You're already inside the installed Neulab app — no browser chrome, instant launch from your
                        home screen.
                    </p>
                </div>
            </section>
        );
    }

    // iOS Safari branch: manual instructions
    if (isIos) {
        return (
            <section className="module p-5 md:p-6 mt-8" data-testid="install-card-ios">
                <div className="flex items-start gap-4">
                    <div
                        className="flex-shrink-0"
                        style={{
                            width: 44,
                            height: 44,
                            border: "1px solid hsl(var(--hold))",
                            color: "hsl(var(--hold))",
                            display: "grid",
                            placeItems: "center",
                            borderRadius: 2,
                        }}
                    >
                        <Smartphone size={18} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                            Install on iPhone / iPad
                        </p>
                        <h3
                            className="font-serif text-lg mt-1"
                            style={{ letterSpacing: "-0.005em" }}
                        >
                            Add Neulab to your home screen.
                        </h3>
                        <p
                            className="text-sm mt-2"
                            style={{ color: "hsl(var(--text-secondary))" }}
                        >
                            Open this page in <strong>Safari</strong> (not Chrome or in-app browsers), then follow the
                            three steps below. The app opens in its own window — no browser address bar.
                        </p>

                        <button
                            type="button"
                            onClick={() => setShowIosHelp((v) => !v)}
                            className="btn-ghost mt-4 text-sm"
                            data-testid="install-ios-toggle"
                        >
                            {showIosHelp ? "Hide steps" : "Show steps"}
                        </button>

                        {showIosHelp && (
                            <ol
                                className="mt-4 space-y-3 text-sm"
                                data-testid="install-ios-steps"
                            >
                                <li className="flex items-start gap-3">
                                    <span
                                        className="font-mono text-overline flex-shrink-0"
                                        style={{
                                            width: 22,
                                            height: 22,
                                            display: "grid",
                                            placeItems: "center",
                                            border: "1px solid hsl(var(--border-default))",
                                            color: "hsl(var(--hold))",
                                            fontSize: "0.6rem",
                                        }}
                                    >
                                        01
                                    </span>
                                    <span style={{ color: "hsl(var(--text-secondary))" }}>
                                        Tap the{" "}
                                        <Share2
                                            size={13}
                                            strokeWidth={1.75}
                                            className="inline mx-1 align-[-2px]"
                                        />
                                        <strong>Share</strong> button in Safari's bottom toolbar.
                                    </span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span
                                        className="font-mono text-overline flex-shrink-0"
                                        style={{
                                            width: 22,
                                            height: 22,
                                            display: "grid",
                                            placeItems: "center",
                                            border: "1px solid hsl(var(--border-default))",
                                            color: "hsl(var(--hold))",
                                            fontSize: "0.6rem",
                                        }}
                                    >
                                        02
                                    </span>
                                    <span style={{ color: "hsl(var(--text-secondary))" }}>
                                        Scroll down and tap{" "}
                                        <Plus
                                            size={13}
                                            strokeWidth={1.75}
                                            className="inline mx-1 align-[-2px]"
                                        />
                                        <strong>Add to Home Screen</strong>.
                                    </span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <span
                                        className="font-mono text-overline flex-shrink-0"
                                        style={{
                                            width: 22,
                                            height: 22,
                                            display: "grid",
                                            placeItems: "center",
                                            border: "1px solid hsl(var(--border-default))",
                                            color: "hsl(var(--hold))",
                                            fontSize: "0.6rem",
                                        }}
                                    >
                                        03
                                    </span>
                                    <span style={{ color: "hsl(var(--text-secondary))" }}>
                                        Confirm the name <strong>Neulab</strong> and tap <strong>Add</strong>. The
                                        Neulab icon will appear on your home screen — tap it to launch the app.
                                    </span>
                                </li>
                            </ol>
                        )}
                    </div>
                </div>
            </section>
        );
    }

    // Android / Chrome / Edge branch
    // Before the browser fires `beforeinstallprompt`, render a friendly placeholder
    // that hints the installation path without blocking on the event.
    return (
        <section
            className="module p-5 md:p-6 mt-8 flex items-start gap-4"
            data-testid="install-card-chromium"
        >
            <div
                className="flex-shrink-0"
                style={{
                    width: 44,
                    height: 44,
                    border: "1px solid hsl(var(--hold))",
                    color: "hsl(var(--hold))",
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 2,
                }}
            >
                <Download size={18} strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-overline" style={{ color: "hsl(var(--hold))" }}>
                    Install Neulab
                </p>
                <h3 className="font-serif text-lg mt-1" style={{ letterSpacing: "-0.005em" }}>
                    Open Neulab like a native app.
                </h3>
                <p className="text-sm mt-2" style={{ color: "hsl(var(--text-secondary))" }}>
                    Install the Neulab app on your device for instant launch, its own window without browser tabs,
                    and direct shortcuts to Dashboard, Portfolio, and Scorecard.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onInstallClick}
                        disabled={!deferredPrompt}
                        className="btn-primary inline-flex items-center gap-2"
                        data-testid="install-app-button"
                        title={
                            deferredPrompt
                                ? "Install Neulab"
                                : "Your browser will offer install once it has enough engagement."
                        }
                    >
                        <Download size={14} strokeWidth={1.75} />
                        Install app
                    </button>
                    {!deferredPrompt && (
                        <span
                            className="text-xs"
                            style={{ color: "hsl(var(--text-muted))" }}
                            data-testid="install-hint"
                        >
                            Not ready yet — on Chrome / Edge you can also tap the browser's address bar install icon,
                            or use Menu → Install Neulab.
                        </span>
                    )}
                </div>
            </div>
        </section>
    );
}
