// The explore gallery (EG-T16): cards of real public events, discovered by topic, each card
// locating to its own event in the explorer. Only public evidence counts: a withdrawn event
// never becomes a card, an event outside every topic is the hot list's job, and a card without
// a real picture shows no picture instead of a placeholder.
import './setup.ts';
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { publicExploreGallery } from '@aihot/backend/publication/gallery';

const HOUR = 3600_000;
let alpha = '';
let reportIds: string[] = [];

async function story(title: string) {
  const [row] = await sql<{ id: number; public_id: string }[]>`
    INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, ${title}) RETURNING id, public_id::text`;
  return row!;
}

before(async () => {
  const p = tag();
  const src = p + '-src';
  const src2 = p + '-src2';
  const now = new Date();
  const at = new Date(+now - 2 * HOUR);
  const later = new Date(+now - HOUR);
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${src}, 'Gallery Wire', 'rss', 'T1', 'editorial', '2100-01-01'),
           (${src2}, 'Gallery Ledger', 'rss', 'T2', 'editorial', '2100-01-01')`;

  const alphaStory = await story('Gallery Event Alpha');
  alpha = alphaStory.public_id;
  const withdrawnStory = await story('Gallery Event Withdrawn');
  const untopicStory = await story('Gallery Event Untopic');

  const factOf = async (storyId: number, title: string) => {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO facts (public_id, story_id, title) VALUES (${randomUUID()}, ${storyId}, ${title}) RETURNING id`;
    return row!.id;
  };
  const report = async (id: string, sourceId: string, factId: number, storyId: number, at: Date, extra: {
    originalTitle?: string | null; withdrawn?: boolean; media?: { kind: string; url: string; width: number; height: number }; tags?: string[];
  } = {}) => {
    reportIds.push(id);
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, revision, media)
      VALUES (${id}, ${sourceId}, ${id}, ${'https://example.org/' + id}, ${id}, ${at}, ${at}, 1,
        ${sql.json(extra.media ? [extra.media] : [])})`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${factId}, ${id}, 'report')`;
    await sql`INSERT INTO publications (article_id, source_id, title, original_title, url, discovered_at, timeline_at,
        sort_at, visible_after, selected, eligible, visibility, channel, tags, body_mode, story_id, fact_id)
      VALUES (${id}, ${sourceId}, ${'Report ' + id}, ${extra.originalTitle ?? null}, ${'https://example.org/' + id},
        ${at}, ${at}, ${at}, ${at}, true, true, ${extra.withdrawn ? 'withdrawn' : 'public'}, 'news',
        ${extra.tags ?? ['AI Agent']}, ${extra.media ? 'full' : 'summary'}, ${storyId}, ${factId})`;
  };

  // Two stages from two sources; the newest report carries the English original and the picture.
  const fact1 = await factOf(alphaStory.id, 'Alpha opens a lab');
  const fact2 = await factOf(alphaStory.id, 'Alpha ships a model');
  await report(p + '-a1', src, fact1, alphaStory.id, at);
  await report(p + '-a2', src2, fact1, alphaStory.id, at, { withdrawn: true });
  await report(p + '-a3', src2, fact2, alphaStory.id, later, {
    originalTitle: 'Alpha opens a new lab', tags: ['AI Agent', 'entity:anthropic'],
    media: { kind: 'image', url: 'https://example.org/pic.jpg', width: 800, height: 450 },
  });
  // Every report withdrawn: no public evidence, no card.
  const withdrawnFact = await factOf(withdrawnStory.id, 'Withdrawn claim');
  await report(p + '-w1', src, withdrawnFact, withdrawnStory.id, at, { withdrawn: true });
  // Public evidence, but outside every topic: the hot list's job, not the gallery's.
  const untopicFact = await factOf(untopicStory.id, 'Untopic event');
  await report(p + '-u1', src, untopicFact, untopicStory.id, at, { tags: [] });
});

after(async () => {
  await closeDb();
});

test('the gallery lists public topic events with real card data', { timeout: 10000 }, async () => {
  const gallery = await publicExploreGallery(new Date());
  assert.equal(gallery.cards.length, 1, 'withdrawn events and untopic events never become cards; a story in two topics is claimed once');
  const card = gallery.cards[0]!;
  assert.equal(card.story.publicId, alpha);
  assert.equal(card.topic.slug, 'ai-agents', 'the first topic in site order claims the story');
  assert.equal(card.stageCount, 2, 'two facts with public evidence are two stages; withdrawn reports do not count');
  assert.equal(card.sourceCount, 2);
  assert.equal(card.englishTitle, 'Alpha opens a new lab');
  assert.ok(card.cover, 'a real picture from a public full-text report becomes the cover');
  assert.match(card.cover!.url, /^\/api\/img-proxy\?/);
  assert.ok(!Number.isNaN(Date.parse(card.latestAt)));
  assert.equal(card.cover!.width, 800);
});

test('a story whose evidence vanishes leaves the gallery instead of going stale', { timeout: 10000 }, async () => {
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ANY(${reportIds}::text[])`;
  try {
    const gallery = await publicExploreGallery(new Date());
    assert.deepEqual(gallery.cards, [], 'with all evidence withdrawn the gallery stays empty');
  } finally {
    await sql`UPDATE publications SET visibility = 'public' WHERE article_id = ANY(${reportIds}::text[])`;
  }
});
