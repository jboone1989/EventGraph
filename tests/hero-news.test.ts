import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { loadHeroNews } from "@aihot/backend/publication/hero";

after(closeDb);
const NAME = `hero-${tag()}`;
const NOW = new Date("2088-04-03T12:00:00Z");
const HOUR = 3_600_000;

async function report(name: string, ageHours: number, score: number, options: { selected?: boolean; eligible?: boolean; channel?: "news" | "x"; summary?: string | null; visibleAt?: Date } = {}) {
  const id = `${NAME}-${name}`;
  const at = new Date(NOW.getTime() - ageHours * HOUR);
  const url = `https://example.org/${id}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${id}, ${NAME}, ${id}, ${url}, ${id}, ${at}, ${at})`;
  await sql`INSERT INTO publications
    (article_id, title, summary, source_id, channel, url, discovered_at, published_at, timeline_at, sort_at, score, eligible, selected, visible_after, visibility, body_mode)
    VALUES (${id}, ${id}, ${options.summary === undefined ? "Known facts with sources" : options.summary}, ${NAME}, ${options.channel ?? "news"}, ${url}, ${at}, ${at}, ${at}, ${at}, ${score},
      ${options.eligible ?? true}, ${options.selected ?? true}, ${options.visibleAt ?? at}, 'public', 'summary')`;
  return id;
}

test("hero uses the newest 6h scored selection and excludes stale or unpublished content", async () => {
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${NAME}, ${NAME}, 'rss', 'T1')`;
  await report("stale", 25, 100);
  await report("older-high", 10, 100);
  await report("recent-low", 1, 70);
  const expected = await report("recent-high", 2, 90);
  await report("not-selected", 0.5, 100, { selected: false });
  await report("not-eligible", 0.5, 100, { eligible: false });
  await report("not-news", 0.5, 100, { channel: "x" });
  await report("no-summary", 0.5, 100, { summary: null });
  await report("unreleased", 0.5, 100, { visibleAt: new Date(NOW.getTime() + HOUR) });
  const hero = await loadHeroNews(NOW);
  assert.equal(hero?.item.id, expected);
  assert.equal(hero?.storyPublicId, null);
  assert.equal(hero?.item.selected, true);
  assert.equal((await loadHeroNews(new Date(NOW.getTime() + 26 * HOUR)))?.item.id, undefined, "expired news never falls back to an old hot story");
});

