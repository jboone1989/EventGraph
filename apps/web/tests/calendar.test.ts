// The policy & data calendar (specs/004-editorial-ops FR-002): the page in both editions, the
// subscription file through the web proxy, and the ICS text itself (escaping and stable UIDs).
// Sitemap coverage lives in tests/discovery-updates.test.ts (the read layer builds it).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import * as cheerio from 'cheerio';
import { startWebServer, type WebServer } from './web-server.ts';
import { CALENDAR, calendarIcs } from '@aihot/site/calendar';

let web: WebServer;
const api = createServer((req, res) => {
  const url = (req.url ?? '').split('?')[0]!;
  if (url === '/api/health') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true })); }
  if (url === '/api/site/track') { res.statusCode = 204; return res.end(); }
  if (url === '/api/site/meta') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ changelogVersion: 'x' })); }
  if (url === '/api/site/changelog') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ releases: [], latestVersion: 'x' })); }
  // The api serves the real subscription text; the web proxies api-owned paths, so this is the path a reader takes.
  if (url === '/calendar.ics') { res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); return res.end(calendarIcs()); }
  res.statusCode = 404;
  res.end('{}');
});
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

test('the calendar page lists upcoming entries in both editions', async () => {
  const zh = cheerio.load(await (await fetch(`${web.origin}/calendar`)).text());
  const zhText = zh('body').text();
  assert.ok(zhText.includes('政策与数据日历'), 'the page renders');
  assert.ok(zh('a[href="/calendar.ics"]').length > 0, 'the subscription link is there');
  const upcoming = CALENDAR.filter((e) => e.date >= '2026-10-24');
  for (const e of upcoming) assert.ok(zhText.includes(e.title), `${e.date} entry renders`);
  const en = cheerio.load(await (await fetch(`${web.origin}/en/calendar`)).text());
  const enText = en('body').text();
  assert.ok(enText.includes('Policy & data calendar'), 'the English edition renders');
  for (const e of upcoming) assert.ok(enText.includes(e.titleEn), `${e.date} English entry renders`);
});

test('the subscription answers as text/calendar with well-formed ICS', async () => {
  const res = await fetch(`${web.origin}/calendar.ics`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/calendar/);
  const body = await res.text();
  assert.ok(body.startsWith('BEGIN:VCALENDAR'), 'opens as a calendar');
  assert.ok(body.includes('END:VCALENDAR'));
  assert.ok(body.includes('DTSTART;VALUE=DATE:20261028'), 'dated entries export as whole days');
  assert.ok(!/\\;VALUE=DATE/.test(body), 'property separators are not escaped');
  const uids = [...body.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length, 'UIDs are stable and unique per entry');
});
