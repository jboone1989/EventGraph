// Reports: a scheduled run that starts late still writes the issue it was due for, never one whose
// window is still open; a daily whose window nothing was judged in is refused rather than published as a
// quiet day; and an older weekly that froze no summaries shows the cited articles' public summaries.
import { editionAt, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { addDays } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadReport } from "@aihot/backend/publication/reports";
import { composeDaily, dueDaily, dueMonthly, dueWeekly } from "@aihot/backend/reports/compose";
import { SITE } from "@aihot/site";

const T = tag();
const SOURCE = `test-reports-${T}`;
const WEEK = "2098-W20";
after(async () => {
  await stopBoss();
  await closeDb();
});

test("a late run writes the issue that was due, not today's", () => {
  assert.equal(dueDaily(editionAt("daily", "2026-09-29", 6)), "2026-09-29");
  assert.equal(dueDaily(editionAt("daily", "2026-09-30", -60)), "2026-09-29", "the 29th's run delayed until just before the next issue");
  assert.equal(dueWeekly(editionAt("weekly", "2026-09-28")), "2026-W39");
  assert.equal(dueWeekly(editionAt("weekly", "2026-10-05", -60)), "2026-W39", "Monday before its edition time: the next week is not due yet");
  assert.equal(dueWeekly(editionAt("weekly", "2026-10-05", 60)), "2026-W40");
  assert.equal(dueMonthly(editionAt("monthly", "2026-10-01")), "2026-09");
  assert.equal(dueMonthly(editionAt("monthly", "2026-10-01", -60)), "2026-08");
  assert.equal(dueMonthly(editionAt("monthly", "2027-01-15")), "2026-12");
});

test("a daily with nothing judged in its window is refused, not published as a quiet day", async () => {
  const date = "2098-01-15";
  await assert.rejects(composeDaily(date), /nothing judged/);
  const [row] = await sql`SELECT 1 FROM reports WHERE kind = 'daily' AND key = ${date}`;
  assert.equal(row, undefined);
});

test("a weekly that froze no summaries shows the articles' public summaries", async () => {
  await sql`DELETE FROM reports WHERE key = ${WEEK}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${SOURCE}, 'Reports', 'rss', 'T1', 'editorial', '2100-01-01') ON CONFLICT (id) DO NOTHING`;
  const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.com/${T}`, title: `R ${T}`, bodyText: "b", bodyHtml: "<p>b</p>", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${`标题-${T}`}, ${`公开摘要-${T}`}, 80, true)`;
  await publishArticle(articleId, { releasedAt: new Date() });
  const content = { kind: "weekly", title: `${SITE.name} 周报 · ${WEEK}`, overview: "o", themes: [{ heading: "h", summary: "s", storyRefs: [{ itemId: articleId, title: `标题-${T}`, sourceName: "Old aggregator", sourceId: "old-source", firstParty: false, sourceUrl: "https://example.com" }] }] };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
            VALUES ('weekly', ${WEEK}, now(), now(), ${sql.json(content as never)}, now(), 'imported')`;
  const report = await loadReport("weekly", WEEK);
  assert.equal(report?.sections[0]?.items[0]?.summary, `公开摘要-${T}`);
  assert.equal(report?.sections[0]?.items[0]?.sourceName, "Reports");
  assert.equal(report?.sections[0]?.items[0]?.firstParty, true, "a frozen citation cannot override verified current provenance");
  await sql`UPDATE sources SET tier = 'T1_5', first_party = true WHERE id = ${SOURCE}`;
  await publishArticle(articleId);
  assert.equal((await loadReport("weekly", WEEK))?.sections[0]?.items[0]?.firstParty, false);
});

test("the daily's long tail: the floor, the issue's own events and the week's memory", async () => {
  const date = "2098-04-10";
  const at = (seconds: number) => editionAt("daily", date, seconds);
  const TAIL_SOURCE = `test-tail-${T}`;
  await sql`DELETE FROM reports WHERE key IN (${date}, ${addDays(date, -1)})`;
  await sql`DELETE FROM articles WHERE source_id LIKE 'test-tail-%'`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES (${TAIL_SOURCE}, 'Tail', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const scored = async (label: string, score: number, selected: boolean, seconds = -12 * 3600) => {
    const { articleId } = await upsertMaterial({ sourceId: TAIL_SOURCE, url: `https://example.com/${T}-tail-${label}`, title: `Tail ${label}`, bodyText: "b", bodyStatus: "ok", publishedAt: at(seconds), discoveredAt: at(seconds), via: "fetch" });
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
              VALUES (${articleId}, 1, 'rule', 'pass', 'industry', ${`长尾-${label}-${T}`}, ${`长尾摘要-${label}-${T}`}, ${score}, ${selected})`;
    await publishArticle(articleId, { now: at(seconds), releasedAt: at(seconds) });
    return articleId;
  };
  const inMain = await scored("main", 80, true);
  const keptHigher = await scored("kept-65", 65, false, -11 * 3600);
  const kept = await scored("kept-60", 60, false);
  const atFloor = await scored("floor-50", 50, false);
  const belowFloor = await scored("floor-49", 49, false);
  const suppressed = await scored("memory", 55, false);
  await sql`DELETE FROM reports WHERE key IN (${date}, ${addDays(date, -1)})`;
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
            VALUES ('daily', ${addDays(date, -1)}, now(), now(), ${sql.json({ flashes: [{ itemId: suppressed, factId: null, title: `长尾-memory-${T}`, sourceName: "S", sourceUrl: "https://example.com" }] } as never)}, now(), 'imported')`;
  // 与正文同事件的未精选报道：事件键相同，不重复进长尾。
  const sharer = await scored("share-fact", 55, false);
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, title) VALUES (${"tailfact-" + T}, 'fact') RETURNING id`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${inMain}, 'report'), (${fact!.id}, ${sharer}, 'report')`;
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = ${at(-6 * 3600)} WHERE id IN (${inMain}, ${sharer})`;
  await publishArticle(inMain);
  await publishArticle(sharer);

  await composeDaily(date);
  const [row] = await sql<{ content: { tail?: Array<{ itemId: string }>; overview?: unknown } }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${date}`;
  assert.deepEqual(row!.content.tail?.map((t) => t.itemId), [keptHigher, kept, atFloor], "score ≥ 50 的未精选事件按分降序，一行一条");
  const tailIds = new Set(row!.content.tail?.map((t) => t.itemId));
  for (const gone of [inMain, sharer, belowFloor, suppressed]) assert.equal(tailIds.has(gone), false, `${gone} 不进长尾`);
  assert.equal(row!.content.overview, undefined, "本进程没有模型凭证，无综述（写手行为另测）");
});
