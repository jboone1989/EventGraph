import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const gate = resolve("scripts/ci/check-spec.mjs");
const scope = resolve("scripts/ci/scope-changes.mjs");
const repo = "jboone1989/EventGraph";
function git(cwd, ...args) {
  const p = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(p.status, 0, p.stderr);
  return p.stdout.trim();
}
function fixture(mainContent = false) {
  const cwd = mkdtempSync(join(tmpdir(), "eventgraph-history-"));
  git(cwd, "init", "-q");
  git(cwd, "config", "user.name", "History Sync CI");
  git(cwd, "config", "user.email", "ci-history@example.invalid");
  mkdirSync(join(cwd, "apps"), { recursive: true });
  writeFileSync(join(cwd, "apps/app.ts"), "export const value = 1;\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "baseline");
  const ancestor = git(cwd, "rev-parse", "HEAD");
  git(cwd, "checkout", "-qb", "main", ancestor);
  if (mainContent) {
    writeFileSync(join(cwd, "apps/app.ts"), "export const value = 99;\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "main-only hotfix");
  } else {
    git(cwd, "commit", "--allow-empty", "-qm", "release marker");
  }
  const main = git(cwd, "rev-parse", "HEAD");
  git(cwd, "checkout", "-qb", "develop", ancestor);
  writeFileSync(join(cwd, "apps/app.ts"), "export const value = 2;\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", "approved Worker code");
  const develop = git(cwd, "rev-parse", "HEAD");
  git(cwd, "checkout", "-qb", "sync/main-history-test");
  git(cwd, "merge", "--no-ff", "-s", "ours", "main", "-m", "connect release history");
  const sync = git(cwd, "rev-parse", "HEAD");
  return { cwd, main, develop, sync };
}
function check(cwd, base, head, extra = {}) {
  return spawnSync(process.execPath, [gate], {
    cwd, encoding: "utf8", env: {
      ...process.env,
      SPEC_BASE_SHA: base, SPEC_HEAD_SHA: head,
      SPEC_BASE_REF: "develop", SPEC_HEAD_REF: "sync/main-history-test",
      SPEC_HEAD_REPO: repo, SPEC_REPOSITORY: repo, ...extra,
    },
  });
}
function classify(cwd, base, head, extra = {}) {
  return spawnSync(process.execPath, [scope], {
    cwd, encoding: "utf8", env: {
      ...process.env, SCOPE_BASE_SHA: base, SCOPE_HEAD_SHA: head,
      SCOPE_BASE_REF: "develop", SCOPE_HEAD_REF: "sync/main-history-test",
      SCOPE_HEAD_REPO: repo, SCOPE_REPOSITORY: repo, ...extra,
    },
  });
}
test("verified release-only merge passes Spec gate and skips heavy/paid reviews", () => {
  const { cwd, main, develop, sync } = fixture();
  try {
    assert.equal(git(cwd, "rev-parse", sync + "^{tree}"), git(cwd, "rev-parse", develop + "^{tree}"));
    assert.deepEqual(git(cwd, "rev-list", "--parents", "-n", "1", sync).split(" ").slice(1), [develop, main]);
    const verified = check(cwd, develop, sync);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /history-only release sync/);
    const scoped = classify(cwd, develop, sync);
    assert.equal(scoped.status, 0, scoped.stderr);
    assert.equal(scoped.stdout.trim(), "docs_only=true");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("main-only application changes cannot be discarded using an ours merge", () => {
  const { cwd, develop, sync } = fixture(true);
  try {
    assert.notEqual(check(cwd, develop, sync).status, 0);
    assert.equal(classify(cwd, develop, sync).stdout.trim(), "docs_only=false");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("wrong branch, fork, stale first parent and changed tree are never history sync", () => {
  const { cwd, develop, sync } = fixture();
  try {
    assert.notEqual(check(cwd, develop, sync, { SPEC_HEAD_REF: "feature/pretend" }).status, 0);
    assert.notEqual(check(cwd, develop, sync, { SPEC_HEAD_REPO: "fork/EventGraph" }).status, 0);
    assert.equal(classify(cwd, develop, sync, { SCOPE_HEAD_REPO: "fork/EventGraph" }).stdout.trim(), "docs_only=false");
    assert.notEqual(check(cwd, sync, sync).status, 0);
    writeFileSync(join(cwd, "apps/app.ts"), "export const value = 3;\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "unexpected content change");
    const badHead = git(cwd, "rev-parse", "HEAD");
    assert.notEqual(check(cwd, develop, badHead).status, 0);
    assert.equal(classify(cwd, develop, badHead).stdout.trim(), "docs_only=false");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("native update-branch keeps a safe sync mergeable after develop advances", () => {
  const { cwd, main, develop, sync } = fixture();
  try {
    git(cwd, "checkout", "-q", "develop");
    mkdirSync(join(cwd, "docs"), { recursive: true });
    writeFileSync(join(cwd, "docs/update.md"), "# Subsequent change\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "feature PR merged while sync pending");
    const nextDevelop = git(cwd, "rev-parse", "HEAD");
    git(cwd, "checkout", "-q", "sync/main-history-test");
    git(cwd, "merge", "--no-ff", "develop", "-m", "native update-branch");
    const nextSync = git(cwd, "rev-parse", "HEAD");
    assert.equal(git(cwd, "rev-parse", nextSync + "^{tree}"), git(cwd, "rev-parse", nextDevelop + "^{tree}"));
    assert.equal(check(cwd, nextDevelop, nextSync).status, 0);
    assert.equal(classify(cwd, nextDevelop, nextSync).stdout.trim(), "docs_only=true");
    assert.notEqual(check(cwd, nextDevelop, sync).status, 0, "stale PR head must fail");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("develop push of a safe history-only PR does not rebuild/redeploy the app", () => {
  const { cwd, develop } = fixture();
  try {
    git(cwd, "checkout", "-q", "develop");
    git(cwd, "merge", "--no-ff", "sync/main-history-test", "-m", "github merge commit");
    const merged = git(cwd, "rev-parse", "HEAD");
    assert.equal(classify(cwd, develop, merged, {
      SCOPE_BASE_REF: "develop", SCOPE_HEAD_REF: "develop",
      SCOPE_EVENT_NAME: "push",
    }).stdout.trim(), "docs_only=true");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("main advances after old sync: never merge the stale head", () => {
  const { cwd, develop, sync } = fixture();
  try {
    git(cwd, "checkout", "-q", "main");
    git(cwd, "commit", "--allow-empty", "-qm", "next main promotion");
    assert.notEqual(check(cwd, develop, sync).status, 0);
    assert.equal(classify(cwd, develop, sync).stdout.trim(), "docs_only=false");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test("CI wiring uses PR head, merge-base review diff, and merge rather than squash for sync", () => {
  const wf = readFileSync(resolve(".github/workflows/check.yml"), "utf8");
  assert.match(wf, /SCOPE_HEAD_SHA:.*pull_request\.head\.sha/);
  assert.match(wf, /merge_base="\$\(git merge-base "\$BASE_SHA" "\$HEAD_SHA"\)"/);
  assert.match(wf, /head_ref" == sync\/main-history-\*/);
  assert.match(wf, /gh pr merge "\$PR_NUMBER".*--auto --merge/);
  const release = readFileSync(resolve(".github/workflows/sync-main-history.yml"), "utf8");
  assert.match(release, /git merge --no-ff -s ours/);
  assert.match(release, /git diff --quiet "\$common" "\$main_sha"/);
  assert.doesNotMatch(release, /force-with-lease|push --force/);
});
