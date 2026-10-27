import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const checker = resolve("scripts/ci/check-spec.mjs");
function git(cwd, ...args) {
  const p = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim();
}
function fixture(withSpec = true) {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-spec-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "CI Spec Test");
  git(cwd, "config", "user.email", "ci-spec@example.invalid");
  mkdirSync(join(cwd, "apps"), { recursive: true });
  writeFileSync(join(cwd, "apps", "app.ts"), "export const value = 1;\n");
  if (withSpec) {
    mkdirSync(join(cwd, "specs", "demo"), { recursive: true });
    writeFileSync(join(cwd, "specs", "demo", "spec.md"), "# Demo\nRequires value = 2.\n");
  }
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "baseline");
  const base = git(cwd, "rev-parse", "HEAD");
  return { cwd, base };
}
function commit(cwd, file, text) {
  const name = join(cwd, file);
  mkdirSync(resolve(name, ".."), { recursive: true });
  writeFileSync(name, text);
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "change");
  return git(cwd, "rev-parse", "HEAD");
}
function check(cwd, base, head, body = "", extraEnv = {}) {
  return spawnSync(process.execPath, [checker], {
    cwd, encoding: "utf8",
    env: { ...process.env, SPEC_BASE_SHA: base, SPEC_HEAD_SHA: head, SPEC_PR_BODY: body, ...extraEnv },
  });
}
test("prior immutable spec permits an implementation change", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, "apps/app.ts", "export const value = 2;\n");
    const r = check(cwd, base, head, `Spec: specs/demo/spec.md@${base}`);
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("implementation missing a pinned spec is blocked", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, "apps/app.ts", "export const value = 2;\n");
    assert.equal(check(cwd, base, head).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("spec created only inside implementation PR is blocked", () => {
  const { cwd, base } = fixture(false);
  try {
    mkdirSync(join(cwd, "specs", "demo"), { recursive: true });
    writeFileSync(join(cwd, "specs", "demo", "spec.md"), "# Added too late\n");
    const head = commit(cwd, "apps/app.ts", "export const value = 2;\n");
    assert.equal(check(cwd, base, head, `Spec: specs/demo/spec.md@${head}`).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("spec edited alongside product code is blocked", () => {
  const { cwd, base } = fixture();
  try {
    const name = join(cwd, "specs", "demo", "spec.md");
    writeFileSync(name, "# Changed after approval\\n");
    const head = commit(cwd, "apps/app.ts", "export const value = 2;\\n");
    assert.equal(check(cwd, base, head, `Spec: specs/demo/spec.md@${base}`).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("same-repo develop to main promotion is exempt, fork promotion is not", () => {
  const { cwd, base } = fixture(false);
  try {
    const head = commit(cwd, "apps/app.ts", "export const value = 2;\\n");
    const env = { SPEC_BASE_REF: "main", SPEC_HEAD_REF: "develop",
                  SPEC_HEAD_REPO: "jboone1989/EventGraph",
                  SPEC_REPOSITORY: "jboone1989/EventGraph" };
    assert.equal(check(cwd, base, head, "", env).status, 0);
    assert.equal(check(cwd, base, head, "", { ...env, SPEC_HEAD_REPO: "other/EventGraph" }).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("moving product code into docs still requires a spec", () => {
  const { cwd, base } = fixture();
  try {
    mkdirSync(join(cwd, "docs"), { recursive: true });
    git(cwd, "mv", "apps/app.ts", "docs/app.ts");
    git(cwd, "commit", "-qm", "move product code");
    const head = git(cwd, "rev-parse", "HEAD");
    assert.equal(check(cwd, base, head).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("deployment config is not exempted as documentation", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, ".github/production-image.env", "PROD_IMAGE=example");
    assert.equal(check(cwd, base, head).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("first gate installation is the only CI-only bootstrap exception", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, "scripts/ci/check-spec.mjs", "console.log('gate')");
    assert.equal(check(cwd, base, head).status, 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("runtime Markdown prompts are product behavior and need an approved spec", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, "industry/prompts/selection-score.md", "Return a fixed score");
    assert.equal(check(cwd, base, head).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("agent guidance Markdown remains documentation-only", () => {
  const { cwd, base } = fixture(false);
  try {
    const head = commit(cwd, ".claude/agents/reviewer.md", "Review carefully");
    assert.equal(check(cwd, base, head).status, 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("executable scripts in documentation directories are not exempt", () => {
  for (const file of ["docs/run.mjs", ".specify/scripts/alter-check.sh", "specs/demo/deploy.sh"]) {
    const { cwd, base } = fixture();
    try {
      const head = commit(cwd, file, "echo test");
      assert.equal(check(cwd, base, head).status, 1, file);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});
test("only same-repo generated AIHOT upstream sync can omit a prior Spec", () => {
  const { cwd, base } = fixture();
  try {
    const head = commit(cwd, "apps/app.ts", "export const value = 2;\n");
    const sha = "a".repeat(40);
    const env = { SPEC_BASE_REF: "develop",
                  SPEC_HEAD_REF: "chore/aihot-upstream-" + sha.slice(0, 12),
                  SPEC_HEAD_REPO: "jboone1989/EventGraph",
                  SPEC_REPOSITORY: "jboone1989/EventGraph" };
    const body = "## AIHOT upstream synchronization\n\n- Upstream: https://github.com/KKKKhazix/AIHOT/commit/" + sha + "\n";
    assert.equal(check(cwd, base, head, body, env).status, 0);
    assert.equal(check(cwd, base, head, body, { ...env, SPEC_HEAD_REF: "feature/pretend" }).status, 1);
    assert.equal(check(cwd, base, head, body, { ...env, SPEC_HEAD_REPO: "someone/EventGraph" }).status, 1);
    assert.equal(check(cwd, base, head, body, { ...env, SPEC_BASE_REF: "main" }).status, 1);
    assert.equal(check(cwd, base, head, body.replace(sha, "b".repeat(40)), env).status, 1);
    assert.equal(check(cwd, base, head, "Upstream sync\n", env).status, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("governance-only PR does not demand a product spec", () => {
  const { cwd, base } = fixture(false);
  try {
    const head = commit(cwd, "docs/guide.md", "Review guidance\n");
    assert.equal(check(cwd, base, head).status, 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
