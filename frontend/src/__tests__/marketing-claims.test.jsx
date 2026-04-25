/**
 * Marketing-claims regression test.
 *
 * Reads the canonical plan-limits fixture (synced from backend
 * /app/backend/core/config.py via /app/scripts/sync_plan_limits.py) and
 * greps marketing/conversion pages to confirm the visible numbers match
 * what the backend actually enforces.
 *
 * If a marketing page promises "5 watchlist · 50 analyses / day" while the
 * backend caps free tier at 5 + 3, this test fails before the user can be
 * misled. Running the sync script after changing config.py will tell you
 * which pages need their copy updated.
 *
 * To run:
 *   cd /app/frontend && yarn test marketing-claims --watchAll=false
 */
const fs = require("fs");
const path = require("path");

const fixture = require("../__fixtures__/plan_limits.json");

const SRC = path.resolve(__dirname, "..");

function readFile(rel) {
    return fs.readFileSync(path.join(SRC, rel), "utf8");
}

describe("marketing claims match backend plan limits", () => {
    const free = fixture.free;

    test("backend snapshot has the canonical free tier we built copy around", () => {
        // Sanity check: if any of these change the test should fail loudly so
        // the dev knows to update marketing copy *and* this assertion.
        expect(free.watchlist_limit).toBe(5);
        expect(free.analyses_per_day).toBe(3);
        expect(free.analyses_per_week).toBe(12);
        expect(free.share_per_day).toBe(5);
    });

    describe("WhyUsPage final CTA", () => {
        const src = readFile("pages/WhyUsPage.jsx");

        test("states the correct free watchlist size", () => {
            expect(src).toMatch(
                new RegExp(`Free tier includes ${free.watchlist_limit} watchlist`)
            );
        });

        test("states the correct free analyses-per-day cap", () => {
            expect(src).toMatch(
                new RegExp(
                    `${free.analyses_per_day} full AI analyses per day`
                )
            );
        });

        test("does not promise 'unlimited' on the free tier final CTA", () => {
            // Allow 'unlimited' elsewhere on the page (e.g. Elite tier copy)
            // but the free-tier CTA paragraph must not.
            const ctaSlice = src
                .split("Free tier includes")[1]
                ?.split("</p>")[0] || "";
            expect(ctaSlice).not.toMatch(/unlimited/i);
        });
    });

    describe("PublicTryVerdictPage signup CTAs", () => {
        const src = readFile("pages/PublicTryVerdictPage.jsx");

        test("free-tier strip shows the real watchlist size", () => {
            expect(src).toMatch(
                new RegExp(
                    `Free tier · up to ${free.watchlist_limit} watchlist stocks`
                )
            );
        });

        test("free-tier strip shows the real analyses-per-day cap", () => {
            expect(src).toMatch(
                new RegExp(`${free.analyses_per_day} analyses / day`)
            );
        });

        test("does not promise 'unlimited' analyses on signup CTA", () => {
            // Two separate CTAs were both promising 'unlimited' — guard both.
            expect(src).not.toMatch(/unlock[^.]*unlimited[^.]*analyses/i);
            expect(src).not.toMatch(/Sign up to run unlimited analyses/i);
        });

        test("rate-limited fallback teaser uses the real analyses-per-day", () => {
            expect(src).toMatch(
                new RegExp(
                    `Sign up to unlock ${free.analyses_per_day} analyses per day`
                )
            );
        });
    });

    describe("SignupPage", () => {
        const src = readFile("pages/SignupPage.jsx");

        test("states the correct free watchlist ticker count", () => {
            expect(src).toMatch(
                new RegExp(
                    `up to ${free.watchlist_limit} tickers`
                )
            );
        });
    });

    describe("PublicVerdictPage", () => {
        const src = readFile("pages/PublicVerdictPage.jsx");

        test("states the correct free watchlist size", () => {
            expect(src).toMatch(
                new RegExp(
                    `up to ${free.watchlist_limit} stocks free`
                )
            );
        });
    });

    describe("TryNowBox placeholder", () => {
        const src = readFile("components/TryNowBox.jsx");

        test("does not promise 'unlimited' to anonymous visitors", () => {
            expect(src).not.toMatch(/sign up for unlimited/i);
        });
    });

    describe("TechnicalPage share-rate-limit copy", () => {
        const src = readFile("pages/TechnicalPage.jsx");
        const pro = fixture.pro;

        test("free share/day matches backend", () => {
            expect(src).toMatch(
                new RegExp(`Free ${free.share_per_day}/day`)
            );
        });

        test("pro share/day matches backend", () => {
            expect(src).toMatch(
                new RegExp(`Pro ${pro.share_per_day}/day`)
            );
        });
    });
});
