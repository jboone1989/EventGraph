import test from "node:test";
import assert from "node:assert/strict";
import {
  decideAttempt,
  isAllowedRepairPath,
  parsePatchPaths,
  replaceMarkerStatus,
} from "./pi-auto-repair.mjs";

const SHA1 = "a".repeat(40);
const SHA2 = "b".repeat(40);
const SHA3 = "c".repeat(40);
const SHA4 = "d".repeat(40);

function marker(sha, attempt, status = "started", pr = 211) {
  return "<!-- pi-autorepair pr=" + pr + " sha=" + sha + " attempt=" + attempt + " status=" + status + " -->";
}

function patch(path = "packages/backend/src/admin/notes.ts") {
  return [
    "diff --git a/" + path + " b/" + path,
    "index 1234567..89abcde 100644",
    "--- a/" + path,
    "+++ b/" + path,
    "@@ -1 +1 @@",
    "-before",
    "+after",
    "",
  ].join("\n");
}

test("allows ordinary source, test, and documentation paths", () => {
  assert.equal(isAllowedRepairPath("packages/backend/src/admin/notes.ts"), true);
  assert.equal(isAllowedRepairPath("apps/web/tests/notes.test.tsx"), true);
  assert.equal(isAllowedRepairPath("tests/repair.test.ts"), true);
  assert.equal(isAllowedRepairPath("docs/repair-guide.md"), true);
});

test("rejects traversal, hidden configuration, credentials, migrations, dependencies, and workflow paths", () => {
  for (const path of [
    "../../.github/workflows/check.yml",
    ".github/workflows/check.yml",
    "packages/backend/src/auth/session.ts",
    "apps/web/.env",
    "apps/web/package.json",
    "package-lock.json",
    "packages/backend/db/migrations/0001.ts",
    "packages/backend/src/schema/model.ts",
    "scripts/ci/check.mjs",
    "apps/web/.pi/settings.json",
    "packages/backend/src/secrets/key.pem",
    "apps/web/Dockerfile",
    "apps/web/node_modules/pkg/index.js",
    "apps/web/.gitignore",
  ]) assert.equal(isAllowedRepairPath(path), false, path);
});

test("validates a minimal allowlisted patch", () => {
  assert.deepEqual(parsePatchPaths(patch()), ["packages/backend/src/admin/notes.ts"]);
});

test("rejects unsafe paths and malformed patch headers", () => {
  assert.throws(() => parsePatchPaths(patch("../../.github/workflows/check.yml")), /allowlisted/);
  assert.throws(() => parsePatchPaths("not a patch"), /no files/);
  assert.throws(() => parsePatchPaths(patch().replace("b/packages/backend/src/admin/notes.ts", "b/packages/backend/src/admin/other.ts")), /quoted, renamed, or unsafe/);
});

test("rejects deletion, rename, binary, executable, and symlink patches", () => {
  assert.throws(() => parsePatchPaths(patch().replace("+++ b/packages/backend/src/admin/notes.ts", "+++ /dev/null")), /deletes a file/);
  assert.throws(() => parsePatchPaths(patch() + "rename from old.ts\nrename to new.ts\n"), /deletion, rename, binary/);
  assert.throws(() => parsePatchPaths(patch() + "GIT binary patch\n"), /deletion, rename, binary/);
  assert.throws(() => parsePatchPaths(patch().replace("index 1234567..89abcde 100644", "new file mode 100755")), /deletion, rename, binary/);
  assert.throws(() => parsePatchPaths(patch().replace("index 1234567..89abcde 100644", "new file mode 120000")), /deletion, rename, binary/);
});

test("deduplicates the same PR head SHA", () => {
  assert.deepEqual(
    decideAttempt([marker(SHA1, 1, "pushed")], 211, SHA1),
    { shouldRepair: false, reason: "duplicate-sha", attempt: 0 },
  );
});

test("allows at most three rounds across successive SHAs", () => {
  assert.deepEqual(
    decideAttempt([marker(SHA1, 1), marker(SHA2, 2)], 211, SHA3),
    { shouldRepair: true, reason: "eligible", attempt: 3 },
  );
  assert.deepEqual(
    decideAttempt([marker(SHA1, 1), marker(SHA2, 2), marker(SHA3, 3)], 211, SHA4),
    { shouldRepair: false, reason: "retry-limit", attempt: 3 },
  );
});

test("retry accounting is isolated by PR number", () => {
  assert.deepEqual(
    decideAttempt([marker(SHA1, 1, "pushed", 211)], 212, SHA1),
    { shouldRepair: true, reason: "eligible", attempt: 1 },
  );
});

test("updates only the repair marker and records the terminal result", () => {
  const body = marker(SHA1, 1) + "\nPi auto-repair attempt started.";
  const updated = replaceMarkerStatus(body, "pushed", "Validated patch pushed; CI and Claude review will rerun.");
  assert.match(updated, /status=pushed/);
  assert.match(updated, /Pi auto-repair result: Validated patch pushed; CI and Claude review will rerun\./);
  assert.throws(() => replaceMarkerStatus(body, "success", "wrong"), /invalid repair status/);
});
