// Puts a little published content into an empty test database, so the browser checks (e2e/) open real
// article, event and hot pages in CI: two sources, three selected articles with their English copies, and
// one event both sources report. Only a database whose name ends in _test or _ci; re-runnable.
//   DATABASE_URL=postgres://…/aihot_ci node scripts/e2e-seed.ts
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { computeHotRanking } from "@aihot/backend/events/hot";
import { ENGLISH_ITEM_INPUTS } from "@aihot/backend/publication/items";
import { ENGLISH_STORY_INPUTS } from "@aihot/backend/publication/story-text";
import { beijingDate } from "@aihot/contracts/time";

const name = new URL(process.env.DATABASE_URL ?? "postgres://localhost/").pathname.slice(1);
if (!/_(test|ci)$/.test(name)) throw new Error(`refusing to seed "${name}": only a database named *_test or *_ci`);

const SOURCES = [["e2e-lab", "E2E Lab Blog"], ["e2e-wire", "E2E Wire"]] as const;
for (const [id, label] of SOURCES) {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
            VALUES (${id}, ${label}, 'rss', 'T1', 'editorial', true, false, '2100-01-01') ON CONFLICT (id) DO NOTHING`;
}

const ARTICLES = [
  { source: "e2e-lab", slug: "model-release", category: "ai", original: "E2E Lab releases an open reasoning model", zh: "E2E 实验室发布开源推理模型", en: "E2E Lab releases an open reasoning model for long documents" },
  { source: "e2e-wire", slug: "model-release-report", category: "ai", original: "E2E Lab's new model tops two benchmarks", zh: "E2E 实验室新模型登顶两项评测", en: "E2E Lab's new reasoning model tops two public benchmarks" },
  { source: "e2e-lab", slug: "agent-toolkit", category: "research", original: "An agent toolkit for browser testing", zh: "面向浏览器测试的智能体工具包", en: "A new agent toolkit automates browser testing for web teams" },
];
const ids: string[] = [];
for (const [i, a] of ARTICLES.entries()) {
  // Ensure the two reports in the same story form distinct playback stages.
  // Use different publication hours instead of loop-speed-dependent milliseconds.
  const publishedAt = new Date(Date.now() - (3 - i) * 3600_000);
  const body = `${a.original}. `.repeat(30);
  const { articleId } = await upsertMaterial({
    sourceId: a.source, url: `https://example.com/e2e/${a.slug}`, title: a.original, bodyText: body, bodyHtml: `<p>${body}</p>`, bodyStatus: "ok", via: "fetch", publishedAt,
  });
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected)
            VALUES (${articleId}, 1, 'rule', 'pass', ${a.category}, ${a.zh}, ${`${a.zh}。这是端到端测试用的示例摘要，用来检查文章页、事件页和热榜是否正常显示。`}, '用于端到端测试。', 90, true)
            ON CONFLICT DO NOTHING`;
  await sql`UPDATE articles SET grouping_status = 'complete', grouped_at = now() WHERE id = ${articleId}`;
  ids.push(articleId);
}

// One event reported by both sources: two independent participants put it on the hot board.
const [existing] = await sql<{ id: number }[]>`SELECT id FROM stories WHERE title = 'E2E 实验室发布开源推理模型'`;
const storyId = existing?.id ?? (await sql<{ id: number }[]>`
  INSERT INTO stories (public_id, title, first_report_at, latest_at) VALUES (gen_random_uuid(), 'E2E 实验室发布开源推理模型', now() - interval '3 hours', now()) RETURNING id`)[0]!.id;
// The story-route panel renders fact titles verbatim as data (no English-copy pipeline for
// facts), so the fact seeds in the English edition's wording to keep the /en pages chrome-only.
const [fact] = await sql<{ id: number }[]>`
  INSERT INTO facts (public_id, story_id, title) VALUES ('e2e-fact-release', ${storyId}, 'E2E Lab releases an open reasoning model')
  ON CONFLICT (public_id) DO UPDATE SET title = EXCLUDED.title RETURNING id`;
for (const [i, id] of ids.slice(0, 2).entries()) {
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${id}, ${i ? "report" : "primary"}) ON CONFLICT DO NOTHING`;
  if (!(await sql`SELECT 1 FROM story_signals WHERE story_id = ${storyId} AND article_id = ${id}`).length) {
    await sql`INSERT INTO story_signals (story_id, article_id, participant_key, source_id, kind, observed_at)
              VALUES (${storyId}, ${id}, ${`e2e-${id}`}, ${ARTICLES[i]!.source}, 'editorial', now() - interval '1 hour')`;
  }
}
for (const id of ids) await publishArticle(id, { releasedAt: new Date(Date.now() - 60_000) });

// The English edition's copies, as the worker writes them, keyed to the Chinese copy they translate.
for (const [i, id] of ids.entries()) {
  const a = ARTICLES[i]!;
  await sql`INSERT INTO english_copies (article_id, inputs_hash, outcome, title, summary, reason)
            SELECT p.article_id, ${ENGLISH_ITEM_INPUTS}, 'written', ${a.en}, ${`${a.en}. This is a sample summary for the end-to-end checks of article, event and hot pages.`}, 'Used by the end-to-end checks.'
            FROM publications p WHERE p.article_id = ${id}
            ON CONFLICT (article_id) DO UPDATE SET inputs_hash = EXCLUDED.inputs_hash, outcome = 'written', title = EXCLUDED.title, summary = EXCLUDED.summary, reason = EXCLUDED.reason`;
}
await sql`INSERT INTO story_english (story_id, inputs_hash, outcome, title, digest)
          SELECT st.id, ${ENGLISH_STORY_INPUTS}, 'written', 'E2E Lab releases an open reasoning model', 'E2E Lab released an open reasoning model, and a second outlet reported its benchmark results.'
          FROM stories st WHERE st.id = ${storyId}
          ON CONFLICT (story_id) DO UPDATE SET inputs_hash = EXCLUDED.inputs_hash, outcome = 'written', title = EXCLUDED.title, digest = EXCLUDED.digest`;

// A published daily makes archive navigation a required, non-vacuous E2E assertion.
const day = new Date();
const issueKey = beijingDate(day.getTime());
const issueContent = {
  leadItemId: ids[0],
  highlights: [ids[0]],
  overview: "端到端测试日报。",
  overviewEn: "A sample daily report for end-to-end navigation checks.",
  sections: [{ label: "AI", items: [{ itemId: ids[0], title: ARTICLES[0]!.zh }] }],
  metrics: { totalStories: 1, sourcesCount: 1, firstPartyEvents: 1 },
};
await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
          VALUES ('daily', ${issueKey}, ${new Date(day.getTime() - 86400000)}, ${day}, ${sql.json(issueContent)}, ${day}, 'manual')
          ON CONFLICT (kind, key) DO NOTHING`;

const hot = await computeHotRanking();
console.log(`seeded ${ids.length} articles and 1 event; hot board has ${hot.entries} entr${hot.entries === 1 ? "y" : "ies"}`);
await stopBoss();
await closeDb();
