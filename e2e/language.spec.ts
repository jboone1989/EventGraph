// The language switch moves between a page and its English edition and remembers the choice.
import { test, expect } from "@playwright/test";
import { open, samples } from "./site.ts";

const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const { item } = await samples(base);
const switchTo = (page: import("@playwright/test").Page, label: "EN" | "中文") =>
  page.getByRole("group", { name: "Language / 语言" }).first().getByRole("button", { name: label }).click();

test("home switches to /en and back", async ({ page }) => {
  await open(page, "/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await switchTo(page, "EN");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await switchTo(page, "中文");
  await expect(page).toHaveURL(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`));
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("the English choice stays for pages without an /en address", async ({ page }) => {
  await open(page, "/about");
  await switchTo(page, "EN");
  await expect(page.locator("html")).toHaveAttribute("data-language", "en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-language", "en");
});

test("an article switches to its English page", async ({ page }) => {
  test.skip(!item, "the site has no published article");
  await open(page, `/items/${item}`);
  await switchTo(page, "EN");
  await expect(page).toHaveURL(new RegExp(`/en/items/${item}$`));
  await switchTo(page, "中文");
  await expect(page).toHaveURL(new RegExp(`/items/${item}$`));
});
