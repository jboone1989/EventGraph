// English copy for the /en edition: written by the worker from the Chinese copy, shown on the item while it
// matches that copy, hidden after a correction until written again, and an answer in Chinese is rejected
// with at most three attempts. Stories get an English title and digest the same way.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { writeEnglishPending } from "@aihot/backend/editorial/english";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-english-${T}`;

// The model: English copy, except for inputs marked "chinese-answer", which get a Chinese title.
const provider = await stub(async (_hit, req) => {
  const user = JSON.parse(req.body).messages[1].content as string;
  const input = JSON.parse(user) as { chineseDigest?: string; originalTitle?: string };
  const content = input.chineseDigest !== undefined
    ? { title: `Chip export rules tighten ${T}`, digest: `Regulators tightened chip export rules, according to the reporting collected for this event ${T}.` }
    : user.includes("chinese-answer")
      ? { title: "中文标题不应出现", summary: "This summary is long enough to pass the length check but the title is Chinese.", reason: "" }
      : { title: `${input.originalTitle} (English copy)`, summary: `The publisher reported a price change, and the summary explains the change in plain English for readers ${T}.`, reason: "It shows how pricing is moving." };
  return { id: "stub", choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
const app = await buildApp();

// Discovered later than anything else in the test database, so a small run takes these reports first.
async function selected(slug: string, minutesAhead: number) {
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/english-${slug}-${T}`, title: `Price update ${slug} ${T}`, language: "en",
    bodyText: `The price changed (${slug} ${T}).`, bodyHtml: `<p>The price changed (${slug} ${T}).</p>`, bodyStatus: "ok", via: "fetch",
    publishedAt: new Date(), discoveredAt: new Date(Date.now() + minutesAhead * 60_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'guide', ${`价格更新-${slug}-${T}`}, '价格有变化。', '值得关注。', 90, true)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  return id;
}

// Not picked by the selection: it still gets an English title and summary, but never a reason.
async function unselected(slug: string, minutesAhead: number) {
  const { articleId: id } = await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/english-${slug}-${T}`, title: `Price update ${slug} ${T}`, language: "en",
    bodyText: `The price changed (${slug} ${T}).`, bodyHtml: `<p>The price changed (${slug} ${T}).</p>`, bodyStatus: "ok", via: "fetch",
    publishedAt: new Date(), discoveredAt: new Date(Date.now() + minutesAhead * 60_000),
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'guide', ${`价格更新-${slug}-${T}`}, '价格有变化。', 40, false)`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  return id;
}

async function english(id: string) {
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}` });
  assert.equal(res.statusCode, 200);
  return (JSON.parse(res.body) as { english?: { title: string; summary: string; reason: string | null } | null }).english ?? null;
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'Test english', 'rss', 'T1', 'editorial', false, false, '2100-01-01')`;
});
after(async () => {
  await app.close();
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("a selected report gets English copy, shown while it matches the Chinese copy and written again after a correction", async () => {
  const id = await selected("ok", 600);
  assert.equal(await english(id), null, "nothing is shown before the worker writes it");
  await writeEnglishPending({ limit: 1 });
  const copy = await english(id);
  assert.ok(copy?.title.includes("English copy"), JSON.stringify(copy));
  assert.ok(copy?.summary.includes("plain English"));
  assert.equal(copy?.reason, "It shows how pricing is moving.");
  const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'english_copy' AND subject LIKE ${`article:${id}#%`}`;
  assert.equal(receipt?.status, "completed");

  // An editor corrects the Chinese summary: the old English copy no longer stands for it.
  await sql`UPDATE publications SET summary = '价格有更正。' WHERE article_id = ${id}`;
  assert.equal(await english(id), null, "a copy of the old wording is hidden");
  await writeEnglishPending({ limit: 1 });
  assert.ok((await english(id))?.title.includes("English copy"), "the corrected copy is written again");
});

test("an unselected report gets English copy too, without a reason", async () => {
  const id = await unselected("pool", 1600);
  await writeEnglishPending({ limit: 1 });
  const copy = await english(id);
  assert.ok(copy?.title.includes("English copy"), JSON.stringify(copy));
  assert.ok(copy?.summary.includes("plain English"));
  assert.equal(copy?.reason, null, "an unselected report shows no recommendation reason");
});

test("an answer in Chinese is rejected and retried at most three times", async () => {
  const id = await selected("chinese-answer", 1200);
  for (let i = 0; i < 4; i++) await writeEnglishPending({ limit: 1 });
  const [row] = await sql<{ outcome: string; attempts: number }[]>`SELECT outcome, attempts FROM english_copies WHERE article_id = ${id}`;
  assert.deepEqual({ ...row }, { outcome: "failed", attempts: 3 });
  assert.equal(await english(id), null);
  const calls = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE purpose = 'english_copy' AND subject LIKE ${`article:${id}#%`}`;
  assert.equal(calls[0]!.n, 3, "the fourth run does not ask again");
});

test("a story with a digest gets an English title and digest", async () => {
  // Newer than every report and story above, so the item run finds nothing new and the story run takes it.
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, digest, latest_at) VALUES (gen_random_uuid(), ${`芯片出口新规-${T}`}, '监管部门收紧了芯片出口规则。', now() + interval '1 day')
    RETURNING id`;
  await writeEnglishPending({ limit: 1 });
  const [row] = await sql<{ outcome: string; title: string; digest: string }[]>`SELECT outcome, title, digest FROM story_english WHERE story_id = ${story!.id}`;
  assert.equal(row?.outcome, "written");
  assert.ok(row?.title.startsWith("Chip export rules tighten"));
  assert.ok(row?.digest.includes("Regulators"));
});

test("an English page is indexed when a copy is written and its event has several reports", async () => {
  const first = await selected("ether-context-a", 1300);
  const second = await selected("ether-context-b", 1400);
  const alone = await selected("ether-context-c", 1500);
  await sql`UPDATE publications SET original_title = ${`Ether ETF update ${T}`} WHERE article_id IN (${first}, ${second}, ${alone})`;
  const [story] = await sql<{ id: number }[]>`
    INSERT INTO stories (public_id, title, digest, latest_at) VALUES (gen_random_uuid(), ${`以太坊 ETF-${T}`}, '以太坊 ETF 有了新进展。', now())
    RETURNING id`;
  await sql`UPDATE publications SET story_id = ${story!.id} WHERE article_id IN (${first}, ${second})`;
  for (let i = 0; i < 3; i++) await writeEnglishPending({ limit: 3 });

  const detail = await loadItemDetail(first);
  assert.ok(detail.kind === "found", "the report has a page");
  assert.equal(detail.item.englishIndexable, true, "a written copy and an event of several reports");
  const lone = await loadItemDetail(alone);
  assert.ok(lone.kind === "found");
  assert.equal(lone.item.englishIndexable, false, "a report on its own is not indexed in English");
  assert.equal((await loadItemDetail(`missing-${T}`)).kind, "not_found");
});
