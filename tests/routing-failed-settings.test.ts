import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { sql, closeDb } from '@aihot/backend/db';
import {
  activeFailedFreeAccountIds, activeFailedRouteIds,
  clearFailedAutoRoutes, loadFailedAutoRouteSettings,
} from '@aihot/backend/providers/registry/selection';

after(closeDb);

test('PostgreSQL selector sees daily-account and model cooldowns, and refresh clears both', async () => {
  const suffix = randomUUID();
  const modelId = 'model-' + suffix;
  const accountId = 'account-' + suffix;
  const modelKey = 'routing.failed:' + modelId;
  const accountKey = 'routing.failed.free-account:' + accountId;
  const unrelatedKey = 'routing.other:' + suffix;
  const now = Date.now();
  const until = new Date(now + 10 * 60 * 1000).toISOString();
  const value = { until, reason: 'test fixture' };

  await sql`INSERT INTO settings(key,value,updated_by) VALUES
    (${modelKey},${sql.json(value)},'test'),
    (${accountKey},${sql.json(value)},'test'),
    (${unrelatedKey},${sql.json(value)},'test')`;

  // Use the real read path called by selectConfiguredProviderForStage,
  // not a hand-built array that skips the SQL WHERE clause.
  const rows = await loadFailedAutoRouteSettings();
  assert.ok(rows.some(row => row.key === modelKey), 'model row must be read');
  assert.ok(rows.some(row => row.key === accountKey), 'daily-account row must be read');
  assert.equal(rows.some(row => row.key === unrelatedKey), false);

  assert.equal(activeFailedRouteIds(rows,now).has(modelId), true);
  assert.equal(activeFailedRouteIds(rows,now).has('free-account:' + accountId), false);
  assert.equal(activeFailedFreeAccountIds(rows,now).has(accountId), true);
  assert.equal(activeFailedFreeAccountIds(rows,Date.parse(until) + 1).has(accountId), false);

  const removed = await clearFailedAutoRoutes();
  assert.ok(removed >= 2);
  const [surviving] = await sql<{ key:string }[]>`SELECT key FROM settings WHERE key=${unrelatedKey}`;
  assert.equal(surviving?.key, unrelatedKey);
  assert.equal((await loadFailedAutoRouteSettings()).some(row => row.key === accountKey || row.key === modelKey), false);
});
