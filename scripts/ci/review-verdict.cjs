'use strict';

// Only a successful, validated model verdict can pass the gate.
// Malformed JSON gets one format-only retry instead of a second full PR review.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

function reviewText(executionFile) {
  if (!executionFile || !fs.existsSync(executionFile)) {
    throw new Error('Review produced no execution file; merge blocked');
  }
  const events = JSON.parse(fs.readFileSync(executionFile, 'utf8'));
  if (!Array.isArray(events)) throw new Error('Invalid review execution log');
  const final = events.filter((e) => e?.type === 'result').at(-1);
  if (!final || final.subtype !== 'success' || final.is_error) {
    throw new Error('Review did not complete successfully; merge blocked');
  }
  if (typeof final.result !== 'string' || !final.result.trim()) {
    throw new Error('Review returned no verdict; merge blocked');
  }
  return final.result.trim();
}

function parseVerdict(raw) {
  let json = raw.trim();
  const codeFence = String.fromCharCode(96).repeat(3);
  const lines = json.split(/\r?\n/);
  if ((lines[0] === codeFence || lines[0] === codeFence + 'json') &&
      lines.length >= 3 && lines.at(-1) === codeFence) {
    json = lines.slice(1, -1).join('\n').trim();
  }
  const result = JSON.parse(json);
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      typeof result.summary !== 'string' || !result.summary.trim() ||
      !Array.isArray(result.findings) ||
      !result.findings.every((f) => f && typeof f === 'object' &&
        typeof f.file === 'string' && f.file.trim() &&
        Number.isSafeInteger(f.line) && f.line > 0 &&
        typeof f.issue === 'string' && f.issue.trim())) {
    throw new Error('Invalid review verdict schema');
  }
  return result;
}

function readVerdict(executionFile) {
  return parseVerdict(reviewText(executionFile));
}

function prepareFirstPass(executionFile, outputFile) {
  const raw = reviewText(executionFile);
  try {
    parseVerdict(raw);
    fs.appendFileSync(outputFile, 'needs_retry=false
');
    return false;
  } catch (error) {
    // Never truncate findings or silently approve based on a partial verdict.
    if (Buffer.byteLength(raw, 'utf8') > 20_000) {
      throw new Error('Malformed review exceeds safe repair limit; merge blocked', { cause: error });
    }
    const delimiter = 'REVIEW_REPAIR_' + randomUUID().replace(/-/g, '');
    fs.appendFileSync(outputFile,
      'needs_retry=true
format_input<<' + delimiter + '
' + raw + '
' + delimiter + '
');
    process.stdout.write('Model verdict malformed; requesting one format-only retry.
');
    return true;
  }
}

module.exports = { reviewText, parseVerdict, readVerdict, prepareFirstPass };

if (require.main === module) {
  const [mode, executionFile, outputFile] = process.argv.slice(2);
  if (mode !== 'validate' || !outputFile) {
    process.stderr.write('Usage: node review-verdict.cjs validate EXECUTION_FILE GITHUB_OUTPUT
');
    process.exitCode = 2;
  } else {
    try { prepareFirstPass(executionFile, outputFile); }
    catch (error) {
      process.stderr.write('Review validation error: ' + error.message + '
');
      process.exitCode = 1;
    }
  }
}
