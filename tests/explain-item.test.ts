// News-explainer D-01–D-04: language, revision, licence, receipt and date regressions.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { ExplainSchema, EnglishExplainSchema, explanationCandidateFor, explanationsPending, explainOne, fullDatesIn, writeExplanationsPending } from "@aihot/backend/editorial/explain";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { publishArticle } from "@aihot/backend/publication/publish";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-explain-${T}`;

test("watchpoints reject bad shapes rather than silently writing an empty answer", () => {
  assert.deepEqual(ExplainSchema.parse({}).watchpoints, []);
  assert.equal(ExplainSchema.safeParse({ watchpoints: Array.from({ length: 4 }, (_, i) => ({ text: `Valid next step ${i}`, date: null })) }).success, false);
  assert.equal(ExplainSchema.safeParse({ watchpoints: [{ text: "bad", date: null }] }).success, false);
});

test("English explanation rejects Chinese characters in any field or watchpoint", () => {
  assert.equal(EnglishExplainSchema.safeParse({ what: "An English fact with 中文." }).success, false);
  assert.equal(EnglishExplainSchema.safeParse({ watchpoints: [{ text: "Check 官方 guidance", date: null }] }).success, false);
  assert.equal(ExplainSchema.safeParse({ what: "来源中文解释" }).success, true, "Chinese explanations stay valid");
  assert.equal(EnglishExplainSchema.safeParse({ what: "An English fact." }).success, true);
});

test("full calendar dates are recognised in the source's own forms, and only those (D-04)", () => {
  const dates = fullDatesIn(`Filed 2026-11-05, amended 2026/11/06 and 2026.11.07, effective 2026年11月8日; due November 23, 2026; comments by 5 December 2026; extended to Nov 30, 2026; effective from December 2026; this quarter; last week`);
  assert.deepEqual([...dates].sort(), ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-23", "2026-11-30", "2026-12-05"]);
});

test("a date that is not a real calendar day cannot survive the schema (D-04)", () => {
  assert.deepEqual(ExplainSchema.parse({ watchpoints: [{ text: "A valid next step to check", date: "2026-02-30" }] }).watchpoints,
    [{ text: "A valid next step to check", date: null }]);
});

// Stub variants exercise empty, invalid shape, unsupported and grounded watchpoint dates.
const seenInputs = new Map<string, { originalTitle: string | null; originalText: string | null; publishedAt: string | null }>();
const transientCalls = new Map<string, number>();
const provider = await stub(async (_hit, req) => {
  const input = JSON.parse(JSON.parse(req.body).messages[1].content as string) as { originalTitle: string | null; originalText: string | null; publishedAt: string | null };
  const key = input.originalTitle ?? "";
  seenInputs.set(key, input);
  if (key.includes("transient")) {
    const attempts = (transientCalls.get(key) ?? 0) + 1;
    transientCalls.set(key, attempts);
    if (attempts === 1) return new Reply(503, { error: "temporary upstream outage" });
  }
  const empty = { who: null, what: null, when: null, where: null, why: null, how: null, soWhat: null };
  const watchpoint = (date: string | null) => ({ watchpoints: [{ text: date === null ? "The deal is expected to close by year-end" : "The rule takes effect", date }] });
  const content = key.includes("mixed-language")
    ? { ...empty, what: "English description with 中文 text", watchpoints: [] }
    : key.includes("thin") ? { ...empty, watchpoints: [] }
    : key.includes("loose-date") ? { ...empty, watchpoints: [{ text: "Consultation closes December 23", date: "December 23" }] }
      : key.includes("full-date") || key.includes("copy-date") ? { ...empty, what: "The rule was published.", ...watchpoint("2026-12-23") }
        : key.includes("invented-date") ? { ...empty, what: "The rule was published.", ...watchpoint("2031-01-01") }
          : key.includes("invalid-date") ? { ...empty, what: "The rule was published.", ...watchpoint("2026-02-30") }
            : key.includes("malformed")
              ? { who: "x".repeat(5000), what: null, when: null, where: null, why: null, how: null, soWhat: null, watchpoints: [] }
              : {
                who: `SpaceX and an Apollo-managed entity ${T}`, what: `A binding ~$40 billion GPU financing commitment ${T}.`,
                when: "disclosed Monday", where: "a regulatory filing", why: `The CFO said it diversifies funding sources ${T}`, how: "sale and leaseback of about five years",
                soWhat: `It is the largest committed GPU financing ${T}.`, watchpoints: [{ text: "The deal is expected to close by year-end", date: null }],
              };
  return { id: "stub", choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } };
});
process.env.DEEPSEEK_BASE_URL = `${provider.url}/v1`;
process.env.DEEPSEEK_API_KEY = "test-key";
const app = await buildApp();

// Discovered later than anything else in the test database, so a small run takes these reports first.
async function report(slug: string, minutesAhead: number, opts: { selected?: boolean; post?: boolean; text?: string; language?: string; summary?: string; title?: string; publishedAt?: Date } = {}) {
  const url = `https://example.com/explain-${slug}-${T}`;
  const text = `A post (${slug} ${T}).`;
  const { articleId: id } = await upsertMaterial(opts.post
    ? { sourceId: SOURCE, url, title: text, language: "en", via: "fetch", xPost: { tweetId: `1${Date.now()}`, authorName: "EG", handle: "eg", text, media: [] }, discoveredAt: new Date(Date.now() + minutesAhead * 60_000) }
    : { sourceId: SOURCE, url, title: opts.title ?? `Financing update ${slug} ${T}`, language: opts.language ?? "en", bodyText: opts.text ?? `The commitment was disclosed (${slug} ${T}).`, bodyHtml: `<p>The commitment was disclosed.</p>`, bodyStatus: "ok", via: "fetch", publishedAt: opts.publishedAt ?? new Date(), discoveredAt: new Date(Date.now() + minutesAhead * 60_000) });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${id}, 1, 'rule', 'pass', 'guide', ${`融资更新-${slug}-${T}`}, ${opts.summary ?? "有一笔融资承诺。"}, '值得关注。', ${opts.selected === false ? 40 : 90}, ${opts.selected !== false})`;
  await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });
  return id;
}

async function explanation(id: string, variant: "zh" | "original" = "zh"): Promise<Record<string, unknown> | null> {
  const res = await app.inject({ method: "GET", url: `/api/site/items/${id}${variant === "original" ? "/original" : ""}` });
  assert.equal(res.statusCode, 200);
  return (JSON.parse(res.body) as { explanation?: Record<string, unknown> }).explanation ?? null;
}

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${SOURCE}, 'Test explain', 'rss', 'T1', 'editorial', false, false, '2100-01-01')`;
});
after(async () => {
  await app.close();
  await provider.close();
  await stopBoss();
  await closeDb();
});

test("a selected report gets an explanation in its own language, on that language's page only, and it is written again after a correction", async () => {
  const id = await report("ok", 600);
  assert.equal(await explanation(id, "original"), null, "nothing is shown before the worker writes it");
  await writeExplanationsPending({ limit: 1 });
  const shown = await explanation(id, "original");
  assert.ok(String(shown?.what).includes("40 billion"), JSON.stringify(shown));
  assert.equal(shown?.who, `SpaceX and an Apollo-managed entity ${T}`);
  assert.equal(await explanation(id), null, "an English report's explanation never appears on the Chinese page (D-01)");
  const chineseOriginal = await app.inject({ method: "GET", url: `/api/site/items/${id}/original?edition=zh` });
  assert.equal(chineseOriginal.statusCode, 200);
  assert.equal(JSON.parse(chineseOriginal.body).explanation, null, "the Chinese original-text tab must not show an English explanation");
  const input = [...seenInputs.values()].find((v) => v.originalTitle?.includes(`Financing update ok ${T}`));
  assert.equal(input?.originalText, null, "summary-only source body must not be sent to the model");
  assert.deepEqual(shown?.watchpoints, [{ text: "The deal is expected to close by year-end", date: null }]);
  const [row] = await sql<{ language: string }[]>`SELECT language FROM item_explanations WHERE article_id = ${id}`;
  assert.equal(row?.language, "en");
  const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'explain_item' AND subject LIKE ${`article:${id}#%`}`;
  assert.equal(receipt?.status, "completed");
  const [shape] = await sql<{ type: string }[]>`SELECT jsonb_typeof(content) AS type FROM item_explanations WHERE article_id = ${id}`;
  assert.equal(shape?.type, "object", "the explanation must be a jsonb object, never a JSON string scalar");

  // An editor corrects the summary: the old explanation no longer stands for it.
  await sql`UPDATE publications SET summary = '融资承诺有更正。' WHERE article_id = ${id}`;
  assert.equal(await explanation(id, "original"), null, "an explanation of the old wording is hidden");
  await writeExplanationsPending({ limit: 1 });
  assert.ok(String((await explanation(id, "original"))?.what).includes("40 billion"), "the corrected explanation is written again");
});

test("a previously written explanation is hidden when public eligibility is revoked", async () => {
  const id = await report("revoked", 605);
  await explainOne((await explanationCandidateFor(id))!);
  assert.ok((await explanation(id, "original"))?.what, "initially selected public report is explained");

  // A stale, hash-matching row must not bypass the worker's current eligibility rules.
  await sql`UPDATE publications SET selected = false WHERE article_id = ${id}`;
  assert.equal(await explanation(id, "original"), null, "deselected reports do not display old explanations");
  await sql`UPDATE publications SET selected = true, eligible = false WHERE article_id = ${id}`;
  assert.equal(await explanation(id, "original"), null, "ineligible reports do not display old explanations");
  await sql`UPDATE publications SET eligible = true, visible_after = now() + interval '1 day' WHERE article_id = ${id}`;
  assert.equal(await explanation(id, "original"), null, "future-scheduled reports do not display old explanations");
  await sql`UPDATE publications SET visible_after = now() - interval '1 day' WHERE article_id = ${id}`;
  assert.ok((await explanation(id, "original"))?.what, "restoring eligibility reveals the still-current explanation");
});

test("a Chinese-language report is explained in Chinese, on the Chinese page only (D-01)", async () => {
  const id = await report("zh-ok", 610, { language: "zh" });
  await explainOne((await explanationCandidateFor(id))!);
  assert.ok(String((await explanation(id))?.what).includes("40 billion"), "the Chinese report's explanation is on the Chinese page");
  assert.equal(await explanation(id, "original"), null, "and never on the English page");
  const chineseOriginal = await app.inject({ method: "GET", url: `/api/site/items/${id}/original?edition=zh` });
  assert.equal(JSON.parse(chineseOriginal.body).explanation?.what?.includes("40 billion"), true, "the Chinese original-text tab retains a Chinese explanation");
  const [row] = await sql<{ language: string }[]>`SELECT language FROM item_explanations WHERE article_id = ${id}`;
  assert.equal(row?.language, "zh");
});

test("a Chinese report's model input carries the +08:00 publication date; English keeps the UTC instant", async () => {
  const zhId = await report("zh-date", 616, { language: "zh", publishedAt: new Date("2026-10-27T16:00:00.000Z") });
  await explainOne((await explanationCandidateFor(zhId))!);
  const zhInput = [...seenInputs.values()].find((v) => v.originalTitle?.includes(`zh-date ${T}`));
  assert.equal(zhInput?.publishedAt, "2026-10-28T00:00:00+08:00", "the zh input must show the Beijing-local date, not the UTC calendar day");
  const enId = await report("en-date", 617, { publishedAt: new Date("2026-10-27T16:00:00.000Z") });
  await explainOne((await explanationCandidateFor(enId))!);
  const enInput = [...seenInputs.values()].find((v) => v.originalTitle?.includes(`en-date ${T}`));
  assert.equal(enInput?.publishedAt, "2026-10-27T16:00:00.000Z");
});

test("English mixed-language model output fails visibly and consumes shape retries only", async () => {
  const id = await report("mixed-language", 615);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await explainOne((await explanationCandidateFor(id))!);
    assert.equal(result.outcome, "failed");
  }
  const [row] = await sql<{ outcome: string; attempts: number; content: unknown }[]>`
    SELECT outcome, attempts, content FROM item_explanations WHERE article_id = ${id}`;
  assert.equal(row?.outcome, "failed");
  assert.equal(row?.attempts, 3);
  assert.equal(row?.content, null);
  assert.equal(await explanation(id, "original"), null);
  assert.ok(!(await explanationsPending({ limit: 500 })).some((r) => r.article_id === id),
    "a fourth identical malformed answer must not be paid for");
});

test("a report older than any freshness window is still eligible; nothing expires (D-02)", async () => {
  const id = await report("ancient", -60 * 24 * 45);
  const pending = await explanationsPending({ limit: 500 });
  assert.ok(pending.some((r) => r.article_id === id), "a 45-day-old report is still eligible to be explained");
  const calls = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE purpose = 'explain_item' AND subject LIKE ${`article:${id}#%`}`;
  assert.equal(calls[0]!.n, 0, "eligibility is not a call: old reports are eligible, runs stay bounded");
});

test("old explained reports are not rehashed until their publication or material changes", async () => {
  const id = await report("historical-correction", -60 * 24 * 180);
  await explainOne((await explanationCandidateFor(id))!);
  assert.ok((await explanation(id, "original"))?.what);
  await sql`UPDATE publications SET updated_at = now() - interval '180 days' WHERE article_id = ${id}`;
  await sql`UPDATE articles SET updated_at = now() - interval '180 days' WHERE id = ${id}`;
  await sql`UPDATE item_explanations SET updated_at = now() - interval '180 days' WHERE article_id = ${id}`;
  await sql`UPDATE sources SET updated_at = now() - interval '180 days' WHERE id = ${SOURCE}`;
  // The public reader must still hide stale text. Only a real recent edit to a historical report
  // warrants rehashing its full body and correlated sibling titles during a 15-minute run.
  await sql`UPDATE publications SET summary = 'Old report was corrected.' WHERE article_id = ${id}`;
  assert.equal(await explanation(id, "original"), null);
  assert.ok(!(await explanationsPending({ limit: 500 })).some((r) => r.article_id === id));
  await sql`UPDATE publications SET updated_at = now() WHERE article_id = ${id}`;
  assert.ok((await explanationsPending({ limit: 500 })).some((r) => r.article_id === id),
    "a recent correction re-enables stale-hash comparison even on historical reports");
});

test("a report older than 90 days is re-evaluated when a new story sibling changes its context", async () => {
  const old = await report("old-story-sibling", -60 * 24 * 180);
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title)
    VALUES (${crypto.randomUUID()}, ${`OLD-STORY-${T}`}) RETURNING id`;
  await sql`UPDATE publications SET story_id = ${story!.id} WHERE article_id = ${old}`;
  await explainOne((await explanationCandidateFor(old))!);
  assert.ok((await explanation(old, "original"))?.what);
  await sql`UPDATE publications SET updated_at = now() - interval '180 days' WHERE article_id = ${old}`;
  await sql`UPDATE articles SET updated_at = now() - interval '180 days' WHERE id = ${old}`;
  await sql`UPDATE item_explanations SET updated_at = now() - interval '180 days' WHERE article_id = ${old}`;
  await sql`UPDATE stories SET updated_at = now() - interval '180 days' WHERE id = ${story!.id}`;
  await sql`UPDATE sources SET updated_at = now() - interval '180 days' WHERE id = ${SOURCE}`;

  const sibling = await report("new-story-sibling", 820);
  await sql`UPDATE publications SET story_id = ${story!.id} WHERE article_id = ${sibling}`;
  await sql`UPDATE sources SET updated_at = now() - interval '180 days' WHERE id = ${SOURCE}`;
  // The actual grouping writer bumps stories.updated_at when a report joins.
  await sql`UPDATE stories SET updated_at = now() WHERE id = ${story!.id}`;
  assert.equal(await explanation(old, "original"), null);
  const queue = await explanationsPending({ limit: 500 });
  const refreshed = queue.find((r) => r.article_id === old);
  assert.ok(refreshed, "old report becomes pending when a new sibling changes the input hash");
  assert.ok(refreshed.other_reports?.some((x) => x.includes("new-story-sibling")), "new sibling is part of the recomputed input");
  // Leave no newer unprocessed fixture ahead of the D-03 pending-queue test.
  assert.equal((await explainOne((await explanationCandidateFor(sibling))!)).outcome, "written");
});

test("a source rename requeues an old explanation without touching its publication", async () => {
  const id = await report("old-source-rename", -60 * 24 * 180);
  await explainOne((await explanationCandidateFor(id))!);
  await sql`UPDATE publications SET updated_at = now() - interval '180 days' WHERE article_id = ${id}`;
  await sql`UPDATE articles SET updated_at = now() - interval '180 days' WHERE id = ${id}`;
  await sql`UPDATE item_explanations SET updated_at = now() - interval '180 days' WHERE article_id = ${id}`;
  await sql`UPDATE sources SET updated_at = now() - interval '180 days' WHERE id = ${SOURCE}`;
  try {
    // Polling changes updated_at routinely, but does not change the model's source name.
    await sql`UPDATE sources SET updated_at = now() WHERE id = ${SOURCE}`;
    assert.ok(!(await explanationsPending({ limit: 500 })).some((r) => r.article_id === id),
      "a routine source poll must not rehash an old explanation");
    await sql`UPDATE sources SET name = ${`Renamed source ${T}`}, updated_at = now() WHERE id = ${SOURCE}`;
    assert.equal(await explanation(id, "original"), null, "old source attribution cannot remain visible");
    const queue = await explanationsPending({ limit: 500 });
    assert.ok(queue.some((r) => r.article_id === id), "changed source attribution triggers re-evaluation");
  } finally {
    await sql`UPDATE sources SET name = 'Test explain', updated_at = now() - interval '180 days' WHERE id = ${SOURCE}`;
  }
});

test("a source that says little is recorded insufficient_evidence: shown as nothing, receipted, not re-asked until its inputs change (D-03)", async () => {
  const id = await report("thin", 700, { text: `Very thin (thin ${T}).` });
  await writeExplanationsPending({ limit: 1 });
  assert.equal(await explanation(id, "original"), null, "nothing supportable means nothing shown");
  const [row] = await sql<{ outcome: string; content: unknown; error: string | null; receipt_id: number }[]>`SELECT outcome, content, error, receipt_id FROM item_explanations WHERE article_id = ${id}`;
  assert.equal(row?.outcome, "insufficient_evidence", "the reason is explicit, with its input revision");
  assert.equal(row?.content, null);
  assert.ok(row?.error);
  const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE id = ${row!.receipt_id}`;
  assert.equal(receipt?.status, "completed", "the model call that found nothing is still receipted");
  await writeExplanationsPending({ limit: 1 });
  const calls = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE purpose = 'explain_item' AND subject LIKE ${`article:${id}#%`}`;
  assert.equal(calls[0]!.n, 1, "the next run does not ask again for the same inputs");

  // The source is updated and now says something: the report is judged again.
  await sql`UPDATE publications SET summary = '监管文件披露了可核实的细节。' WHERE article_id = ${id}`;
  const again = await explanationsPending({ limit: 500 });
  assert.ok(again.some((r) => r.article_id === id), "changed inputs make the report eligible again");
  await writeExplanationsPending({ limit: 1 });
  const recalled = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE purpose = 'explain_item' AND subject LIKE ${`article:${id}#%`}`;
  assert.equal(recalled[0]!.n, 2, "the changed inputs are explained again");
});

test("a watchpoint date survives only when the original states the full calendar date (D-04)", async () => {
  const full = await report("full-date", 710, { title: `Financing update: rule effective December 23, 2026 (full-date ${T})` });
  const copyOnly = await report("copy-date", 713, { summary: `Regulatory filing: the rule takes effect on December 23, 2026 (${T}).` });
  const invented = await report("invented-date", 711, { summary: `No calendar dates in this report (${T}).` });
  const invalid = await report("invalid-date", 712, { summary: `No calendar dates in this report either (${T}).` });
  for (const id of [full, copyOnly, invented, invalid]) await explainOne((await explanationCandidateFor(id))!);
  assert.deepEqual((await explanation(full, "original"))?.watchpoints, [{ text: "The rule takes effect", date: "2026-12-23" }], "a full date the original states is kept");
  assert.deepEqual((await explanation(copyOnly, "original"))?.watchpoints, [{ text: "The rule takes effect", date: null }], "a full date that exists only in the site's own derived copy is dropped");
  assert.deepEqual((await explanation(invented, "original"))?.watchpoints, [{ text: "The rule takes effect", date: null }], "a date the source does not state is dropped");
  assert.deepEqual((await explanation(invalid, "original"))?.watchpoints, [{ text: "The rule takes effect", date: null }], "an impossible calendar date is dropped");
});

test("a watchpoint date that is not a calendar date is kept as undated, never rewritten into one", async () => {
  const id = await report("loose-date", 800, { text: `Loose date (loose-date ${T}).` });
  await writeExplanationsPending({ limit: 1 });
  const shown = await explanation(id, "original");
  assert.deepEqual(shown?.watchpoints, [{ text: "Consultation closes December 23", date: null }], "the wording keeps the source's own date expression");
});

test("a new sibling report changes the inputs: the old explanation is hidden and written again", async () => {
  const a = await report("sib-a", 810);
  const b = await report("sib-b", 811);
  await explainOne((await explanationCandidateFor(a))!);
  assert.ok((await explanation(a, "original"))?.what, "explained while it stands alone");

  // Grouping puts both reports on one event: a's input now carries b's title.
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${crypto.randomUUID()}, ${`STORY-${T}`}) RETURNING id`;
  await sql`UPDATE publications SET story_id = ${story!.id} WHERE article_id IN (${a}, ${b})`;
  assert.equal(await explanation(a, "original"), null, "an explanation that predates the event grouping no longer matches its inputs");
  await explainOne((await explanationCandidateFor(a))!);
  assert.ok((await explanation(a, "original"))?.what, "the explanation is written again for the new inputs");
  const second = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE purpose = 'explain_item' AND subject LIKE ${`article:${a}#%`}`;
  assert.equal(second[0]!.n, 2);
  const grouped = await explanationCandidateFor(a);
  assert.ok((grouped?.other_reports ?? []).some((t) => t.includes(`sib-b`)), "the event's other report titles reach the model input");
});

test("a malformed answer is rejected and retried at most three times", async () => {
  const id = await report("malformed", 850, { text: `Malformed (malformed ${T}).` });
  for (let i = 0; i < 4; i++) await writeExplanationsPending({ limit: 1 });
  const [row] = await sql<{ outcome: string; attempts: number }[]>`SELECT outcome, attempts FROM item_explanations WHERE article_id = ${id}`;
  assert.deepEqual({ ...row }, { outcome: "failed", attempts: 3 });
  assert.equal(await explanation(id, "original"), null);
});

test("a provider 503 stops the run without consuming shape retries, then recovers", async () => {
  const id = await report("transient", 950);
  const first = await writeExplanationsPending({ limit: 1 });
  assert.equal(first.stopped, true);
  const [row] = await sql<{ attempts: number }[]>`SELECT attempts FROM item_explanations WHERE article_id = ${id}`;
  assert.equal(row?.attempts ?? 0, 0, "transport errors must not exhaust the article");
  await writeExplanationsPending({ limit: 1 });
  assert.ok((await explanation(id, "original"))?.what, "a later healthy call should recover");
});

test("a sticky unknown receipt skips only its report, not the rest of the explanation queue", async () => {
  const stuck = await report("sticky-unknown", 970);
  const healthy = await report("after-sticky", 965);
  const first = await explainOne((await explanationCandidateFor(stuck))!);
  assert.equal(first.outcome, "written");
  const [receipt] = await sql<{ id: number }[]>`SELECT receipt_id AS id FROM item_explanations WHERE article_id = ${stuck}`;
  await sql`UPDATE receipts SET status = 'unknown' WHERE id = ${receipt!.id}`;
  await sql`DELETE FROM item_explanations WHERE article_id = ${stuck}`;
  try {
    const result = await writeExplanationsPending({ limit: 2 });
    assert.equal(result.stopped, false, "one ambiguous receipt must not halt the run");
    assert.ok((await explanation(healthy, "original"))?.what, "the next pending report still gets processed");
    const [state] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE id = ${receipt!.id}`;
    assert.equal(state?.status, "unknown", "never auto-release or re-send an ambiguous paid receipt");
    const [row] = await sql`SELECT attempts FROM item_explanations WHERE article_id = ${stuck}`;
    assert.equal(row, undefined, "skipping a sticky receipt must not consume malformed-answer retries");
  } finally {
    await sql`UPDATE receipts SET status = 'received' WHERE id = ${receipt!.id}`;
    await explainOne((await explanationCandidateFor(stuck))!);
  }
});

test("only released, publicly listed siblings enter another report's model context", async () => {
  const main = await report("sibling-visible", 820);
  const hidden = await report("sibling-unreleased", 821);
  const unselected = await report("sibling-unselected", 822, { selected: false });
  const post = await report("sibling-post", 823, { post: true });
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title)
    VALUES (${crypto.randomUUID()}, ${`SIBLING-VISIBILITY-${T}`}) RETURNING id`;
  await sql`UPDATE publications SET story_id = ${story!.id} WHERE article_id IN (${main}, ${hidden}, ${unselected}, ${post})`;
  await sql`UPDATE publications SET visible_after = now() + interval '2 days' WHERE article_id = ${hidden}`;

  const before = await explanationCandidateFor(main);
  assert.deepEqual(before?.other_reports ?? [], [], "future-scheduled siblings must not leak via prompt or input hash");

  await sql`UPDATE publications SET visible_after = now() - interval '1 day' WHERE article_id = ${hidden}`;
  const after = await explanationCandidateFor(main);
  // Publication titles are the analysed Chinese copy (slug-tag), not the original English material (slug tag).
  assert.ok(after?.other_reports?.some((title) => title.includes(`sibling-unreleased-${T}`)),
    "the now-released and selected sibling becomes context only after its visibility time");
  assert.ok(!after?.other_reports?.some((title) => title.includes(`sibling-unselected-${T}`)),
    "a non-public unselected sibling does not enter another report's context");
  assert.ok(!after?.other_reports?.some((title) => title.includes(`sibling-post-${T}`)),
    "a post never enters another news report's model context");
});

test("an unselected report and a post are never explained", async () => {
  const unselected = await report("pool", 900, { selected: false });
  const post = await report("post", 1000, { post: true });
  const unreleased = await report("unreleased", 1010);
  await sql`UPDATE publications SET visible_after = now() + interval '1 day' WHERE article_id = ${unreleased}`;
  assert.equal(await explanationCandidateFor(unselected), null, "explicit IDs must not bypass selection");
  assert.equal(await explanationCandidateFor(post), null, "explicit IDs must not explain posts");
  assert.equal(await explanationCandidateFor(unreleased), null, "explicit IDs must not reveal unreleased reports");
  await writeExplanationsPending({ limit: 10 });
  assert.equal(await explanation(unselected, "original"), null);
  assert.equal(await explanation(post, "original"), null);
  const calls = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM receipts WHERE purpose = 'explain_item'
    AND (subject LIKE ${`article:${unselected}#%`} OR subject LIKE ${`article:${post}#%`})`;
  assert.equal(calls[0]!.n, 0, "no model call is spent on either");

  // A summary-only report keeps its bare page, without an explanation.
  const [limited] = await sql`UPDATE publications SET visibility = 'summary-only' WHERE article_id = ${unselected} RETURNING article_id`;
  assert.ok(limited);
  const detail = await loadItemDetail(unselected);
  assert.ok(detail.kind === "found");
  assert.equal(detail.item.explanation, null);
  assert.equal(detail.item.readingMode, "summary-only");
});
