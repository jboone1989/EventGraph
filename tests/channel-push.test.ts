// The public channel targets (specs/004-editorial-ops FR-005): Telegram sends the same selection as
// the Feishu groups do — HTML text with inline buttons — under the same acknowledgement, dedupe and
// safety-valve rules; the two new default targets seed disabled, and the admin lists them like any other.
import './setup.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { config } from '@aihot/backend/config';
import { closeDb, sql } from '@aihot/backend/db';
import { ensureContentTargets, deliverContent, resendDelivery } from '@aihot/backend/notify/deliver';
import { selectedContent } from '@aihot/backend/notify/selected-content';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { upsertMaterial } from '@aihot/backend/content/materials';
import { publishArticle } from '@aihot/backend/publication/publish';
import { tag } from './setup.ts';

const T = tag();
const TARGET = `test-telegram-${T}`;
const TOKEN = `test-token-${T}`;
const CHAT = `-100test${T}`;
const TOKEN_REF = `TEST_TELEGRAM_TOKEN_${T.replace(/-/g, '_')}`;
const CHAT_REF = `TEST_TELEGRAM_CHAT_${T.replace(/-/g, '_')}`;
const TELEGRAM_URL = `https://api.telegram.org/bot${TOKEN}/sendMessage`;

interface Sent { chatId: unknown; text: string; buttons: unknown[] }
const sent: Sent[] = [];
let answer = () => Response.json({ ok: true });

before(async () => {
  process.env[TOKEN_REF] = TOKEN;
  process.env[CHAT_REF] = CHAT;
  // Exercise the live branch entirely in-process; any unexpected network request fails the test.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    assert.equal(String(input), TELEGRAM_URL, 'only the Telegram API is called');
    return answer();
  }) as typeof fetch;
  config.feishuContentPushEnabled = true;
  await sql`INSERT INTO notify_targets (key, purpose, kind, enabled, config_ref, chat_ref)
    VALUES (${TARGET}, 'content', 'telegram', true, ${TOKEN_REF}, ${CHAT_REF})`;
});
const realFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = realFetch;
  config.feishuContentPushEnabled = false;
  delete process.env[TOKEN_REF];
  delete process.env[CHAT_REF];
  await stopBoss();
  await closeDb();
});

const deliver = (telegram: { text: string; buttons: Array<{ label: string; url: string }> }) =>
  deliverContent({
    subjectKind: 'test', subjectId: `channel-${T}`, dedupeKey: `channel-${T}-${sent.length}`, contentAt: new Date(),
    card: { header: 'feishu card' }, telegram,
  });

test('a telegram target sends HTML text with buttons and records the acknowledgement', async () => {
  // The mock captures exactly what the sender posts, then answers with the scripted reply.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), TELEGRAM_URL, 'only the Telegram API is called');
    const body = JSON.parse(String(init?.body)) as { chat_id: string; text: string; reply_markup?: { inline_keyboard: unknown[][] } };
    sent.push({ chatId: body.chat_id, text: body.text, buttons: body.reply_markup?.inline_keyboard[0] ?? [] });
    return answer();
  }) as typeof fetch;

  answer = () => Response.json({ ok: true });
  const [ok] = await deliver({ text: '<b>标题</b>', buttons: [{ label: '查看', url: 'https://example.org/' }] });
  assert.equal(ok!.target, TARGET);
  assert.equal(ok!.status, 'sent');
  assert.equal(sent[0]!.chatId, CHAT);
  assert.ok(sent[0]!.text.includes('<b>标题</b>'));
  assert.equal(sent[0]!.buttons.length, 1);

  // Telegram's own verdict is the only acknowledgement; a transport reply is not.
  answer = () => Response.json({ ok: false, description: 'blocked' });
  const [failed] = await deliver({ text: 'x', buttons: [] });
  assert.equal(failed!.status, 'failed');
  answer = () => new Response('<html>proxy</html>');
  const [unknown] = await deliver({ text: 'x', buttons: [] });
  assert.equal(unknown!.status, 'unknown');
});

test('the safety valve skips a telegram target without sending', async () => {
  config.feishuContentPushEnabled = false;
  try {
    const before = sent.length;
    const [skipped] = await deliver({ text: 'x', buttons: [] });
    assert.equal(skipped!.status, 'skipped');
    assert.equal(sent.length, before, 'nothing left the process');
  } finally { config.feishuContentPushEnabled = true; }
});

test('a selected item renders Telegram text beside the Feishu card', async () => {
  const sourceId = `channel-${T}`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode) VALUES (${sourceId}, 'Channel test', 'rss', 'T1', 'editorial')`;
  const { articleId } = await upsertMaterial({ sourceId, url: `https://example.com/channel-${tag()}`, title: '频道推送 <测试>', bodyText: '正文', bodyStatus: 'ok', via: 'fetch', publishedAt: new Date() });
  await sql`UPDATE articles SET grouping_status = 'complete', selection_adds_value = true WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, selected, title_zh, summary_zh, reason_zh, score, output)
    VALUES (${articleId}, 1, 'model', 'pass', true, '频道推送 <测试>', '一段摘要。', '一条含 <符号> 的理由', 80, '{}')`;
  await publishArticle(articleId);

  const content = await selectedContent(articleId);
  assert.equal(content.status, 'ready');
  assert.ok(content.telegram.text.startsWith('<b>频道推送 &lt;测试&gt;</b>'), 'the title is bolded and escaped');
  assert.ok(content.telegram.text.includes('一条含 &lt;符号&gt; 的理由'), 'values are escaped, tags are ours');
  assert.equal(content.telegram.buttons.length, 2);
  assert.ok(content.telegram.buttons.every((b) => /^https?:\/\//.test(b.url)));
});

test('the two public targets seed disabled, and a stored telegram payload resends', async () => {
  await ensureContentTargets();
  const rows = await sql<{ key: string; enabled: boolean; kind: string; chat_ref: string | null }[]>`
    SELECT key, enabled, kind, chat_ref FROM notify_targets WHERE key IN ('feishu-content-public', 'telegram-channel-public')`;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => !r.enabled), 'public targets start disabled');
  assert.equal(rows.find((r) => r.kind === 'telegram')!.chat_ref, 'TELEGRAM_PUSH_CHAT_ID');
  await ensureContentTargets();
  const again = await sql`SELECT count(*)::int AS n FROM notify_targets WHERE key IN ('feishu-content-public', 'telegram-channel-public')`;
  assert.equal(again[0]!.n, 2, 'seeding is idempotent');

  // A stored bundle (what deliverContent writes) resends through the telegram sender.
  answer = () => Response.json({ ok: true });
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO deliveries (target_key, subject_kind, subject_id, dedupe_key, status, payload)
    VALUES (${TARGET}, 'test', 'resend', ${`resend-${T}`}, 'failed', ${sql.json({ card: { header: 'c' }, telegram: { text: '重发 <b>文本</b>', buttons: [] } })})
    RETURNING id`;
  const resent = await resendDelivery(row!.id);
  assert.equal(resent.status, 'sent');
  assert.ok(sent.at(-1)!.text.includes('重发 <b>文本</b>'));
});
