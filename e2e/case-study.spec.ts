// The evolution experiment's case page (specs/event-evolution-experiment): parallel tracks from
// real public routes, annotated cross-event links with their sources, and the experiment kept off
// the index. It renders honestly in any environment — without the case's real stories the tracks
// answer "insufficient" instead of inventing stations.
import { test, expect } from "@playwright/test";
import { open, expectNoOverflow, watch } from "./site.ts";

const CASE = "wallet-tampering-2026-10";
const caseOk = await fetch((process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000") + `/api/site/case-studies/${CASE}`,
  { signal: AbortSignal.timeout(20_000) }).then((r) => r.ok).catch(() => false);

test("the case page lays out its tracks and stays off the index", async ({ page }) => {
  test.skip(!caseOk, "This site build does not carry the case-study API");
  const problems = watch(page);
  await open(page, `/explore?case=${CASE}`);
  // The curated copy explains the experiment and its evidence rules.
  await expect(page.getByRole("heading", { name: /硬件钱包供应链攻击/ })).toBeVisible();
  await expect(page.getByText("轨道之间不画箭头", { exact: false })).toBeVisible();
  await expect(page.getByText("站点按本站收录时间排列", { exact: false })).toBeVisible();
  // Withdrawn or unavailable routes may remain as honest empty tracks, but
  // must not advertise a public story replay that has no visible evidence.
  const api = await page.request.get(`/api/site/case-studies/${CASE}`);
  expect(api.ok()).toBeTruthy();
  const data = await api.json() as { tracks: { status: string }[] };
  const available = data.tracks.filter(track => track.status === "ok").length;
  await expect(page.locator('a[href*="/explore?story="]')).toHaveCount(available);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  await expectNoOverflow(page);
  expect(problems).toEqual([]);
});

test("the English edition carries the experiment in English and stays off the index", async ({ page }) => {
  test.skip(!caseOk, "This site build does not carry the case-study API");
  const problems = watch(page);
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await open(page, `/en/explore?case=${CASE}`);
  await expect(page.getByRole("heading", { name: /Hardware wallet supply-chain attack/ })).toBeVisible();
  await expect(page.getByText("No arrows are drawn between tracks", { exact: false })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
  await expectNoOverflow(page);
  expect(problems).toEqual([]);
});

test("an unknown case id answers 404", async ({ page }) => {
  test.skip(!caseOk, "This site build does not carry the case-study API");
  const res = await page.goto("/explore?case=e2e-no-such-case");
  expect(res?.status()).toBe(404);
});

test("the phone viewport keeps the tracks distinguishable without sideways scrolling", async ({ page }) => {
  test.skip(!caseOk, "This site build does not carry the case-study API");
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `/explore?case=${CASE}`);
  // The four tracks stack; each stays its own labelled section.
  expect(await page.locator("section[aria-label]").count()).toBeGreaterThanOrEqual(3);
  await expectNoOverflow(page);
});
