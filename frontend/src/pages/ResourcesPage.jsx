import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Youtube, ExternalLink, ChevronRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import { RESOURCES } from "@/data/resources";

const ICON_BY_KIND = {
    pdf: BookOpen,
    youtube: Youtube,
    link: ExternalLink,
};

/**
 * /resources — index page listing every entry in `data/resources.js`.
 * Renders a sparse left-aligned card grid (matches the rest of the
 * app's editorial aesthetic — no carousel, no marketing-page flourish).
 *
 * Each card is a `<Link>` into `/resources/:slug` for full-detail view;
 * the card itself does NOT trigger the download to avoid surprise
 * downloads when a user is just browsing the catalogue.
 */
export default function ResourcesPage() {
    return (
        <AppShell>
            <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14" data-testid="resources-page">
                <header className="mb-10">
                    <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "10px" }}>
                        Resources
                    </p>
                    <h1
                        className="mt-2 font-mono"
                        style={{
                            fontSize: "clamp(2rem, 4vw, 2.75rem)",
                            color: "hsl(var(--text-primary))",
                            letterSpacing: "-0.01em",
                        }}
                    >
                        Free reading & reference material
                    </h1>
                    <p className="mt-3 text-base max-w-2xl" style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.6 }}>
                        Curated resources that go deeper than the in-app verdicts — books, technical writeups, and (soon) videos that document the methodology behind Neural Stock Intelligence™. No email gate, no upsell.
                    </p>
                </header>

                <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="resources-list">
                    {RESOURCES.map((r) => {
                        const Icon = ICON_BY_KIND[r.kind] || ExternalLink;
                        return (
                            <li key={r.slug}>
                                <Link
                                    to={`/resources/${r.slug}`}
                                    className="block p-5 transition-colors group h-full"
                                    style={{
                                        border: "1px solid hsl(var(--border-divider))",
                                        background: "hsl(var(--surface-base))",
                                    }}
                                    data-testid={`resource-card-${r.slug}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div
                                            className="flex-shrink-0 p-2"
                                            style={{
                                                border: "1px solid hsl(var(--gold))",
                                                color: "hsl(var(--gold))",
                                            }}
                                        >
                                            <Icon size={16} strokeWidth={1.6} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className="text-overline"
                                                style={{ fontSize: "9.5px", color: "hsl(var(--text-muted))" }}
                                            >
                                                {r.kind === "pdf" ? "PDF · Free download" : r.kind === "youtube" ? "Video" : "External link"}
                                            </p>
                                            <h3
                                                className="font-mono mt-1"
                                                style={{
                                                    fontSize: "1.05rem",
                                                    color: "hsl(var(--text-primary))",
                                                    letterSpacing: "-0.005em",
                                                }}
                                            >
                                                {r.title}
                                            </h3>
                                            <p
                                                className="mt-2 text-sm"
                                                style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                                            >
                                                {r.teaser}
                                            </p>
                                            <p
                                                className="mt-3 inline-flex items-center gap-1 text-xs"
                                                style={{ color: "hsl(var(--gold))" }}
                                            >
                                                {r.ctaLabel || "Open"}
                                                <ChevronRight size={11} strokeWidth={2} />
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>

                <p className="mt-10 text-xs" style={{ color: "hsl(var(--text-muted))", lineHeight: 1.6 }}>
                    More books, technical deep-dives, and YouTube walkthroughs are in the pipeline. Want a topic covered? Email <a href="mailto:ai.neulab.inc@gmail.com" style={{ color: "hsl(var(--gold))" }}>ai.neulab.inc@gmail.com</a>.
                </p>
            </div>
        </AppShell>
    );
}
