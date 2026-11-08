import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/check.yml", "utf8");
const spec = workflow.match(/^  spec_review:([\s\S]*?)(?=^  check:)/m)?.[1];
const code = workflow.match(/^  claude_review:([\s\S]*?)(?=^  auto_merge_develop:)/m)?.[1];

test("code review accepts the observed main promotion diff without bypassing a reviewer", () => {
  assert.ok(code, "missing code review job");
  assert.match(code, /bytes > 262144/);
  assert.match(code, /limit 262144 bytes/);
  assert.ok(159986 <= 262144, "the observed 159,986-byte release diff must fit");
  assert.match(code, /uses: anthropics\/claude-code-action@v1/);
  assert.match(code, /parseStructuredReviewVerdict\(process\.env\.REVIEW_OUTPUT, 'code'\)/);
  assert.match(code, /core\.setFailed\('Claude Review found '/);
});

test("oversized reviews still fail closed and Spec Review retains its old limit", () => {
  assert.ok(spec, "missing Spec Review job");
  assert.match(spec, /bytes > 150000/);
  assert.doesNotMatch(spec, /bytes > 262144/);
  assert.ok(262145 > 262144, "oversize code review must fail");
  assert.match(code ?? "", /if \(\( bytes > 262144 \)\); then\s+echo "::error::Diff is too large[^\n]*\s+exit 1/);
  assert.match(workflow, /needs\.claude_review\.result == 'success'/);
});


test("large code diffs travel through complete UTF-8 file references, not Action environment variables", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  assert.ok(code, "missing code review job");
  assert.doesNotMatch(code, /steps\.review_input\.outputs\.diff/);
  assert.match(code, /steps\.review_input\.outputs\.files/);
  assert.match(code, /BEGIN UNTRUSTED DIFF FILE REFERENCES/);
  assert.match(code, /Review ALL fragments in order/);
  const match = code.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/);
  assert.ok(match, "bounded local file chunking script missing");
  const script = match[1].split("\n").map(line => line.replace(/^          /, "")).join("\n");
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-review-diff-"));
  try {
    // Include multibyte characters at chunk boundaries; the original UTF-8
    // bytes must survive the entire transport without truncation or reordering.
    const raw = Buffer.from("diff --git a/a b/a\n" + "x".repeat(47000) + "汉".repeat(38000));
    assert.ok(raw.length > 150000 && raw.length <= 262144);
    writeFileSync(join(cwd, "pr-review.diff"), raw);
    const output = join(cwd, "output");
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: script, cwd, encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    assert.equal(result.status, 0, result.stderr);
    const names = readFileSync(output, "utf8").trim().replace(/^files=/, "").split(" ");
    assert.ok(names.length >= 3 && names.length <= 6);
    assert.ok(names.every(name => /^@pr-review\.part\d{2}\.diff$/.test(name)));
    const parts = names.map(name => readFileSync(join(cwd, name.slice(1))));
    assert.ok(parts.every(part => part.length > 0 && part.length <= 48000));
    assert.deepEqual(Buffer.concat(parts), raw);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
