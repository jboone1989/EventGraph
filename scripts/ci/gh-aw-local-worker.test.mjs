import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const lock = readFileSync(".github/workflows/eventgraph-worker.lock.yml", "utf8").replaceAll("\r\n", "\n");
const source = readFileSync(".github/workflows/eventgraph-worker.md", "utf8").replaceAll("\r\n", "\n");
const manifest = JSON.parse(lock.split("\n").find(line => line.startsWith("# gh-aw-manifest: ")).slice("# gh-aw-manifest: ".length));

test("the local Worker exposes only native Claim and safe-output MCP channels", () => {
  assert.deepEqual(manifest.mcp_servers.map(server => server.name).sort(), ["safeoutputs", "work-queue"]);
  assert.ok(manifest.mcp_servers.find(server => server.name === "work-queue").tools.includes("work_queue_claim_finish"));
  assert.ok(manifest.mcp_servers.find(server => server.name === "safeoutputs").tools.includes("create_pull_request"));
  const metadata = JSON.parse(lock.split("\n")[0].slice("# gh-aw-metadata: ".length));
  assert.equal(metadata.strict, true);
});

test("the Worker source selects claim-scoped unsigned delivery while GH-AW v1.0.1 signed-ref verification is broken", () => {
  assert.match(source, /create-pull-request:[\s\S]*?signed-commits:\s*false/);
  assert.match(lock, /\\\"signed_commits\\\":false/);
  assert.doesNotMatch(source, /EVENTGRAPH_WORKER_RUN_ID|eventgraph-work-id|worker-run-id/);
  assert.match(source, /generated safe-output footer remains the authoritative machine-readable Work\/Claim provenance/);
  assert.match(source, /deterministic Producer in the existing successful develop Check continuation/);
  assert.match(source, /Task: <task_id>/);
  assert.match(source, /Issue URL: https:\/\/github\.com\/jboone1989\/EventGraph\/issues\/<issue-number>/);
  assert.match(source, /GitHub Actions triggers the official native Dispatcher/);
  assert.match(source, /one-open-agent-PR serialization rule/);
  assert.doesNotMatch(source, /Producer already verified|deterministic completion bridge/);
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


test("the GLM Worker has enough turns for code tasks and its compiled budget matches the source", () => {
  assert.match(source, /^max-turns: 1000$/m);
  assert.match(lock, /^\s+GH_AW_MAX_TURNS: 1000$/m);
  assert.match(lock, /maxRuns.{0,8}1000/, "compiled AWF proxy must enforce the updated budget");
  assert.match(lock, /claude_harness\.cjs claude --print --no-chrome --strict-mcp-config --max-turns 1000 --allowed-tools/, "compiled Claude CLI must honor the source 1000-turn limit, not the old 120-turn cap");
  assert.match(source, /^timeout-minutes: 60\njobs:\n  agent:\n    timeout-minutes: 75$/m);
  assert.match(lock, /^    timeout-minutes: 75\n    env:\n      DEFAULT_BRANCH:/m);
  assert.match(lock, /^        timeout-minutes: 60\n        run: \|/m);
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  assert.ok(frontmatter, "Worker source must contain frontmatter");
  const expectedHash = createHash("sha256").update(JSON.stringify({ "frontmatter-text": frontmatter })).digest("hex");
  const metadata = JSON.parse(lock.split("\n")[0].slice("# gh-aw-metadata: ".length));
  assert.equal(metadata.frontmatter_hash, expectedHash, "recompile the lock when changing frontmatter");
});


test("GH-AW Worker can install Node dependencies inside the default-deny agent firewall", () => {
  assert.match(source, /network:\n  allowed:\n    - github\.com\n    - open\.bigmodel\.cn\n    - node\n/);
  assert.match(lock, /registry\.npmjs\.org/, "compiled AWF allowDomains must include npm through the official node ecosystem");
});
