// A pre-existing NBS feed must gain the missing clock offset on deployment without losing admin edits.
import './setup.ts';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import { stopBoss } from '@aihot/backend/jobs/queue';

const run = promisify(execFile);
after(async () => { await stopBoss(); await closeDb(); });

test('seed fills a missing NBS clock once and preserves an explicit override', async () => {
  await sql`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode)
    VALUES ('nbs-data-release', 'NBS test', 'rss',
      ${sql.json({ feedUrl: 'https://www.stats.gov.cn/sj/zxfb/rss.xml', summaryIsBody: true })}, 'T1', 'editorial')
    ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`;

  const seed = () => run(process.execPath, ['scripts/seed.ts'], { timeout: 30_000 });
  await seed();
  const [updated] = await sql<{ config: Record<string, unknown> }[]>`SELECT config FROM sources WHERE id = 'nbs-data-release'`;
  assert.equal(updated?.config.publishedAtUtcOffset, '+08:00');
  assert.equal(updated?.config.summaryIsBody, true, 'existing source settings remain unchanged');

  await sql`UPDATE sources SET config = config || '{"publishedAtUtcOffset":"+09:00"}'::jsonb WHERE id = 'nbs-data-release'`;
  await seed();
  const [custom] = await sql<{ config: Record<string, unknown> }[]>`SELECT config FROM sources WHERE id = 'nbs-data-release'`;
  assert.equal(custom?.config.publishedAtUtcOffset, '+09:00', 'an explicit admin value is never overwritten');
});
