// Atom link bases are inherited from feed to entry to link, starting at the fetched document URL.
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss } from "@aihot/backend/sources/rss";

const entry = (links: string, base = "") => `<entry${base}><id>urn:test:entry</id><title>Research update</title><updated>2026-10-01T00:00:00Z</updated>${links}</entry>`;
const feed = (entries: string, base = "") => `<feed xmlns="http://www.w3.org/2005/Atom"${base}><id>urn:test:feed</id><title>News</title><updated>2026-10-01T00:00:00Z</updated><author><name>Publisher</name></author>${entries}</feed>`;
const pages: Record<string, string> = {
  "/feed-base": feed(entry('<link href="article-1"/>'), ' xml:base="https://publisher.example/news/"'),
  "/entry-base": feed(entry('<link href="article-1"/>', ' xml:base="https://publisher.example/stories/"'), ' xml:base="https://feed.example/"'),
  "/link-base": feed(entry('<link xml:base="https://publisher.example/articles/" href="article-1"/>')),
  "/news/inherited.xml": feed(entry('<link xml:base="../articles/" href="article-1"/>', ' xml:base="stories/"'), ' xml:base="../publisher/"'),
  "/news/feed.xml": feed(entry('<link href="article-1"/>')),
  "/absolute": feed(entry('<link rel="self" href="entry.xml"/><link rel="alternate" href="https://publisher.example/article-1"/>'), ' xml:base="https://feed.example/"'),
  "/fallback": feed(entry('<link rel="related" href="article-1"/>')),
  "/missing": feed(entry("") + entry('<link rel="alternate"/>')),
  "/fragments": feed(entry('<link href="notes#first"/>') + entry('<link href="notes#second"/>'), ' xml:base="https://publisher.example/"'),
  "/nbs-clock.xml": '<rss version="2.0"><channel><title>NBS</title><item><title>Release</title><link>https://example.org/nbs-release</link><pubDate>2026-10-24 09:30:00</pubDate></item></channel></rss>',
  "/zoned-clock.xml": '<rss version="2.0"><channel><title>Global</title><item><title>Release</title><link>https://example.org/zoned-release</link><pubDate>Sat, 24 Oct 2026 09:30:00 GMT</pubDate></item></channel></rss>',
  "/council-a10.xml": '<rss version="2.0" xmlns:a10="http://www.w3.org/2005/Atom"><channel><title>Council</title><item><title>Decision</title><link>https://example.org/council-release</link><a10:updated>2026-10-23T17:00:00Z</a10:updated></item></channel></rss>',
  "/un-cest.xml": '<rss version="2.0"><channel><title>Geneva</title><item><title>UN release</title><link>https://example.org/un-release</link><pubDate>Wed, 07 Oct 2026 16:53:37 CEST</pubDate></item></channel></rss>',
};
const server = http.createServer((req, res) => {
  if (req.url === "/old/feed.xml") {
    res.writeHead(302, { location: "/news/feed.xml" });
    return res.end();
  }
  res.setHeader("content-type", "application/atom+xml");
  res.end(pages[req.url!] ?? "");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const root = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function read(path: string, config: Record<string, string> = {}) {
  return (await fetchRss({ config: { feedUrl: root + path, ...config }, participation_mode: "editorial" } as never)).candidates;
}

test("Atom article links honor absolute xml:base on feed, entry and link", async () => {
  for (const [path, expected] of [
    ["/feed-base", "https://publisher.example/news/article-1"],
    ["/entry-base", "https://publisher.example/stories/article-1"],
    ["/link-base", "https://publisher.example/articles/article-1"],
  ]) assert.equal((await read(path!))[0]!.url, expected);
});

test("relative xml:base values compose through feed, entry and link", async () => {
  assert.equal((await read("/news/inherited.xml"))[0]!.url, root + "/publisher/articles/article-1");
});

test("relative Atom links use the final document URL after redirects", async () => {
  assert.equal((await read("/old/feed.xml"))[0]!.url, root + "/news/article-1");
});

test("absolute alternate links and the first-link fallback keep working", async () => {
  assert.equal((await read("/absolute"))[0]!.url, "https://publisher.example/article-1");
  assert.equal((await read("/fallback"))[0]!.url, root + "/article-1");
  assert.deepEqual(await read("/missing"), []);
});

test("RSS dates without zones use the configured publisher offset, not the host timezone", async () => {
  const nbs = await read("/nbs-clock.xml", { publishedAtUtcOffset: "+08:00" });
  assert.equal(nbs[0]?.publishedAt?.toISOString(), "2026-10-24T01:30:00.000Z");
  const zoned = await read("/zoned-clock.xml", { publishedAtUtcOffset: "+08:00" });
  assert.equal(zoned[0]?.publishedAt?.toISOString(), "2026-10-24T09:30:00.000Z", "explicit GMT must win");
});

test("RSS Council a10:updated and UN Geneva named timezone keep publication timestamps", async () => {
  const council = await read("/council-a10.xml");
  assert.equal(council[0]?.publishedAt?.toISOString(), "2026-10-23T17:00:00.000Z");
  const un = await read("/un-cest.xml");
  assert.equal(un[0]?.publishedAt?.toISOString(), "2026-10-07T14:53:37.000Z");
});

test("resolved Atom article URLs keep their fragments, which sources of page sections use as identity", async () => {
  const items = await read("/fragments");
  assert.deepEqual(items.map((item) => item.url), ["https://publisher.example/notes#first", "https://publisher.example/notes#second"]);
});
