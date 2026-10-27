// What the checks share: the site's pages, sample pages found through the site's own API, and the
// failures every page is checked for.
import { expect, type Page, type TestInfo } from "@playwright/test";

/** Pages every site has, data or not. */
export const PAGES = [
  "/", "/all", "/hot", "/knowledge", "/explore", "/daily", "/daily/archive", "/weekly", "/monthly", "/topics", "/starred",
  "/agent", "/about", "/changelog", "/feedback", "/terms", "/privacy", "/more", "/admin/login",
];
/** The English edition's stable addresses (apps/web/app/lib/edition.ts). */
export const EN_PAGES = ["/en", "/en/hot", "/en/knowledge", "/en/explore", "/en/daily", "/en/daily/archive", "/en/topics"];

export interface Samples {
  item?: string;
  story?: string;
  daily?: string;
  topic?: string;
  entity?: string;
}

/** One of each kind of content page the site has now, read from the same API the pages read. */
export async function samples(baseURL: string): Promise<Samples> {
  const get = (path: string) => fetch(baseURL + path, { signal: AbortSignal.timeout(20_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [timeline, hot, daily, topics, graph] = await Promise.all([
    get("/api/site/timeline"), get("/api/site/hot"), get("/api/site/reports/daily/latest-page"), get("/api/site/topics"), get("/api/site/knowledge/overview"),
  ]);
  return {
    item: timeline?.cards?.[0]?.item?.id,
    story: hot?.entries?.[0]?.story?.publicId,
    daily: daily?.report?.key,
    topic: topics?.topics?.[0]?.slug,
    entity: graph?.edges?.[0]?.subject?.key,
  };
}

/** The content pages of `s`, Chinese and English. */
export function samplePages(s: Samples): string[] {
  const pages: string[] = [];
  if (s.item) pages.push(`/items/${s.item}`, `/items/${s.item}/original`, `/en/items/${s.item}`);
  if (s.story) pages.push(`/story/${s.story}`, `/en/story/${s.story}`);
  if (s.daily) pages.push(`/daily/${s.daily}`, `/en/daily/${s.daily}`);
  if (s.topic) pages.push(`/topics/${s.topic}`, `/en/topics/${s.topic}`);
  if (s.entity) pages.push(`/knowledge/entity/${encodeURIComponent(s.entity)}`, `/en/knowledge/entity/${encodeURIComponent(s.entity)}`);
  return pages;
}

/** Records what goes wrong while a page is open: uncaught script errors and the site API failing. Outside
 * services the page asks through the site (market prices) are left out: CI runs without them. */
export function watch(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`script error: ${error.message}`));
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (res.status() >= 500 && url.pathname.startsWith("/api/site/")) problems.push(`HTTP ${res.status()} ${url.pathname}${url.search}`);
  });
  return problems;
}

/** Opens `path` and checks the page answered and rendered: status 200, text on the page, and not the
 * error page (root.tsx ErrorBoundary) that a failure after loading falls back to. */
export async function open(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(res?.status(), `${path} answers 200`).toBe(200);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  expect((await page.locator("body").innerText()).trim().length, `${path} shows text`).toBeGreaterThan(40);
  await expect(page.getByRole("heading", { name: /^(暂时无法加载|Unable to load)$/ }), `${path} fell back to the error page`).toHaveCount(0);
}

/** Fails when the page is wider than the screen, naming the widest elements. */
export async function expectNoOverflow(page: Page) {
  const wide = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width + 1) return [];
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && getComputedStyle(el).position !== "fixed")
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`);
  });
  expect(wide, "the page scrolls sideways; widest elements").toEqual([]);
}

/** Visible Chinese text left on a page shown in English: text, document title, description and labels.
 * The language switch names both languages and is left out. */
export function chineseLeft(page: Page) {
  return page.evaluate(() => {
    const han = /[㐀-鿿]/u;
    const visible = (el: Element | null) => {
      for (let p = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0" || p.getAttribute("aria-hidden") === "true" || p.hasAttribute("inert")) return false;
      }
      return !!el?.getClientRects().length;
    };
    const exempt = (el: Element | null) => !!el?.closest("[role=group][aria-label='Language / 语言']");
    const found = new Set<string>();
    if (han.test(document.title)) found.add(`title: ${document.title}`);
    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    if (han.test(description)) found.add(`description: ${description.slice(0, 120)}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      if (han.test(text) && visible(node.parentElement) && !exempt(node.parentElement)) found.add(`<${node.parentElement!.tagName.toLowerCase()}> ${text.slice(0, 120)}`);
    }
    for (const el of document.querySelectorAll("[aria-label],[title],[placeholder],[alt]")) {
      if (!visible(el) || exempt(el)) continue;
      for (const attr of ["aria-label", "title", "placeholder", "alt"]) {
        const value = el.getAttribute(attr);
        if (value && han.test(value)) found.add(`${attr}: ${value.slice(0, 120)}`);
      }
    }
    return [...found].slice(0, 40);
  });
}

/** Attaches a screenshot of the page as it is now to the report. */
export async function snapshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
