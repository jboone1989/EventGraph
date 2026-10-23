// The research module (specs/002-adsense-readiness US3): drafts stay private, publishing exposes a
// piece through the public reads and the sitemap, retiring pulls it back, and every move is audited.
import '../../../tests/setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { installModules } from '@aihot/backend/modules';
import { buildApp } from '../../../apps/api/src/app.ts';
import { getPublished, listAll, listPublished, saveArticle, setStatus, sitemapEntries } from '../backend/store.ts';
import { researchServer } from '../server.ts';

installModules([researchServer]);
const app = await buildApp();
after(async () => { await app.close(); await closeDb(); });

const piece = {
  slug: 'stablecoin-weekly-check',
  title: '稳定币周观察：链上结算量的三种口径',
  title_en: 'Stablecoin weekly: three ways to count on-chain settlement',
  author: 'Jianbo Wang',
  author_note: 'EventGraph 编辑',
  summary: '用站内事件与热度数据对齐三种稳定币结算量口径，说明差异来自哪里。',
  summary_en: 'Aligning three settlement-count methods with the site\'s own event data.',
  method: '数据与口径：站内 48 小时热度与事件计数（publication 读层）。\n来源：EventGraph 采集的公开报道。\n局限：不构成投资建议。',
  body_md: '## 结论\n\n三种口径的差异主要来自……\n\n| 口径 | 来源 |\n|---|---|\n| 转账笔数 | 链上 |',
  body_md_en: '## Conclusion\n\nThe gap comes from…',
};

test('a draft is private: no public read, no sitemap entry', async () => {
  await saveArticle(piece, 'test-editor');
  assert.equal((await listPublished()).length, 0);
  assert.equal(await getPublished(piece.slug), null);
  const entries = await sitemapEntries();
  assert.ok(entries.some((e) => e.loc === '/research'));
  assert.ok(!entries.some((e) => e.loc === `/research/${piece.slug}`));
  const res = await app.inject({ method: 'GET', url: `/api/research/articles/${piece.slug}` });
  assert.equal(res.statusCode, 404);
});

test('publishing exposes the piece everywhere, with the byline and method intact', async () => {
  await setStatus(piece.slug, 'published', '首篇上线', 'test-editor');
  const listed = await listPublished();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.author, piece.author);
  assert.ok(!(('body_md' in listed[0]!)));
  const full = await getPublished(piece.slug);
  assert.equal(full?.method.startsWith('数据与口径'), true);
  const res = await app.inject({ method: 'GET', url: `/api/research/articles/${piece.slug}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=60, s-maxage=60');
  const { article } = res.json() as { article: { title: string; title_en: string | null } };
  assert.equal(article.title, piece.title);
  assert.equal(article.title_en, piece.title_en);
  const entries = await sitemapEntries();
  const own = entries.find((e) => e.loc === `/research/${piece.slug}`);
  assert.ok(own?.lastmod, 'a published piece carries its modification time');
  const admin = await app.inject({ method: 'GET', url: '/api/admin/research' });
  assert.equal(admin.statusCode, 401, 'the editor API stays behind the session');
});

test('an edit updates the piece and its sitemap identity; retiring pulls it back', async () => {
  const before = (await sitemapEntries()).find((e) => e.loc === `/research/${piece.slug}`)!.revision;
  await saveArticle({ ...piece, title: '稳定币周观察：三种口径（修订）' }, 'test-editor');
  const after = (await sitemapEntries()).find((e) => e.loc === `/research/${piece.slug}`)!.revision;
  assert.notEqual(after, before, 'the public identity follows the edit');
  assert.equal((await listAll()).length, 1);
  await setStatus(piece.slug, 'retired', '修订后暂时下线', 'test-editor');
  assert.equal((await listPublished()).length, 0);
  assert.equal(await getPublished(piece.slug), null);
  assert.ok(!((await sitemapEntries()).some((e) => e.loc === `/research/${piece.slug}`)));
  await assert.rejects(setStatus(piece.slug, 'published', '跳过状态机', 'test-editor'), /不能从 retired 转到 published|不能从 draft/);
});

test('every manual move left an audit entry', async () => {
  const rows = await sql`SELECT action FROM audit_log WHERE subject = ${`research:${piece.slug}`} ORDER BY created_at`;
  const actions = rows.map((r) => r.action);
  assert.deepEqual(actions.sort(), ['research.save', 'research.save', 'research.status', 'research.status']);
});
