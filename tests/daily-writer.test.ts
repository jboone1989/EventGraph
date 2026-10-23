// The daily's writer: a grounded Chinese overview with an English stand-in, and the issue out
// regardless of what the writers fail at. The tail's rules live in reports.test.ts.
import { editionAt, Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { composeDaily } from "@aihot/backend/reports/compose";
import { feedIssues, loadReport, v1Daily } from "@aihot/backend/publication/reports";
import { REPORTS } from "@aihot/site";

const T = tag();
const SOURCE = `daily-writer-${T}`;
const TITLE = `Stub 发布 GPT-7.2 模型-${T}`;
let zh = `Stub 发布了 GPT-7.2。`;
let en = `Stub shipped GPT-7.2.`;
let fail = false;
let enFail = false;
const provider = await stub(async (_hit, request) => {
  const user = String(JSON.parse(request.body).messages.at(-1).content);
  if (user.startsWith("当日：")) {
    if (fail) return new Reply(500, { error: "down" });
    return { id: "stub", choices: [{ message: { content: JSON.stringify({ overview: zh }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  }
  if (enFail) return new Reply(500, { error: "down" });
  return { id: "stub", choices: [{ message: { content: JSON.stringify({ overview: en }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${SOURCE}, 'Daily writer', 'rss', 'T1')`;
});
beforeEach(async () => {
  zh = `Stub 发布了 GPT-7.2。`;
  en = `Stub shipped GPT-7.2.`;
  fail = false;
  enFail = false;
  await sql`DELETE FROM reports`;
  // 回执按请求哈希复用响应；不清掉，后面用例会拿到第一个用例存下的回答，绕过本用例的故障开关。
  await sql`DELETE FROM receipts`;
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
});
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });

/** One selected main entry and one below-the-selection item in the window of `date`. */
async function issue(date: string) {
  const at = editionAt("daily", date, -12 * 3600);
  const main = `writer-main-${T}`;
  const tail = `writer-tail-${T}`;
  for (const [id, score, selected] of [[main, 80, true], [tail, 55, false]] as const) {
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
      VALUES (${id}, ${SOURCE}, ${id}, ${"https://example.com/" + id}, ${id}, ${at}, ${at})`;
    await sql`INSERT INTO publications (article_id, title, summary, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score)
      VALUES (${id}, ${id === main ? TITLE : `尾条-${T}`}, ${id === main ? `摘要 ${TITLE}` : null}, ${SOURCE}, 'news', ${"https://example.com/" + id}, ${at}, ${at}, ${at}, true, ${selected}, ${at}, 'public', ${score})`;
  }
  return { main, tail };
}

type Content = { overview?: string; overviewEn?: string; tail?: Array<{ itemId: string }>; lead: { title: string }; generator: { written?: boolean; model?: string } };
const dailyRow = async (date: string) => {
  const [row] = await sql<{ content: Content }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${date}`;
  return row!.content;
};

test("the writer grounds the day's overview, pairs it with an English one, and the tail reaches the read layer", async () => {
  const date = "2098-05-10";
  const { tail } = await issue(date);
  await composeDaily(date);
  const content = await dailyRow(date);
  assert.equal(content.overview, zh);
  assert.equal(content.overviewEn, en);
  assert.deepEqual(content.tail?.map((t) => t.itemId), [tail]);
  assert.equal(content.generator.written, true);
  assert.equal(content.generator.model, "deepseek-flash");
  const receipts = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE subject IN (${"report:daily:" + date}, ${"report:daily-en:" + date})`;
  assert.equal(receipts.length, 2);
  assert.ok(receipts.every((r) => r.status === "completed"), "两次调用都经回执");

  const detail = await loadReport("daily", date);
  assert.equal(detail?.overview, zh);
  assert.equal(detail?.overviewEn, en);
  assert.equal(detail?.tail?.length, 1);
  assert.equal(detail?.tail?.[0]?.itemId, tail);
  assert.equal(detail?.tail?.[0]?.sourceUrl, `https://example.com/${tail}`);
  assert.ok((detail?.readingMinutes ?? 0) >= 1);

  const feed = await feedIssues("daily", 5);
  assert.equal(feed[0]?.overview, zh, "RSS 描述在综述可用时含综述");

  // Agent v1 契约逐字段不变（DR-05）。
  const v1 = (await v1Daily(date))!;
  assert.deepEqual(Object.keys(v1).sort(), ["report", "schemaVersion"]);
  assert.deepEqual(Object.keys(v1.report).sort(), ["attribution", "date", "flashes", "generatedAt", "lead", "links", "sections", "windowEnd", "windowStart"]);
});

test("an overview naming anything the entries do not is not used, and the English one is not called", async () => {
  const date = "2098-05-11";
  await issue(date);
  zh = "Anthropic 推出了 Claude-9，参数 500B。";
  const hits = provider.hits();
  await composeDaily(date);
  const content = await dailyRow(date);
  assert.equal(content.overview, undefined);
  assert.equal(content.overviewEn, undefined);
  assert.equal(content.generator.written, false);
  assert.equal(provider.hits(), hits + 1, "中文综述被拒后不调用英文写手");
  assert.ok(await loadReport("daily", date), "日报照常出刊");
});

test("a writer failure leaves the issue as it was", async () => {
  const date = "2098-05-12";
  await issue(date);
  fail = true;
  await composeDaily(date);
  const content = await dailyRow(date);
  assert.equal(content.overview, undefined);
  assert.equal(content.overviewEn, undefined);
  assert.equal(content.generator.written, false);
  assert.ok(await loadReport("daily", date));
});

test("a Chinese overview without an English one still publishes both layers", async () => {
  const date = "2098-05-13";
  const { tail } = await issue(date);
  enFail = true;
  await composeDaily(date);
  const content = await dailyRow(date);
  assert.equal(content.overview, zh);
  assert.equal(content.overviewEn, undefined);
  assert.deepEqual(content.tail?.map((t) => t.itemId), [tail]);
});

test("a quiet day writes no overview, no tail and calls no model", async () => {
  const date = "2098-05-14";
  const at = editionAt("daily", date, -12 * 3600);
  const low = `writer-low-${T}`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${low}, ${SOURCE}, ${low}, ${"https://example.com/" + low}, ${low}, ${at}, ${at})`;
  await sql`INSERT INTO publications (article_id, title, source_id, channel, url, discovered_at, timeline_at, sort_at, eligible, selected, visible_after, visibility, score)
    VALUES (${low}, ${`低分-${T}`}, ${SOURCE}, 'news', ${"https://example.com/" + low}, ${at}, ${at}, ${at}, true, false, ${at}, 'public', 45)`;
  const hits = provider.hits();
  await composeDaily(date);
  const content = await dailyRow(date);
  assert.equal(content.overview, undefined);
  assert.equal(content.tail, undefined);
  assert.equal(content.generator.written, undefined);
  assert.equal(content.lead.title, REPORTS.quiet.title);
  assert.equal(provider.hits(), hits, "安静的一天不花一次模型调用");
});
