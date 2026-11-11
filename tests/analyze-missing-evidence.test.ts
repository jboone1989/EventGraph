// A title cannot supply the missing article: no scoring, writing or public eligibility until
// material arrives. Feed excerpts, quoted text and displayable original posts keep their path.
import { pointModels, stub, tag } from "./setup.ts";
import { analysisStep, combinedAnswer } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb } from "@aihot/backend/db";
import { normalizeAnalysis, runAnalysis, type AnalyzeInputArticle } from "@aihot/backend/editorial/analyze";
import { isPoolEligible } from "@aihot/backend/publication/rules";

let label = "PASS";
const steps: string[] = [];
const provider = await stub((_hit, request) => {
  const step = analysisStep(request.body);
  steps.push(step);
  const output = combinedAnswer({ label });
  return { choices: [{ message: { content: JSON.stringify(output) } }] };
});
pointModels(provider.url);
after(async () => { await provider.close(); await closeDb(); });

const article = (changes: Partial<AnalyzeInputArticle> = {}): AnalyzeInputArticle => ({
  id: `missing-${tag()}`, revision: 1, title: "模型发布", url: "https://example.org/news", author: null,
  publishedAt: new Date("2026-10-02T00:00:00Z"), bodyStatus: "unconfirmed", bodyText: null,
  excerpt: null, media: [], xPost: null,
  source: { name: "Fixture", kind: "rss", tier: "T1", firstParty: true }, ...changes,
});
const runFresh = (input: AnalyzeInputArticle) => runAnalysis(input, { attemptTag: tag() });

test("title-only articles wait for evidence regardless of the prefilter label", async (t) => {
  for (const candidate of ["PASS", "UNKNOWN", "BLOCK"]) await t.test(candidate, async () => {
    label = candidate;
    steps.length = 0;
    const run = await runFresh(article({ bodyText: " \n", excerpt: " " }));
    const out = normalizeAnalysis(run);
    assert.deepEqual(steps, ["combined"]);
    assert.equal(out.relevance, "unknown");
    assert.equal(out.score, null);
    assert.equal(out.selected, false);
    assert.equal(out.titleZh, "");
    assert.equal(out.summaryZh, "");
    assert.equal(isPoolEligible({ participationMode: "editorial", relevance: out.relevance, title: out.titleZh, summary: out.summaryZh }), false);
  });
});

test("real body, feed excerpt and quoted text receive one combined judgement", async (t) => {
  label = "PASS";
  for (const changes of [{ bodyText: "来源确认模型发布。" }, { excerpt: "来源确认模型发布。" },
    { xPost: { text: "支持", quoted: { text: "来源确认模型发布。" } } }]) await t.test(JSON.stringify(changes), async () => {
    steps.length = 0;
    const out = normalizeAnalysis(await runFresh(article(changes)));
    assert.deepEqual(steps, ["combined"], "only one model request");
    assert.ok(steps.includes("combined"));
    assert.equal(out.relevance, "pass");
    assert.equal(out.selected, true);
  });
});

test("an empty or link-only original post keeps scoring and verbatim publication", async (t) => {
  label = "PASS";
  for (const text of ["", "https://example.org/launch"]) await t.test(text || "media-only", async () => {
    steps.length = 0;
    const run = await runFresh(article({ xPost: { text, media: [] } }));
    const out = normalizeAnalysis(run);
    assert.deepEqual(steps, ["combined"], "only one model request");
    assert.equal(steps.length, 1);
    assert.equal(run.writing?.kind, "verbatim");
    assert.equal(out.relevance, "pass");
    assert.equal(out.selected, true);
    assert.equal(isPoolEligible({ participationMode: "editorial", relevance: out.relevance, title: out.titleZh, summary: out.summaryZh, originalPost: true }), true);
  });
});

test("a later material revision can be scored after the title-only revision waits", async () => {
  label = "PASS";
  const input = article();
  assert.equal(normalizeAnalysis(await runFresh(input)).relevance, "unknown");
  steps.length = 0;
  const out = normalizeAnalysis(await runFresh({ ...input, revision: 2, bodyStatus: "ok", bodyText: "来源确认模型发布。" }));
  assert.deepEqual(steps, ["combined"], "only one model request");
  assert.equal(out.relevance, "pass");
  assert.equal(out.selected, true);
});
