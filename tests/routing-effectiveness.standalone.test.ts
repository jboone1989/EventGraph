import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeRoutingRows } from '@aihot/backend/admin/runs';

test('routing effectiveness includes only measured rollups, preserves provider and workflow breakdowns', () => {
  const result = summarizeRoutingRows([
    {kind:'total',name:'all',attempts:12,successful:9,failed:2,unknown:1,pending:0,fallback_success:3,p95_ms:1900},
    {kind:'provider',name:'openrouter',attempts:8,successful:6,failed:2,unknown:0,pending:0,fallback_success:0,p95_ms:1200},
    {kind:'provider',name:'nvidia',attempts:4,successful:3,failed:0,unknown:1,pending:0,fallback_success:3,p95_ms:1900},
    {kind:'stage',name:'prefilter',attempts:7,successful:5,failed:2,unknown:0,pending:0,fallback_success:1,p95_ms:700},
    {kind:'stage',name:'group',attempts:5,successful:4,failed:0,unknown:1,pending:0,fallback_success:2,p95_ms:1900},
  ]);
  assert.equal(result.hours,24);
  assert.equal(result.attempts,12);
  assert.equal(result.successful,9);
  assert.equal(result.failed,2);
  assert.equal(result.unknown,1);
  assert.equal(result.fallbackSuccess,3);
  assert.equal(result.p95Ms,1900);
  assert.deepEqual(result.providers.map(v=>v.provider),['openrouter','nvidia']);
  assert.equal(result.stages.find(v=>v.stage==='group')?.fallbackSuccess,2);
});

test('no tagged attempts is displayed as no data, never fabricated success', () => {
  const result = summarizeRoutingRows([]);
  assert.equal(result.attempts,0);
  assert.equal(result.successful,0);
  assert.equal(result.fallbackSuccess,0);
  assert.equal(result.p95Ms,null);
  assert.deepEqual(result.providers,[]);
  assert.deepEqual(result.stages,[]);
});
