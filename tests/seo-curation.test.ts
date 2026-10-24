// Curation-gated discovery (specs/002-adsense-readiness FR-006..FR-011), specified before the change:
// - model selection alone no longer indexes a page; only the editor's mark does (curatedIndexOnly);
// - the daily queue lists selected public pages nobody decided on yet, and the batch decision
//   flips them (and audits each) in one transaction;
// - a story enters discovery only with a curated report and never as a thin single-source page;
// - the same recommendation line is not shown twice within a day.
import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sql, closeDb } from '@aihot/backend/db';
import { tag } from './setup.ts';
import { curatePending, setSeoIndexedBatch } from '@aihot/backend/admin/content';
import { publishArticle } from '@aihot/backend/publication/publish';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { loadDiscoveryEntries } from '@aihot/backend/publication/sitemap';
import { loadStoryDetail } from '@aihot/backend/publication/stories';
import { loadItemDetail } from '@aihot/backend/publication/detail';
import { overrideFields } from '@aihot/backend/admin/content';
import { isIndexable } from '@aihot/backend/publication/rules';
import { SEO } from '@aihot/site';

const T = tag();
const sourceId = `curate-${T}`;
await sql`INSERT INTO sources (id, name, kind, tier, participation_mode) VALUES (${sourceId}, 'Curation test', 'rss', 'T1', 'editorial')`;
after(async () => { await stopBoss(); await closeDb(); });

test('the rule: selection alone no longer indexes; the editor mark does', () => {
  assert.equal(SEO.curatedIndexOnly, true, 'this site curates its index');
  const base = { visibility: 'public', sourceMode: 'editorial', hasSummary: true, seoExcludedAt: null };
  assert.equal(isIndexable({ ...base, selected: true, seoIndexedAt: null }), false, 'selected without a mark stays out');
  assert.equal(isIndexable({ ...base, selected: false, seoIndexedAt: new Date() }), true, 'the editor mark indexes');
  assert.equal(isIndexable({ ...base, selected: true, seoIndexedAt: new Date(), seoExcludedAt: new Date() }), false, 'exclusion wins');
});

async function selectedArticle(reason: string) {
  const { articleId } = await upsertMaterial({ sourceId, url: `https://example.com/${tag()}`, title: '策展材料', bodyText: '正文', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
  // A passing analysis is what the publish step reads; the identity decision is complete, as grouping leaves it.
  await sql`UPDATE articles SET grouping_status = 'complete', selection_adds_value = true WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, selected, title_zh, summary_zh, reason_zh, score, output)
    VALUES (${articleId}, 1, 'model', 'pass', true, '策展材料', '一段可读的摘要。', ${reason}, 80, '{}')`;
  await publishArticle(articleId);
  return articleId;
}

test('the daily queue lists undecided selections; one batch flips and audits them', async () => {
  const a = await selectedArticle('每日一句编辑判断');
  const b = await selectedArticle('每日一句编辑判断'); // same line: FR-011 drops the later duplicate
  const rowsA = await curatePending(1);
  assert.ok(rowsA.some((r) => r.id === a || r.id === b), 'undecided selections are queued');
  const [before] = await sql`SELECT reason FROM publications WHERE article_id = ${b}`;
  assert.equal(before!.reason, null, 'an identical reason within 24h is not repeated (FR-011)');
  const { changed } = await setSeoIndexedBatch({ ids: [a, b], indexed: true, reason: '每日策展：收录' }, `curate-${T}`);
  assert.equal(changed.length, 2);
  const after = await sql`SELECT indexable FROM publications WHERE article_id IN (${a}, ${b})`;
  assert.ok(after.every((r) => r.indexable));
  const audits = await sql`SELECT 1 FROM audit_log WHERE actor = ${`curate-${T}`} AND action = 'content.seo'`;
  assert.equal(audits.length, 2, 'each flip is audited');
  const rowsAfter = await curatePending(1);
  assert.ok(!rowsAfter.some((r) => r.id === a || r.id === b), 'decided pages leave the queue');
  // Republishing (a correction passes through the same projection) keeps the mark.
  await publishArticle(a);
  const [kept] = await sql`SELECT indexable FROM publications WHERE article_id = ${a}`;
  assert.equal(kept!.indexable, true, 'republish keeps the curation mark');
});

/** A story with reports through facts, as grouping writes it; digest and per-report indexability vary. */
async function storyWith(options: { digest: string; reports: Array<{ indexable: boolean }> }) {
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, digest, latest_at, created_at, updated_at)
    VALUES (${publicId}, '事件', ${options.digest}, '2026-10-02', '2026-10-01', '2026-10-01') RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${randomUUID()}, ${story!.id}, '事实') RETURNING id`;
  for (const [i, r] of options.reports.entries()) {
    const id = `curate-story-${T}-${randomUUID().slice(0, 8)}-${i}`;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, published_at, timeline_at, discovered_at, updated_at)
      VALUES (${id}, ${sourceId}, ${id}, ${`https://example.org/${id}`}, '报道', '2026-10-01', '2026-10-01', '2026-10-01', '2026-10-01')`;
    await sql`INSERT INTO publications (article_id, source_id, title, summary, url, timeline_at, discovered_at, sort_at, selected, eligible, indexable, seo_indexed_at, visible_after, updated_at, channel, category, story_id, fact_id)
      VALUES (${id}, ${sourceId}, '报道', '摘要', ${`https://example.org/${id}`}, '2026-10-01', '2026-10-01', '2026-10-01', true, true, ${r.indexable}, ${r.indexable ? '2026-10-01' : null}, '2026-10-01', '2026-10-01', 'news', 'guide', ${story!.id}, ${fact!.id})`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${id}, 'primary')`;
  }
  return { publicId, id: story!.id };
}

test('discovery stories need a curated report and reject thin single-source pages', async () => {
  const at = new Date('2026-10-09');
  const thin = (await storyWith({ digest: '太短', reports: [{ indexable: true }] })).publicId;
  const rich = (await storyWith({ digest: '长'.repeat(120), reports: [{ indexable: true }] })).publicId;
  const multi = (await storyWith({ digest: '短', reports: [{ indexable: false }, { indexable: true }] })).publicId;
  const uncurated = (await storyWith({ digest: '长'.repeat(120), reports: [{ indexable: false }, { indexable: false }] })).publicId;
  const entries = await loadDiscoveryEntries(at);
  assert.ok(!entries.some((e) => e.loc === `/story/${thin}`), 'a single short-digest source stays out (FR-009)');
  assert.ok(entries.some((e) => e.loc === `/story/${rich}`), 'a substantial single source is indexed');
  assert.ok(entries.some((e) => e.loc === `/story/${multi}`), 'several reports with one curated report are indexed');
  assert.ok(!entries.some((e) => e.loc === `/story/${uncurated}`), 'no curated report means no index (FR-006)');
  const richEntry = entries.find((e) => e.loc === `/story/${rich}`);
  assert.ok(richEntry?.lastmod, 'story entries carry a lastmod (FR-010)');
});

test('pages show who curated them and when; thin single-source events are quick notes', async () => {
  const c = await selectedArticle('第二篇的策展判断');
  const before = await loadItemDetail(c);
  assert.equal(before.kind, 'found');
  assert.equal(before.item.curatedAt, null, 'an uncurated page shows no curation line');
  await setSeoIndexedBatch({ ids: [c], indexed: true, reason: '首页核对' }, `curate-${T}`);
  const after = await loadItemDetail(c);
  assert.ok(after.kind === 'found' && after.item.curatedAt, 'the editor mark carries through to the page');

  const short = await storyWith({ digest: '太短', reports: [{ indexable: true }] });
  const shortDetail = await loadStoryDetail(short.id);
  assert.ok(shortDetail, 'the single-report event has a page');
  assert.equal(shortDetail.note, true, 'a single short-digest event is labelled a quick note');
  assert.ok(shortDetail.curatedAt, 'its curation date is exposed');
  const long = await storyWith({ digest: '长'.repeat(120), reports: [{ indexable: true }] });
  const longDetail = await loadStoryDetail(long.id);
  assert.equal(longDetail?.note, false, 'a substantial event is not a quick note');
  const none = await storyWith({ digest: '长'.repeat(120), reports: [{ indexable: false }] });
  assert.equal((await loadStoryDetail(none.id))?.curatedAt, null, 'an uncurated event shows no curation line');
});
