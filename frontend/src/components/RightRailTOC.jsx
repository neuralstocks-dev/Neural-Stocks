/**
 * RightRailTOC — reusable floating right-rail table of contents for long
 * documentation pages (`/technical`, `/manual`, etc.).
 *
 * Usage:
 *   <RightRailTOC
 *       label="On this page"           // optional · default "On this page"
 *       sections={[
 *           { id: "intro", label: "Introduction" },
 *           { id: "best-fit", label: "Best fit", tone: "buy" },
 *           { id: "limits",   label: "Honest limits", tone: "sell" },
 *       ]}
 *   />
 *
 * With grouped sections (e.g. for the 5-part Manual):
 *   <RightRailTOC
 *       sections={[
 *           { group: "Part 1 · Get oriented", items: [
 *               { id: "welcome", label: "Welcome" },
 *               { id: "primer",  label: "Primer" },
 *           ]},
 *           { group: "Part 2 · Getting started", items: [ ... ] },
 *       ]}
 *   />
 *
 * Behaviour:
 * - Sticky on the right side at xl+ viewports (≥1280px), hidden below.
 * - IntersectionObserver tracks which section is currently in the upper-third
 *   reading band and highlights the matching link with `aria-current="location"`.
 * - Click any link → smooth-scroll to the target + optimistic immediate highlight.
 * - Optional `tone` per item: "buy" | "sell" | undefined.
 *   Buy = green active highlight (positive content).
 *   Sell = red active highlight (cautionary content).
 *   undefined = default white-primary highlight.
 * - Accessible: nav has `aria-label`, active item has `aria-current="location"`.
 */
import React, { useEffect, useMemo, useState } from "react";

const TONE_COLORS = {
    buy: "hsl(var(--buy))",
    sell: "hsl(var(--sell))",
    default: "hsl(var(--text-primary))",
};

function isGrouped(sections) {
    return Array.isArray(sections) && sections.length > 0 && "items" in sections[0];
}

export default function RightRailTOC({
    sections,
    label = "On this page",
    width = 200,
    top = 128,
    right = 24,
    testid = "right-rail-toc",
}) {
    const [activeId, setActiveId] = useState(null);

    // Flatten the sections list for the IntersectionObserver — we don't care
    // about groups for active-detection, only for visual rendering.
    const flatItems = useMemo(() => {
        if (isGrouped(sections)) {
            return sections.flatMap((g) => g.items);
        }
        return sections;
    }, [sections]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible.length) setActiveId(visible[0].target.id);
            },
            // top -10% margin = activate when section is ~10% from top of viewport.
            // bottom -65% = stop being active once it's past the upper-third.
            { rootMargin: "-10% 0px -65% 0px", threshold: 0 }
        );
        flatItems.forEach(({ id }) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, [flatItems]);

    const handleClick = (e, id) => {
        e.preventDefault();
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            // Optimistic highlight so the click feels instant; observer
            // catches up on next scroll tick anyway.
            setActiveId(id);
        }
    };

    function renderItem({ id, label: itemLabel, tone }) {
        const isActive = activeId === id;
        const activeColor = TONE_COLORS[tone] || TONE_COLORS.default;
        return (
            <li key={id}>
                <a
                    href={`#${id}`}
                    onClick={(e) => handleClick(e, id)}
                    data-testid={`${testid}-${id}`}
                    aria-current={isActive ? "location" : undefined}
                    className="block transition-colors"
                    style={{
                        fontSize: "0.7rem",
                        letterSpacing: "0.02em",
                        color: isActive ? activeColor : "hsl(var(--text-muted))",
                        paddingLeft: "10px",
                        borderLeft: `2px solid ${isActive ? activeColor : "transparent"}`,
                        paddingTop: "3px",
                        paddingBottom: "3px",
                        fontWeight: isActive ? 500 : 400,
                    }}
                    onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.color = "hsl(var(--text-secondary))";
                    }}
                    onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.color = "hsl(var(--text-muted))";
                    }}
                >
                    {itemLabel}
                </a>
            </li>
        );
    }

    return (
        <nav
            className="hidden xl:block fixed z-30"
            aria-label={label}
            data-testid={testid}
            style={{
                right,
                top,
                width,
                fontFamily: "'SFMono-Regular', Menlo, monospace",
                maxHeight: "calc(100vh - 160px)",
                overflowY: "auto",
            }}
        >
            <p
                className="text-overline mb-3 pb-2"
                style={{
                    fontSize: "0.58rem",
                    color: "hsl(var(--text-muted))",
                    borderBottom: "1px solid hsl(var(--border-divider))",
                }}
            >
                {label}
            </p>

            {isGrouped(sections) ? (
                <div className="space-y-4">
                    {sections.map((g) => (
                        <div key={g.group}>
                            <p
                                className="text-overline mb-1.5"
                                style={{
                                    fontSize: "0.55rem",
                                    color: "hsl(var(--buy))",
                                    letterSpacing: "0.04em",
                                }}
                            >
                                {g.group}
                            </p>
                            <ul className="space-y-1">{g.items.map(renderItem)}</ul>
                        </div>
                    ))}
                </div>
            ) : (
                <ul className="space-y-1.5">{sections.map(renderItem)}</ul>
            )}
        </nav>
    );
}
