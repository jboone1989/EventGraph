import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const validator = resolve("scripts/ci/validate-tasks.mjs");

const validTasks = [
  "# Work items: example", "",
  "## Work Items", "",
  "### T001 — Create the API",
  "**Scope:** Add the API endpoint.",
  "**Depends on:** none",
  "**Acceptance:**",
  "- Create the endpoint.",
  "- Add tests.", "",
  "### T002 — Add the UI",
  "**Scope:** Add the management page.",
  "**Depends on:** T001",
  "**Acceptance:**",
  "- Display the data."
].join("\n");

function validate(markdown) {
  const directory = mkdtempSync(join(tmpdir(), "eventgraph-validate-"));
  const file = join(directory, "tasks.md");
  writeFileSync(file, markdown);
  try {
    return {
      file,
      result: spawnSync(process.execPath, [validator, file], { encoding: "utf8" })
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("valid documents exit zero and report the parsed Work Item count", () => {
  const { file, result } = validate(validTasks);
  assert.equal(result.status, 0, result.stderr);
  // Exact output also proves the imported Producer main() did not run here.
  assert.equal(result.stdout.trim(), "validate-tasks PASS: " + file + " parsed 2 Work Items (T001, T002)");
});

test("invalid documents exit nonzero and surface the existing parser's error", () => {
  const cases = [
    ["missing Scope", validTasks.replace("**Scope:** Add the API endpoint.\n", ""),
      /T001 must contain exactly one Scope, Depends on and Acceptance field/],
    ["unknown dependency", validTasks.replace("**Depends on:** T001", "**Depends on:** T009"),
      /references unknown dependency T009/],
    ["duplicate Task ID", validTasks.replace("### T002 — Add the UI", "### T001 — Add the UI"),
      /Duplicate Task ID: T001/],
    ["dependency cycle", validTasks.replace("**Depends on:** none", "**Depends on:** T002"),
      /Task dependency cycle/],
    ["duplicate Work Items sections", validTasks + "\n\n" + validTasks,
      /must contain exactly one '## Work Items' section/]
  ];
  for (const [name, markdown, pattern] of cases) {
    const { file, result } = validate(markdown);
    assert.equal(result.status, 1, name + ": unexpected exit status\n" + result.stdout + result.stderr);
    assert.match(result.stderr, /^::error::validate-tasks: /, name);
    assert.ok(result.stderr.includes(file + ": "), name);
    assert.match(result.stderr, pattern, name);
  }
});

test("usage and unreadable-file failures stay actionable", () => {
  const noArgument = spawnSync(process.execPath, [validator], { encoding: "utf8" });
  assert.equal(noArgument.status, 1);
  assert.match(noArgument.stderr, /^::error::validate-tasks: usage: node scripts\/ci\/validate-tasks\.mjs/);
  const extraArgument = spawnSync(process.execPath, [validator, "a.md", "b.md"], { encoding: "utf8" });
  assert.equal(extraArgument.status, 1);
  assert.match(extraArgument.stderr, /usage:/);
  const directory = mkdtempSync(join(tmpdir(), "eventgraph-validate-missing-"));
  try {
    const absent = spawnSync(process.execPath, [validator, join(directory, "tasks.md")], { encoding: "utf8" });
    assert.equal(absent.status, 1);
    assert.match(absent.stderr, /^::error::validate-tasks: cannot read .*tasks\.md: ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
