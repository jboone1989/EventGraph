import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const workflow = readFileSync(
  new URL('../../.github/workflows/claude-pr-dispatch.yml', import.meta.url),
  'utf8',
);
const statusStep = workflow.split('      - name: Write the existing claude-review commit status\n')[1];
assert.ok(statusStep, 'official reviewer status step must exist');
const statusScript = statusStep.split('          script: |\n')[1];
assert.ok(statusScript, 'official reviewer status script must exist');
const script = statusScript.split('\n').map((line) => line.startsWith('            ') ? line.slice(12) : line).join('\n');

const diff = [
  'diff --git a/src/example.ts b/src/example.ts',
  '--- a/src/example.ts',
  '+++ b/src/example.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  '',
].join('\n');

async function runStatus(findings, { review = 'success', verify = 'success' } = {}) {
  const statuses = [];
  const comments = [];
  const failures = [];
  const context = {
    context: { repo: { owner: 'jboone1989', repo: 'EventGraph' } },
    process: { env: {
      CHECK_SHA: 'a'.repeat(40), PR_NUMBER: '222',
      REVIEW_OUTCOME: review, VERIFY_OUTCOME: verify,
      REVIEW_JSON: JSON.stringify({ findings }), GITHUB_WORKSPACE: '/workspace',
    } },
    require: (name) => {
      assert.equal(name, 'fs');
      return { readFileSync: () => diff };
    },
    github: { rest: {
      pulls: { get: async () => ({ data: { head: { sha: 'a'.repeat(40) }, state: 'open' } }) },
      issues: { createComment: async (args) => { comments.push(args); } },
      repos: { createCommitStatus: async (args) => { statuses.push(args); } },
    } },
    core: {
      info() {}, error() {},
      setFailed: (reason) => { failures.push(reason); },
    },
  };
  const execute = vm.runInNewContext('(async () => {\n' + script + '\n})', context);
  await execute();
  assert.equal(statuses.length, 1);
  return { statuses, comments, failures };
}

const finding = {
  path: 'src/example.ts', line: 1, severity: 'important', confidence: 95,
  reason: 'Broken behavior', evidence: 'Changed line introduces bug', fix: 'Restore check',
};

test('empty verified findings can succeed', async () => {
  const result = await runStatus([]);
  assert.equal(result.statuses[0].state, 'success');
  assert.equal(result.comments.length, 1);
  assert.equal(result.failures.length, 0);
});

test('verified changed-line blocker fails', async () => {
  const result = await runStatus([finding]);
  assert.equal(result.statuses[0].state, 'failure');
  assert.equal(result.failures.length, 1);
});

test('invalid or unchanged-line verifier finding must never turn green', async () => {
  const result = await runStatus([{ ...finding, line: 99 }]);
  assert.equal(result.statuses[0].state, 'error');
  assert.equal(result.comments.length, 0);
  assert.equal(result.failures.length, 1);
});

test('failed independent verifier must never turn green', async () => {
  const result = await runStatus([], { verify: 'failure' });
  assert.equal(result.statuses[0].state, 'error');
  assert.equal(result.failures.length, 1);
});
