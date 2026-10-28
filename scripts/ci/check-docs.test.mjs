import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const checker = resolve("scripts/ci/check-docs.mjs");
function git(cwd, ...args) {
  const p = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim();
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-docs-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "CI Docs Test");
  git(cwd, "config", "user.email", "ci-docs@example.invalid");
  mkdirSync(join(cwd, "docs"), { recursive: true });
  writeFileSync(join(cwd, "docs", "target.md"), "# Target\n\n## Section One\n\nbody\n");
  writeFileSync(join(cwd, "docs", "index.md"), "# Index\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "baseline");
  return { cwd, base: git(cwd, "rev-parse", "HEAD") };
}
function commit(cwd, file, text) {
  const name = join(cwd, file);
  mkdirSync(resolve(name, ".."), { recursive: true });
  writeFileSync(name, text);
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "change");
  return git(cwd, "rev-parse", "HEAD");
}
function check(cwd, base, head) {
  return spawnSync(process.execPath, [checker], {
    cwd, encoding: "utf8",
    env: { ...process.env, SCOPE_BASE_SHA: base, SCOPE_HEAD_SHA: head },
  });
}

const good = [
  "# Guide",
  "",
  "See [target](target.md) and [section](target.md#section-one).",
  "Self [anchor](#guide) and image ![dot](dot.png).",
  "Reference [site][site] and bare link [docs](https://example.com/a) plus [route](/daily).",
  "",
  "[site]: target.md",
  "",
  "```text",
  "Not a link: [missing](missing.md)",
  "```",
  "",
  "## Guide",
].join("\n");

test("resolving links pass, broken links and anchors fail with file:line", () => {
  const { cwd, base } = fixture();
  try {
    writeFileSync(join(cwd, "docs", "dot.png"), "png\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "add dot");
    const fixed = git(cwd, "rev-parse", "HEAD");
    const head = commit(cwd, "docs/guide.md", good);
    assert.equal(check(cwd, fixed, head).status, 0);

    const broken = commit(cwd, "docs/broken.md", [
      "# Broken",
      "Missing [file](missing.md) and [section](target.md#missing-section).",
      "Bad self [anchor](#nowhere) and undefined [ref][nope].",
    ].join("\n"));
    const r = check(cwd, fixed, broken);
    assert.equal(r.status, 1);
    for (const expected of [
      "docs/broken.md:2 broken link missing.md",
      "docs/broken.md:2 broken anchor target.md#missing-section",
      "docs/broken.md:3 broken anchor #nowhere",
      "docs/broken.md:3 undefined reference [nope]",
    ]) assert.ok(r.stderr.includes(expected), `${expected}\nin:\n${r.stderr}`);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("only changed documentation files are validated; deletions are skipped", () => {
  const { cwd, base } = fixture();
  try {
    writeFileSync(join(cwd, "docs", "stale.md"), "# Stale\n[missing](missing.md)\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "add stale");
    const mid = git(cwd, "rev-parse", "HEAD");
    const head = commit(cwd, "docs/guide.md", "# Guide\n[target](target.md)\n");
    assert.equal(check(cwd, mid, head).status, 0); // stale.md untouched by this range
    git(cwd, "rm", "-q", "docs/stale.md");
    git(cwd, "commit", "-qm", "drop stale");
    const after = git(cwd, "rev-parse", "HEAD");
    assert.equal(check(cwd, `${after}^`, after).status, 0); // deleted file is skipped
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("repeated headings produce suffixed anchors", () => {
  const { cwd, base } = fixture();
  try {
    writeFileSync(join(cwd, "docs", "twice.md"), "# Same\n\n# Same\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "twice");
    const mid = git(cwd, "rev-parse", "HEAD");
    const head = commit(cwd, "docs/guide.md", "[first](twice.md#same) [second](twice.md#same-1) [third](twice.md#same-2)\n");
    const r = check(cwd, mid, head);
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes("broken anchor twice.md#same-2"), r.stderr);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
