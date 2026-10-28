import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const classifier = resolve("scripts/ci/scope-changes.mjs");
function git(cwd, ...args) {
  const p = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim();
}
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-scope-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "CI Scope Test");
  git(cwd, "config", "user.email", "ci-scope@example.invalid");
  writeFileSync(join(cwd, "README.md"), "# Demo\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "baseline");
  return { cwd, base: git(cwd, "rev-parse", "HEAD") };
}
function commit(cwd, changes) {
  for (const [file, text] of Object.entries(changes)) {
    const name = join(cwd, file);
    mkdirSync(resolve(name, ".."), { recursive: true });
    writeFileSync(name, text);
  }
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "change");
  return git(cwd, "rev-parse", "HEAD");
}
function classify(cwd, base, head, extraEnv = {}) {
  const p = spawnSync(process.execPath, [classifier], {
    cwd, encoding: "utf8",
    env: { ...process.env, SCOPE_BASE_SHA: base, SCOPE_HEAD_SHA: head, ...extraEnv },
  });
  return { status: p.status, output: p.stdout.trim() };
}

test("documentation-only changes classify docs_only=true", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, {
      "docs/guide.md": "# Guide\n",
      "specs/demo/spec.md": "# Spec\n",
      "README.md": "# Demo\nUpdated\n",
      "AGENTS.md": "notes\n",
    });
    assert.deepEqual(classify(cwd, base, head), { status: 0, output: "docs_only=true" });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("any code, workflow or CI-script change forces the full pipeline", () => {
  const { cwd, base } = fixture();
  try {
    for (const changes of [
      { "apps/web/app.ts": "export const value = 1;\n" },
      { ".github/workflows/check.yml": "name: Check\n" },
      { "scripts/ci/scope-changes.mjs": "// modified\n" },
      { "Dockerfile": "FROM node:24\n" },
      { "package.json": "{}\n" },
      { "industry/sources.json": "{}\n" },
      { "docs/guide.md": "# Guide\n", "apps/web/app.ts": "export const value = 1;\n" },
    ]) {
      const head = commit(cwd, changes);
      assert.equal(classify(cwd, base, head).output, "docs_only=false", JSON.stringify(Object.keys(changes)));
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("non-prose or outside-governance files are implementation, not docs", () => {
  const { cwd, base } = fixture();
  try {
    for (const changes of [
      { "docs/diagram.png": "png\n" },
      { "industry/prompts/writer.md": "# prompt\n" },
      { "docs/nested/data.json": "{}\n" },
    ]) {
      const head = commit(cwd, changes);
      assert.equal(classify(cwd, base, head).output, "docs_only=false", JSON.stringify(Object.keys(changes)));
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("agent and spec-kit prose is documentation", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, {
      ".agents/skills/demo/SKILL.md": "# Skill\n",
      ".specify/memory/constitution.md": "rules\n",
      "CONTRIBUTING.md": "how to contribute\n",
    });
    assert.equal(classify(cwd, base, head).output, "docs_only=true");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("empty or invalid ranges fail closed to the full pipeline", () => {
  const { cwd, base } = fixture();
  try {
    assert.equal(classify(cwd, base, base).output, "docs_only=false"); // empty diff
    assert.equal(classify(cwd, base, "not-a-sha").output, "docs_only=false");
    assert.equal(classify(cwd, "0000000000000000000000000000000000000000", base).output, "docs_only=false");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// Release supersession (specs/010): the publish job and both development
// deployments decide with scripts/ci/release-candidate.mjs whether SOURCE_SHA
// is still the release to ship, so a documentation-only push that lands first
// cannot suppress a pending code release.
const releaseCandidate = resolve("scripts/ci/release-candidate.mjs");
function codeFixture() {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-release-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "CI Scope Test");
  git(cwd, "config", "user.email", "ci-scope@example.invalid");
  writeFileSync(join(cwd, "README.md"), "# Demo\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "baseline");
  const base = git(cwd, "rev-parse", "HEAD");
  mkdirSync(join(cwd, "apps/web"), { recursive: true });
  writeFileSync(join(cwd, "apps/web/app.ts"), "export const value = 1;\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "code release A");
  return { cwd, base, a: git(cwd, "rev-parse", "HEAD") };
}
function isCurrent(cwd, source, head) {
  const p = spawnSync(process.execPath, [releaseCandidate], {
    cwd, encoding: "utf8",
    env: { ...process.env, SOURCE_SHA: source, HEAD_SHA: head },
  });
  return p.stdout.trim();
}

test("docs-only commits after code A keep A the current release (A→B)", () => {
  const { cwd, a } = codeFixture();
  try {
    const b = commit(cwd, { "docs/guide.md": "# Guide\n", "specs/demo/spec.md": "# Spec\n" });
    assert.equal(isCurrent(cwd, a, b), "current=true");
    assert.equal(isCurrent(cwd, a, a), "current=true");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("a later executable commit supersedes A (A→C and A→B→C)", () => {
  const { cwd, a } = codeFixture();
  try {
    const c = commit(cwd, { "apps/web/app.ts": "export const value = 2;\n" });
    assert.equal(isCurrent(cwd, a, c), "current=false", "A→C");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
  const lineage = codeFixture();
  try {
    const b = commit(lineage.cwd, { "docs/guide.md": "# Guide\n" });
    assert.equal(isCurrent(lineage.cwd, lineage.a, b), "current=true", "A→B stays current");
    const c2 = commit(lineage.cwd, { ".github/workflows/check.yml": "name: Check\n" });
    assert.equal(isCurrent(lineage.cwd, lineage.a, c2), "current=false", "A→B→C superseded");
  } finally { rmSync(lineage.cwd, { recursive: true, force: true }); }
});

test("release currency fails closed on invalid or diverged tips", () => {
  const { cwd, base, a } = codeFixture();
  try {
    assert.equal(isCurrent(cwd, a, "not-a-sha"), "current=false");
    assert.equal(isCurrent(cwd, "", a), "current=false");
    // A docs-only tip that no longer descends from A replaced its history.
    git(cwd, "checkout", "-q", "-b", "side", base);
    const sibling = commit(cwd, { "docs/other.md": "# Other\n" });
    assert.equal(isCurrent(cwd, a, sibling), "current=false");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("push runs use per-commit concurrency so a docs commit cannot evict queued code", () => {
  const wf = readFileSync(resolve(".github/workflows/check.yml"), "utf8");
  assert.ok(wf.includes("group: check-${{ github.event_name == 'push' && github.sha || github.event.pull_request.number || github.ref }}"));
  assert.ok(wf.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
});

test("all three release gates restore shallow ancestry on later docs tips", () => {
  const wf = readFileSync(resolve(".github/workflows/check.yml"), "utf8");
  assert.equal((wf.match(/git fetch --unshallow origin "\$current"/g) ?? []).length, 3);
});

test("shallow checkout needs complete history to recognize a docs-only successor", () => {
  const { cwd, a } = codeFixture();
  const shallow = mkdtempSync(join(tmpdir(), "eventgraph-release-shallow-"));
  try {
    const b = commit(cwd, { "docs/shallow.md": "# Docs only\\n" });
    const clone = spawnSync("git", ["clone", "-q", "--depth=1", `file://${cwd}`, shallow], { encoding: "utf8" });
    assert.equal(clone.status, 0, clone.stderr);
    git(shallow, "fetch", "-q", "--depth=1", "origin", a);
    git(shallow, "checkout", "-q", a);
    git(shallow, "fetch", "-q", "origin", b);
    assert.equal(isCurrent(shallow, a, b), "current=false", "shallow merge-base loses ancestry");
    git(shallow, "fetch", "-q", "--unshallow", "origin", b);
    assert.equal(isCurrent(shallow, a, b), "current=true", "fully fetched history preserves ancestry");
  } finally {
    rmSync(shallow, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("workflow_dispatch without a base cannot classify only HEAD^ and skip executable checks", () => {
  const workflow = readFileSync(resolve(".github/workflows/check.yml"), "utf8");
  const classifierStep = workflow.slice(workflow.indexOf("      - name: Detect documentation-only changes"), workflow.indexOf("\n  check:"));
  assert.ok(classifierStep.includes('echo "docs_only=false" >> "$GITHUB_OUTPUT"'));
  assert.ok(!classifierStep.includes("git rev-parse HEAD^"), "scoping only the last commit hides earlier code changes");
  const docsStep = workflow.slice(workflow.indexOf("      - name: Docs-only validation"), workflow.indexOf("      - name: Install"));
  assert.ok(docsStep.includes("Cannot validate documentation without a trusted base commit"));
  assert.ok(!docsStep.includes("git rev-parse HEAD^"));
});
