// The cross-Story evolution experiment (specs/event-evolution-experiment): curated tracks that
// re-read each story's public route at request time, links dropped when an endpoint loses its
// public evidence, and negative examples that stay reviewable. Co-occurrence never becomes a link.
import './setup.ts';
import { tag } from './setup.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import Fastify from 'fastify';
import { sql, closeDb } from '@aihot/backend/db';
import { publicCaseStudy } from '@aihot/backend/publication/case-studies';
import type { CaseStudyDef } from '@aihot/site/case-studies';
import { CASE_STUDIES } from '@aihot/site/case-studies';
import { registerSite } from '../apps/api/src/routes/site.ts';

const HOUR = 3600_000;
let implant = '';
let attribution = '';
let keystone = '';
let reportIds: string[] = [];

async function story(title: string) {
  const [row] = await sql<{ id: number; public_id: string }[]>`
    INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, ${title}) RETURNING id, public_id::text`;
  return row!;
}

before(async () => {
  const p = tag();
  const src = p + '-src';
  const now = new Date();
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${src}, 'Case Wire', 'rss', 'T1', 'editorial', '2100-01-01')`;

  const implantStory = await story('Case Event Implant');
  implant = implantStory.public_id;
  const attributionStory = await story('Case Event Attribution');
  attribution = attributionStory.public_id;
  const keystoneStory = await story('Case Event Keystone');
  keystone = keystoneStory.public_id;

  const report = async (id: string, storyId: number, at: Date, occurredAt: Date | null) => {
    const [fact] = await sql<{ id: number }[]>`
      INSERT INTO facts (public_id, story_id, title, occurred_at) VALUES (${randomUUID()}, ${storyId}, ${'Fact ' + id}, ${occurredAt}) RETURNING id`;
    reportIds.push(id);
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at, revision)
      VALUES (${id}, ${src}, ${id}, ${'https://example.org/' + id}, ${id}, ${at}, ${at}, 1)`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${id}, 'report')`;
    await sql`INSERT INTO publications (article_id, source_id, title, url, discovered_at, timeline_at, sort_at, visible_after,
        selected, eligible, visibility, channel, tags, body_mode, story_id, fact_id)
      VALUES (${id}, ${src}, ${'Report ' + id}, ${'https://example.org/' + id}, ${at}, ${at}, ${at}, ${at},
        true, true, 'public', 'news', ${['ue-case']}, 'summary', ${storyId}, ${fact!.id})`;
  };
  await report(p + '-i1', implantStory.id, new Date(+now - 3 * HOUR), null);
  await report(p + '-a1', attributionStory.id, new Date(+now - 2 * HOUR), new Date(+now - 4 * HOUR));
  await report(p + '-k1', keystoneStory.id, new Date(+now - HOUR), null);
});

after(async () => {
  await closeDb();
});

function def(): CaseStudyDef {
  return {
    id: 'case-test',
    title: '测试案例',
    titleEn: 'Test case',
    summary: '三个独立事件并排。',
    summaryEn: 'Three independent events side by side.',
    updated: '2026-10-26',
    tracks: [
      { key: 'implant', storyPublicId: implant, label: '植入', labelEn: 'Implant' },
      { key: 'attribution', storyPublicId: attribution, label: '归属', labelEn: 'Attribution' },
      { key: 'keystone', storyPublicId: keystone, label: '泄露', labelEn: 'Breach' },
    ],
    links: [
      {
        key: 'l1', from: 'attribution', to: 'implant', type: 'follow-up',
        note: '后续披露', noteEn: 'Follow-up disclosure',
        evidence: { url: 'https://example.org/attribution', source: 'Case Wire', publishedAt: '2026-10-15T15:58:08.000Z' },
        curatedAt: '2026-10-26',
      },
      {
        key: 'l2', from: 'attribution', to: 'keystone', type: 'claim',
        note: '来源主张', noteEn: 'A source claim',
        evidence: {
          url: 'https://example.org/claim', source: 'Case Wire', publishedAt: '2026-10-18T07:39:29.000Z',
          attribution: '某人主张，另一方否认', attributionEn: 'Claimed by someone; disputed',
        },
        curatedAt: '2026-10-26',
      },
    ],
    unlinked: [
      { track: 'keystone', note: '同期但无来源互引，不画线。', noteEn: 'Same window, no citing source: no link.' },
    ],
  };
}

test('tracks are re-read from each story\'s public route, links keep their annotation', { timeout: 10000 }, async () => {
  const data = await publicCaseStudy(def(), new Date());
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(data.tracks.map((t) => t.status), ['ok', 'ok', 'ok']);
  assert.deepEqual(data.tracks.map((t) => t.stations.length), [1, 1, 1]);
  // Station shape is the story route's, not a copy: the stated occurrence time survives the assembly.
  const attributionStation = data.tracks[1]!.stations[0]!;
  assert.ok(attributionStation.timeEffective && !Number.isNaN(Date.parse(attributionStation.timeEffective)));
  assert.ok(!Number.isNaN(Date.parse(attributionStation.timeRecorded)));
  assert.ok(data.tracks.every((t) => t.stations.every((s) => s.reports.every((r) => r.url.startsWith('https://example.org/')))));
  assert.equal(data.links.length, 2);
  assert.equal(data.links[1]!.evidence.attribution, '某人主张，另一方否认');
  assert.equal(data.unlinked.length, 1);
});

test('a link whose endpoint loses public evidence drops with it; unlinked notes stay reviewable', { timeout: 10000 }, async () => {
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ANY(${reportIds.slice(1)}::text[])`;
  try {
    const data = await publicCaseStudy(def(), new Date());
    assert.deepEqual(data.tracks.map((t) => t.status), ['ok', 'insufficient', 'insufficient']);
    // Both links touched an endpoint without public evidence: neither survives.
    assert.deepEqual(data.links, []);
    // The keystone note is a negative example about a track that now has no evidence: dropped too.
    assert.deepEqual(data.unlinked, []);
  } finally {
    await sql`UPDATE publications SET visibility = 'public' WHERE article_id = ANY(${reportIds.slice(1)}::text[])`;
  }
});

test('an unknown story id stays an explicit insufficient track, not an error', { timeout: 10000 }, async () => {
  const d = def();
  d.tracks[2]!.storyPublicId = randomUUID();
  const data = await publicCaseStudy(d, new Date());
  assert.equal(data.tracks[2]!.status, 'insufficient');
  assert.deepEqual(data.tracks[2]!.stations, []);
  // The link onto the unknown story is gone; the attribution→implant link survives.
  assert.deepEqual(data.links.map((l) => l.key), ['l1']);
});

test('the site API serves the curated case list and 404s unknown ids', { timeout: 10000 }, async () => {
  const app = Fastify();
  registerSite(app);
  try {
    const [firstKey] = Object.keys(CASE_STUDIES);
    assert.ok(firstKey, 'the site ships at least one curated case');
    const res = await app.inject({ method: 'GET', url: '/api/site/case-studies/' + firstKey });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { schemaVersion: number; id: string; tracks: unknown[] };
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.id, firstKey);
    assert.ok(Array.isArray(body.tracks));
    const missing = await app.inject({ method: 'GET', url: '/api/site/case-studies/no-such-case' });
    assert.equal(missing.statusCode, 404);
  } finally {
    app.server.closeAllConnections();
    await app.close();
  }
});
