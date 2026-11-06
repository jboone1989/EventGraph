'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseVerdict, prepareFirstPass, readVerdict } = require('./review-verdict.cjs');

const clean = '{"summary":"Clean review","findings":[]}';
const finding = '{"summary":"Bug found","findings":[{"file":"src/a.ts","line":5,"issue":"Reproduced defect"}]}';
const execution = (result, subtype = 'success') => JSON.stringify([
  { type: 'system', subtype: 'init' }, { type: 'result', subtype, result },
]);

function withFiles(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-verdict-'));
  try {
    const input = path.join(dir, 'execution.json');
    const output = path.join(dir, 'output.txt');
    fs.writeFileSync(output, '');
    return callback(input, output);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('strict pass and blocking findings, including code fences', () => {
  assert.deepEqual(parseVerdict(clean).findings, []);
  assert.equal(parseVerdict(finding).findings[0].line, 5);
  const fence = String.fromCharCode(96).repeat(3);
  assert.equal(parseVerdict(fence + 'json\n' + clean + '\n' + fence).summary, 'Clean review');
  assert.throws(() => parseVerdict('{"summary":"incomplete","findings":['));
  assert.throws(() => parseVerdict('{"summary":"Clean review"}'), /schema/);
  assert.throws(() => parseVerdict('{"summary":"x","findings":[{"file":"a","line":0,"issue":"x"}]}'), /schema/);
});

test('a valid review needs no retry and findings stay blocking', () => withFiles((input, output) => {
  fs.writeFileSync(input, execution(finding));
  assert.equal(prepareFirstPass(input, output), false);
  assert.equal(fs.readFileSync(output, 'utf8'), 'needs_retry=false\n');
  assert.equal(readVerdict(input).findings.length, 1);
}));

test('malformed JSON requests exactly one format-only retry', () => withFiles((input, output) => {
  fs.writeFileSync(input, execution('{"summary":"found","findings":[{"file":"a",}}'));
  assert.equal(prepareFirstPass(input, output), true);
  const text = fs.readFileSync(output, 'utf8');
  assert.match(text, /^needs_retry=true\nformat_input<<REVIEW_REPAIR_/);
  assert.match(text, /"summary":"found"/);
}));

test('missing, failed and empty executions are blocked without retry', () => withFiles((input, output) => {
  assert.throws(() => prepareFirstPass(input, output), /no execution file/);
  fs.writeFileSync(input, execution(clean, 'error'));
  assert.throws(() => prepareFirstPass(input, output), /did not complete/);
  fs.writeFileSync(input, execution(''));
  assert.throws(() => prepareFirstPass(input, output), /no verdict/);
  assert.equal(fs.readFileSync(output, 'utf8'), '');
}));
