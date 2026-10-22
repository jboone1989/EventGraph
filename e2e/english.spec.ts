// A reader who chose English sees no Chinese interface text: the /en edition, every page under the
// English preference, and the overlays and sheets that open on top of them.
import { test, expect, type Page } from "@playwright/test";
import { EN_PAGES, PAGES, chineseLeft, open, samplePages, samples, snapshot } from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const content = samplePages(await samples(base));
// The original-language page of an article shows the publisher's own text, Chinese or not.
const pages = [...PAGES, ...EN_PAGES, ...content.filter((p) => !p.endsWith("/original"))];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem("livingruntime-language", "en"));
});

async function openEnglish(page: Page, path: string) {
  await open(page, path);
  await page.waitForFunction(() => document.documentElement.dataset.language === "en");
}

for (const path of pages) {
  test(`English ${path}`, async ({ page }, info) => {
    await openEnglish(page, path);
    if (path === "/hot") await page.locator("#hot-method").evaluate((el) => ((el as HTMLDetailsElement).open = true)).catch(() => {});
    const left = await chineseLeft(page);
    if (left.length) await snapshot(page, info, `${path} in English`);
    expect(left, `Chinese text on ${path} in English`).toEqual([]);
  });
}

test("English search, filter and hot-board overlays", async ({ page }) => {
  await openEnglish(page, "/");
  for (const name of ["Search", "Filter"]) {
    const button = page.getByRole("button", { name, exact: true }).first();
    if (!(await button.isVisible().catch(() => false))) continue;
    await button.click();
    await page.waitForTimeout(300);
    expect(await chineseLeft(page), `Chinese text in the ${name} overlay`).toEqual([]);
    await page.keyboard.press("Escape");
  }
  await openEnglish(page, "/hot");
  const faces = page.getByRole("button", { name: /participants · view sources/i }).first();
  if (await faces.isVisible().catch(() => false)) {
    await faces.click();
    await page.waitForTimeout(300);
    expect(await chineseLeft(page), "Chinese text in the participants list").toEqual([]);
  }
});

test("English feedback screenshot picker", async ({ page }) => {
  await openEnglish(page, "/feedback");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add a screenshot of the problem/i }).click();
  await (await chooser).setFiles({ name: "e2e-shot.png", mimeType: "image/png", buffer: Buffer.from("not-an-image") });
  await expect(page.getByText("e2e-shot.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove screenshot" }).click();
  await expect(page.getByRole("button", { name: /Add a screenshot of the problem/i })).toBeVisible();
});
