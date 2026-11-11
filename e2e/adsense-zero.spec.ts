// Zero ad requests anywhere before the site is re-submitted for AdSense review
// (specs/adsense-minimal-readiness-20261111 US3): normal pages, the empty research section, an empty
// search, the 404 page — Chinese and English, desktop and phone, and across SPA transitions. Ad-host
// requests are intercepted and aborted, so a regression fails here instead of reaching Google.
// The verification meta tag and /ads.txt are not ad requests and are checked by scripts/adsense-smoke.mjs.
import { test, expect, type Page } from "@playwright/test";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const AD_HOSTS = /(?:googlesyndication\.com|doubleclick\.net|googleadservices\.com)/i;

/** Intercepts and records every request an ad network would see; none may occur. */
const noAds = (page: Page) => {
  const hits: string[] = [];
  void page.route(AD_HOSTS, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  return hits;
};

const CASES = [
  { path: "/", status: 200 },
  { path: "/en", status: 200 },
  { path: "/hot", status: 200 },
  { path: "/daily", status: 200 },
  { path: "/about", status: 200 },
  { path: "/terms", status: 200 },
  { path: "/more", status: 200 },
  { path: "/research", status: 200 }, // the empty section on the seeded site; a published one answers the same
  { path: "/en/research", status: 200 },
  { path: "/all?q=e2e-no-such-result", status: 200 }, // empty search results
  { path: "/e2e-no-such-page", status: 404 },
];

for (const { path, status } of CASES) {
  test(`loads no ad JS on ${path}`, async ({ page }) => {
    const hits = noAds(page);
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), path).toBe(status);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    expect(hits, "ad network requests").toEqual([]);
    expect((await page.content()).includes("adsbygoogle"), "ad script markup").toBe(false);
  });
}

test("SPA transitions across the site fire no ad requests", async ({ page }) => {
  const hits = noAds(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Client-side navigation only: entries that exist on every screen, desktop sidebar and phone tab bar alike.
  for (const href of ["/more", "/daily", "/hot", "/knowledge"]) {
    await page.locator(`a[href="${href}"]:visible`).first().click();
    await page.waitForURL(`**${href}`, { timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  }
  expect(hits, "ad network requests during transitions").toEqual([]);
});

test("at 390px the empty research page stays ad-free", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const hits = noAds(page);
  await page.goto("/research", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  expect(hits).toEqual([]);
});

// The navigation matches the section's real state (US1): no entry to an empty section, entries once a
// piece is published. Read the same api the pages read, so this holds on a seeded site and on production.
test("research navigation entries follow the published state", async ({ page }) => {
  const articles = await fetch(`${base}/api/research/articles`, { signal: AbortSignal.timeout(20_000) })
    .then((r) => (r.ok ? r.json() : { articles: [] }))
    .catch(() => ({ articles: [] }));
  const published = (articles as { articles?: unknown[] }).articles?.length ?? 0;
  // With something published: the sidebar entry on every page, plus /more's tools row and /about's button.
  const expected = published > 0 ? { "/": 1, "/more": 2, "/about": 2 } : { "/": 0, "/more": 0, "/about": 0 };
  for (const [path, count] of Object.entries(expected)) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/research"]'), `${path} with ${published} published`).toHaveCount(count);
  }
});
