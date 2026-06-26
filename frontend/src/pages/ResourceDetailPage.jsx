import React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, BookOpen, Youtube, ExternalLink } from "lucide-react";
import { findResource } from "@/data/resources";

const ICON_BY_KIND = { pdf: BookOpen, youtube: Youtube, link: ExternalLink };

/**
 * /resources/:slug — long-form detail page for a single resource. The
 * body schema is documented in `data/resources.js` — this component is
 * deliberately a dumb renderer over that schema so adding a new
 * resource requires zero per-resource page code.
 *
 * The download CTA appears in TWO places:
 *   1. The hero card (visible immediately so power users don't have to
 *      scroll the marketing copy)
 *   2. The footer card (so casual readers who DO scroll all the way
 *      through don't have to scroll back up)
 *
 * For PDFs we use `<a href download>` (browser handles streaming + the
 * suggested filename via the `download` attribute). For YouTube /
 * external links we open in a new tab with `rel="noreferrer"` so we
 * don't leak the user's session referrer.
 */
function CtaButton({ resource, testid }) {
    const isPdf = resource.kind === "pdf";
    return (
        <a
            href={resource.downloadUrl}
            {...(isPdf ? { download: resource.downloadFilename || true } : { target: "_blank", rel: "noreferrer" })}
            className="inline-flex items-center gap-2 px-5 py-3 font-mono text-sm transition-colors"
            style={{
                border: "1px solid hsl(var(--gold))",
                color: "hsl(var(--gold))",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
            }}
            data-testid={testid}
        >
            {isPdf ? <Download size={14} strokeWidth={1.8} /> : <ExternalLink size={14} strokeWidth={1.8} />}
            {resource.ctaLabel || (isPdf ? "Download PDF" : "Open")}
        </a>
    );
}

function Body({ block, idx }) {
    if (block.type === "lead") {
        return (
            <p
                key={idx}
                className="mt-8 text-base italic"
                style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.7, letterSpacing: "0.005em" }}
            >
                {block.text}
            </p>
        );
    }
    if (block.type === "callout") {
        return (
            <div
                key={idx}
                className="mt-8 p-5"
                style={{
                    borderLeft: "3px solid hsl(var(--gold))",
                    background: "hsl(var(--surface-elevated))",
                }}
            >
                {block.heading && (
                    <p
                        className="font-mono"
                        style={{
                            fontSize: "1rem",
                            color: "hsl(var(--text-primary))",
                            letterSpacing: "-0.005em",
                        }}
                    >
                        {block.heading}
                    </p>
                )}
                <p
                    className={block.heading ? "mt-2 text-sm" : "text-sm"}
                    style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.6 }}
                >
                    {block.paragraph}
                </p>
            </div>
        );
    }
    // type === "section"
    return (
        <section key={idx} className="mt-8">
            {block.heading && (
                <h2
                    className="font-mono"
                    style={{
                        fontSize: "1.1rem",
                        color: "hsl(var(--text-primary))",
                        letterSpacing: "-0.005em",
                    }}
                >
                    {block.heading}
                </h2>
            )}
            {block.paragraph && (
                <p
                    className={block.heading ? "mt-3 text-base" : "text-base"}
                    style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.65 }}
                >
                    {block.paragraph}
                </p>
            )}
            {block.items && (
                <ul className="mt-3 space-y-2">
                    {block.items.map((it, i) => (
                        <li
                            key={i}
                            className="text-base flex gap-3"
                            style={{ color: "hsl(var(--text-secondary))", lineHeight: 1.55 }}
                        >
                            <span style={{ color: "hsl(var(--gold))" }}>•</span>
                            <span>{it}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function ResourceDetailPage() {
    const { slug } = useParams();
    const resource = findResource(slug);

    if (!resource) {
        return (
            <div className="max-w-3xl mx-auto px-5 md:px-8 py-16 text-center" data-testid="resource-not-found">
                <p className="text-overline" style={{ color: "hsl(var(--text-muted))", fontSize: "10px" }}>
                    404
                </p>
                <h1 className="mt-3 font-mono text-2xl" style={{ color: "hsl(var(--text-primary))" }}>
                    Resource not found
                </h1>
                <p className="mt-3 text-base" style={{ color: "hsl(var(--text-secondary))" }}>
                    That link may be outdated or the resource was renamed.
                </p>
                <Link
                    to="/resources"
                    className="mt-6 inline-flex items-center gap-2 text-sm"
                    style={{ color: "hsl(var(--gold))" }}
                >
                    <ArrowLeft size={13} strokeWidth={1.8} /> Back to all resources
                </Link>
            </div>
        );
    }

    const Icon = ICON_BY_KIND[resource.kind] || ExternalLink;

    return (
        <article className="max-w-3xl mx-auto px-5 md:px-8 py-10 md:py-14" data-testid={`resource-detail-${resource.slug}`}>
                <Link
                    to="/resources"
                    className="inline-flex items-center gap-2 text-xs"
                    style={{ color: "hsl(var(--text-muted))" }}
                    data-testid="resource-back-link"
                >
                    <ArrowLeft size={11} strokeWidth={1.8} /> Resources
                </Link>

                {/* Hero card — kind label, title, hero quote, primary CTA. */}
                <header
                    className="mt-5 p-6 md:p-8"
                    style={{
                        border: "1px solid hsl(var(--border-divider))",
                        background: "hsl(var(--surface-elevated))",
                    }}
                >
                    <div className="flex items-center gap-2">
                        <Icon size={13} strokeWidth={1.7} style={{ color: "hsl(var(--gold))" }} />
                        <p
                            className="text-overline"
                            style={{ fontSize: "10px", color: "hsl(var(--gold))" }}
                        >
                            {resource.kind === "pdf" ? "PDF · Free download" : resource.kind === "youtube" ? "Video" : "External link"}
                        </p>
                    </div>
                    <h1
                        className="mt-3 font-mono"
                        style={{
                            fontSize: "clamp(1.85rem, 4vw, 2.5rem)",
                            color: "hsl(var(--text-primary))",
                            letterSpacing: "-0.01em",
                            lineHeight: 1.15,
                        }}
                    >
                        {resource.title}
                    </h1>
                    {resource.heroQuote && (
                        <p
                            className="mt-5 text-base whitespace-pre-line italic"
                            style={{
                                color: "hsl(var(--text-primary))",
                                lineHeight: 1.6,
                                borderLeft: "3px solid hsl(var(--gold))",
                                paddingLeft: "1rem",
                            }}
                        >
                            {resource.heroQuote}
                        </p>
                    )}
                    {resource.meta && (
                        <p
                            className="mt-5 text-xs font-mono flex flex-wrap gap-x-3 gap-y-1"
                            style={{ color: "hsl(var(--text-muted))" }}
                        >
                            {resource.meta.priceLabel && <span>{resource.meta.priceLabel}</span>}
                            {resource.meta.pages && <span>· {resource.meta.pages}</span>}
                            {resource.meta.size && <span>· {resource.meta.size}</span>}
                        </p>
                    )}
                    <div className="mt-6">
                        <CtaButton resource={resource} testid="resource-cta-hero" />
                        {resource.secondaryUrl && (
                            <Link
                                to={resource.secondaryUrl}
                                className="inline-flex items-center gap-2 px-5 py-3 font-mono text-sm transition-colors"
                                style={{
                                    border: "1px solid hsl(var(--border-default))",
                                    color: "hsl(var(--text-secondary))",
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                }}
                                data-testid="resource-cta-secondary"
                            >
                                {resource.secondaryLabel || "Read online"}
                            </Link>
                        )}
                    </div>
                </header>

                {/* Body — rendered from the resource's `body` schema. */}
                <div className="mt-2">
                    {(resource.body || []).map((b, i) => (
                        <Body key={i} block={b} idx={i} />
                    ))}
                </div>

                {/* Footer CTA — sticky-feel section so readers who scroll
                    all the way through don't have to scroll back up. */}
                <footer
                    className="mt-12 p-6 md:p-8 text-center"
                    style={{
                        border: "1px solid hsl(var(--gold))",
                        background: "hsl(var(--surface-elevated))",
                    }}
                >
                    <p className="font-mono text-base" style={{ color: "hsl(var(--text-primary))" }}>
                        {resource.kind === "pdf" ? "Free. No email required." : "Open the resource"}
                    </p>
                    <div className="mt-4">
                        <CtaButton resource={resource} testid="resource-cta-footer" />
                    </div>
                </footer>
        </article>
    );
}
