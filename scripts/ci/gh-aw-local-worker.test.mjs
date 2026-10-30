import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const lock = readFileSync(".github/workflows/eventgraph-worker.lock.yml", "utf8").replaceAll("\r\n", "\n");
const manifest = JSON.parse(lock.split("\n").find(line => line.startsWith("# gh-aw-manifest: ")).slice("# gh-aw-manifest: ".length));

test("the local Worker exposes only native Claim and safe-output MCP channels", () => {
  assert.deepEqual(manifest.mcp_servers.map(server => server.name).sort(), ["safeoutputs", "work-queue"]);
  assert.ok(manifest.mcp_servers.find(server => server.name === "work-queue").tools.includes("work_queue_claim_finish"));
  assert.ok(manifest.mcp_servers.find(server => server.name === "safeoutputs").tools.includes("create_pull_request"));
  const metadata = JSON.parse(lock.split("\n")[0].slice("# gh-aw-metadata: ".length));
  assert.equal(metadata.strict, true);
});

test("the compiled full develop checkout can read an older immutable Spec without credentials", () => {
  const checkout = lock.match(/- name: Checkout repository \(gh-aw default\)[\s\S]*?(?=      - name:)/)?.[0];
  assert.match(checkout, /ref: "develop"/);
  assert.match(checkout, /fetch-depth: 0/);
  assert.match(checkout, /persist-credentials: false/);
  const root = mkdtempSync(join(tmpdir(), "eventgraph-local-spec-"));
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    const source = join(root, "source");
    mkdirSync(source);
    git(source, "init", "-q", "-b", "develop");
    git(source, "config", "user.name", "Local Spec Test");
    git(source, "config", "user.email", "local-spec@example.invalid");
    mkdirSync(join(source, "specs", "fixture"), { recursive: true });
    writeFileSync(join(source, "specs", "fixture", "spec.md"), "# Approved immutable fixture\n");
    git(source, "add", ".");
    git(source, "commit", "-qm", "approve spec");
    const approved = git(source, "rev-parse", "HEAD");
    writeFileSync(join(source, "README.md"), "# Later development commit\n");
    git(source, "add", ".");
    git(source, "commit", "-qm", "advance develop");
    const url = pathToFileURL(source).href;
    const shallow = join(root, "shallow"), full = join(root, "full");
    git(root, "clone", "-q", "--depth", "1", "--branch", "develop", url, shallow);
    assert.notEqual(spawnSync("git", ["cat-file", "-e", `${approved}:specs/fixture/spec.md`], { cwd: shallow, stdio: "ignore" }).status, 0);
    git(root, "clone", "-q", "--branch", "develop", url, full);
    assert.equal(git(full, "show", `${approved}:specs/fixture/spec.md`), "# Approved immutable fixture");
  } finally {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
