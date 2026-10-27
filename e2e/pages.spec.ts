// Every public page opens and renders without script errors or a failing site API, and fits a phone screen.
import { test, expect } from "@playwright/test";
import { EN_PAGES, PAGES, expectNoOverflow, open, samplePages, samples, snapshot, watch } from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const content = samplePages(await samples(base));

for (const path of [...PAGES, ...EN_PAGES, ...content]) {
  test(`opens ${path}`, async ({ page }, info) => {
    const problems = watch(page);
    await open(page, path);
    await expectNoOverflow(page);
    await snapshot(page, info, path);
    expect(problems, `${path} while open`).toEqual([]);
  });
}

test("English daily archive has a working route and keeps English issue links", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
  await open(page, "/en/daily/archive");
  await expect(page.getByRole("heading", { name: "Daily archive" }).first()).toBeVisible();
  const archiveIssue = page.locator('a[href^="/en/daily/20"]:visible').first();
  await expect(archiveIssue).toBeVisible();
  await archiveIssue.click();
  await expect(page).toHaveURL(/\/en\/daily\/20\d\d-/);
});

test("an unknown address answers 404 with the site's page", async ({ page }) => {
  const res = await page.goto("/no-such-page-e2e");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1").first()).not.toBeEmpty();
});
