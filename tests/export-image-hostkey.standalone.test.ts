// Delivery uses a pinned SSH host key and resumable rsync, verifies the
// full archive SHA256 and exact image ID/revision, then records the digest.
// Real ssh-keygen verifies fingerprint matching. The same pinning block
// must be shared by export-image-vm13.sh and deploy-vm13-preview.sh.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const repoRoot = new URL("../", import.meta.url).pathname;
const digest = "a".repeat(64);
const imageRef = `ghcr.io/jboone1989/eventgraph-app@sha256:${digest}`;
const releaseSha = "5".repeat(40);
const imageId = `sha256:${digest}`;
const cnDevHost = "43.142.127.40";

const keyscanStub = `#!/bin/sh
# Emulates ssh-keyscan: offers the per-test generated ed25519 and ECDSA host
# keys, the two algorithms the real sshd offers and the script scans for.
[ -n "$STUB_KEYSCAN_FAIL" ] && exit 2
echo "$CN_DEV_HOST $(cat "$STUB_OFFERED_PUB")"
echo "$CN_DEV_HOST $(cat "$STUB_OFFERED_ECDSA_PUB")"
`;

const dirs: string[] = [];

// Generates a real host key in the sandbox and returns its public line and
// fingerprint, so wrong-key tests fail through real fingerprint math.
function keygen(dir: string, name: string, type: "ed25519" | "ecdsa" = "ed25519") {
  const file = path.join(dir, name);
  spawnSync("ssh-keygen", ["-q", "-t", type, "-N", "", "-f", file], { encoding: "utf8" });
  const pub = readFileSync(`${file}.pub`, "utf8").trim();
  const fingerprint = spawnSync("ssh-keygen", ["-lf", `${file}.pub`], { encoding: "utf8" })
    .stdout.trim().split(/\s+/)[1];
  return { pub, fingerprint };
}

interface Sandbox {
  dir: string;
  home: string;
  env: Record<string, string | undefined>;
}

// One sandbox = one VM13 home offering a generated ed25519 and ECDSA host key;
// the pin defaults to the ed25519 key's fingerprint, so callers opt into the
// other modes (pinEcdsa reproduces the 2026-10-27 CD failure: the secret pins
// the ECDSA key while the script only scanned ed25519).
function sandbox(
  opts: { pinOtherKey?: boolean; pinEcdsa?: boolean; noPin?: boolean; failKeyscan?: boolean } = {},
): Sandbox {
  const dir = mkdtempSync(path.join(tmpdir(), "export-image-"));
  dirs.push(dir);
  const offered = keygen(dir, "offered");
  const offeredEcdsa = keygen(dir, "offered-ecdsa", "ecdsa");
  const home = path.join(dir, "home");
  mkdirSync(path.join(home, ".ssh"), { recursive: true });
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "ssh-keyscan"), keyscanStub);
  writeFileSync(path.join(bin, "sudo"), `#!/bin/sh\n[ "$1" = "-n" ] && shift\nexec "$@"\n`);
  for (const f of ["ssh-keyscan", "sudo"]) {
    const mode = spawnSync("chmod", ["+x", path.join(bin, f)]);
    assert.equal(mode.status, 0);
  }
  writeFileSync(path.join(dir, "ssh-calls.log"), "");
  writeFileSync(path.join(dir, "docker-calls.log"), "");
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    CN_DEV_HOST: cnDevHost,
    STUB_CALLS: path.join(dir, "docker-calls.log"),
    STUB_SSH_CALLS: path.join(dir, "ssh-calls.log"),
    STUB_IMAGE_ID: imageId,
    STUB_REVISION: releaseSha,
    STUB_OFFERED_PUB: path.join(dir, "offered.pub"),
    STUB_OFFERED_ECDSA_PUB: path.join(dir, "offered-ecdsa.pub"),
    EVENTGRAPH_IMAGE: imageRef,
    EVENTGRAPH_RELEASE_SHA: releaseSha,
    EVENTGRAPH_DEV_SSH_FINGERPRINT: undefined,
  };
  if (!opts.noPin) {
    env.EVENTGRAPH_DEV_SSH_FINGERPRINT = opts.pinEcdsa
      ? offeredEcdsa.fingerprint
      : opts.pinOtherKey
        ? keygen(dir, "other").fingerprint
        : offered.fingerprint;
  }
  if (opts.failKeyscan) env.STUB_KEYSCAN_FAIL = "1";
  return { dir, home, env };
}

const run = (env: Record<string, string | undefined>) =>
  spawnSync("sh", [path.join(repoRoot, "scripts/ci/export-image-vm13.sh")], { env, encoding: "utf8" });

const content = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const pinnedFile = (home: string) => path.join(home, ".ssh/known_hosts.cndev");

after(async () => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

test("a cn-dev host key that does not match the pinned fingerprint is refused before any bytes move", () => {
  const { dir, home, env } = sandbox({ pinOtherKey: true });
  const res = run(env);
  assert.notEqual(res.status, 0, "a mismatched host key must abort delivery");
  assert.match(res.stderr, /pinned fingerprint/);
  assert.equal(content(path.join(dir, "docker-calls.log")), "", "no docker command may run");
  assert.equal(content(path.join(dir, "ssh-calls.log")), "", "no ssh connection may be attempted");
  assert.ok(!existsSync(path.join(home, ".ssh/known_hosts.cndev")), "no key may be trusted");
  assert.ok(!existsSync(`${pinnedFile(home)}.scan`));
});

test("a missing pinned fingerprint refuses delivery", () => {
  const { dir, env } = sandbox({ noPin: true });
  const res = run(env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /EVENTGRAPH_DEV_SSH_FINGERPRINT/);
  assert.equal(content(path.join(dir, "ssh-calls.log")), "");
});

test("an unreachable or empty keyscan refuses delivery", () => {
  const { dir, home, env } = sandbox({ failKeyscan: true });
  const res = run(env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /ssh-keyscan failed/);
  assert.equal(content(path.join(dir, "ssh-calls.log")), "");
  assert.ok(!existsSync(pinnedFile(home)));
});


// The replacement delivery path is a stable rsync archive, not a registry.
// These stubs model an interrupted byte transfer and a fresh invocation over
// the same staged file. No real Docker daemon, SSH host or production API used.
function rsyncSandbox(opts: { pinEcdsa?: boolean; badHash?: boolean; badId?: boolean; badRevision?: boolean; transferFailure?: boolean; largeArchive?: boolean } = {}) {
  const sb = sandbox({ pinEcdsa: opts.pinEcdsa });
  const bin = path.join(sb.dir, "bin");
  sb.env.STUB_STAGE = path.join(sb.dir, "remote-current.tar");
  sb.env.STUB_PARTS = path.join(sb.dir, "remote-parts");
  sb.env.STUB_LARGE_ARCHIVE = opts.largeArchive ? "1" : "";
  sb.env.STUB_RSYNC_CALLS = path.join(sb.dir, "rsync-calls.log");
  sb.env.STUB_BAD_HASH = opts.badHash ? "1" : "";
  sb.env.STUB_BAD_ID = opts.badId ? "1" : "";
  sb.env.STUB_BAD_REVISION = opts.badRevision ? "1" : "";
  sb.env.STUB_RSYNC_FAIL = opts.transferFailure ? "1" : "";
  writeFileSync(path.join(bin, "docker"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$STUB_CALLS\"",
    "case \"$*\" in",
    "  'image inspect '* )",
    "    case \"$*\" in",
    "      *'.Id'* ) printf '%s\\n' \"$STUB_IMAGE_ID\" ;;",
    "      *'org.opencontainers.image.revision'* ) printf '%s\\n' \"$STUB_REVISION\" ;;",
    "    esac ;;",
    "  'save '* ) if [ \"$STUB_LARGE_ARCHIVE\" = 1 ]; then head -c 17825792 /dev/zero; else printf '%s\\n' 'fixture image archive contents - unchanged layers'; fi ;;",
    "  * ) echo \"unexpected docker: $*\" >&2; exit 1 ;;",
    "esac",
    ""
  ].join("\n"));
  writeFileSync(path.join(bin, "ssh"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$STUB_SSH_CALLS\"",
    "case \"$*\" in",
    "  *'mkdir -p '* )",
    "    mkdir -p \"$STUB_PARTS\";",
    "    if [ -f \"$STUB_STAGE\" ] && [ ! -e \"$STUB_PARTS/part.000\" ]; then",
    "      split -b 8m -d -a 3 \"$STUB_STAGE\" \"$STUB_PARTS/part.\";",
    "    fi ;;",
    "  *'cat '*'sha256sum '* )",
    "    cat \"$STUB_PARTS\"/part.* > \"$STUB_STAGE.ready\";",
    "    if [ \"$STUB_BAD_HASH\" = 1 ]; then printf '%064d\\n' 0;",
    "    else sha256sum \"$STUB_STAGE.ready\" | cut -d ' ' -f1; fi ;;",
    "  *'mv '*'current.tar.ready'* ) mv \"$STUB_STAGE.ready\" \"$STUB_STAGE\" ;;",
    "  *'docker load -i '* ) printf 'load\\n' >> \"$STUB_CALLS\" ;;",
    "  *'docker image inspect --format'*'.Id'* )",
    "    if [ \"$STUB_BAD_ID\" = 1 ]; then printf 'sha256:wrong\\n'; else printf '%s\\n' \"$STUB_IMAGE_ID\"; fi ;;",
    "  *'docker image inspect --format'*'org.opencontainers.image.revision'* )",
    "    if [ \"$STUB_BAD_REVISION\" = 1 ]; then printf 'wrong-release\\n'; else printf '%s\\n' \"$STUB_REVISION\"; fi ;;",
    "  * ) : ;;",
    "esac",
    ""
  ].join("\n"));
  writeFileSync(path.join(bin, "rsync"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$STUB_RSYNC_CALLS\"",
    "second_last=''; last=''",
    "for arg in \"$@\"; do second_last=\"$last\"; last=\"$arg\"; done",
    "mkdir -p \"$STUB_PARTS\"",
    "dest=\"$STUB_PARTS/${second_last##*/}\"",
    "if [ \"$STUB_RSYNC_FAIL\" = 1 ]; then head -c 12 \"$second_last\" > \"$dest\"; exit 23; fi",
    "cp \"$second_last\" \"$dest\"",
    ""
  ].join("\n"));
  writeFileSync(path.join(bin, "timeout"), [
    "#!/bin/sh", "[ \"$1\" = -k ] || exit 20",
    "[ \"$3\" = 30m ] || exit 21",
    "shift 3", "exec \"$@\"", ""
  ].join("\n"));
  for (const f of ["docker", "ssh", "rsync", "timeout"]) {
    const c = spawnSync("chmod", ["+x", path.join(bin, f)], { encoding: "utf8" });
    assert.equal(c.status, 0, c.stderr);
  }
  return sb;
}

test("VM13 database tunnel and image delivery use identical cn-dev host key pinning", () => {
  const extract = (file: string) => {
    const source = readFileSync(path.join(repoRoot, "scripts/ci", file), "utf8");
    const start = source.indexOf(': "${EVENTGRAPH_DEV_SSH_FINGERPRINT:');
    const end = source.indexOf('cndev_algo="$(awk', start);
    assert.ok(start !== -1 && end > start, file);
    assert.ok(!source.includes("ssh_keyscan"), file);
    return source.slice(start, end);
  };
  assert.equal(extract("deploy-vm13-preview.sh"), extract("export-image-vm13.sh"));
});

test("rsync transports a digest-verified archive, preserving the existing image tag pairing", () => {
  const sb = rsyncSandbox();
  const res = run(sb.env);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /Verified image/);
  assert.match(content(path.join(sb.dir, "docker-calls.log")), /save sha256:/);
  const transfers = content(path.join(sb.dir, "rsync-calls.log"));
  assert.match(transfers, /--inplace/);
  assert.match(transfers, /--partial/);
  assert.match(transfers, /--no-whole-file/);
  assert.match(transfers, /--compress-choice=zstd/);
  assert.match(transfers, /StrictHostKeyChecking=yes/);
  assert.match(transfers, /HostKeyAlgorithms=ssh-ed25519/);
  assert.match(transfers, /UserKnownHostsFile=/);
  assert.match(transfers, /ConnectTimeout=15/);
  const offeredPub = readFileSync(path.join(sb.dir, "offered.pub"), "utf8").trim();
  assert.equal(readFileSync(pinnedFile(sb.home), "utf8"),
    `${cnDevHost} ${offeredPub}\n`);
  const hops = content(path.join(sb.dir, "ssh-calls.log"));
  for (const hop of hops.trim().split("\n")) {
    assert.match(hop, /StrictHostKeyChecking=yes/);
    assert.match(hop, /UserKnownHostsFile=/);
    assert.match(hop, /ConnectTimeout=15/);
  }
  assert.match(hops, /sha256sum/);
  assert.match(hops, /docker load/);
  assert.match(hops, /eventgraph-last-delivered-image/);
  assert.match(hops, /docker volume rm eventgraph-dev-registry/);
  assert.equal(readFileSync(path.join(sb.dir, "remote-current.tar"), "utf8"),
    "fixture image archive contents - unchanged layers\n");
});

test("parallel transfer divides a real 17 MiB archive into three resumable parts", () => {
  const sb = rsyncSandbox({ largeArchive: true });
  const result = run(sb.env);
  assert.equal(result.status, 0, result.stderr);
  const lines = content(sb.env.STUB_RSYNC_CALLS!).trim().split("\n");
  assert.equal(lines.length, 3, lines.join("\n"));
  assert.deepEqual(lines.map(line => line.match(/part\.00[0-2]/)?.[0]).sort(),
    ["part.000", "part.001", "part.002"]);
  assert.equal(statSync(sb.env.STUB_STAGE!).size, 17825792);
  assert.ok(lines.every(line => line.includes("--inplace") && line.includes("StrictHostKeyChecking=yes")));
});

test("an interrupted transfer preserves partial bytes but cannot load or publish an image", () => {
  const sb = rsyncSandbox({ transferFailure: true });
  const fail = run(sb.env);
  assert.notEqual(fail.status, 0);
  assert.match(fail.stderr, /staged bytes retained/);
  assert.equal(readFileSync(path.join(sb.env.STUB_PARTS!, "part.000"), "utf8").length, 12);
  assert.ok(!existsSync(sb.env.STUB_STAGE!));
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /docker load|eventgraph-last-delivered-image/);
  sb.env.STUB_RSYNC_FAIL = "";
  const resume = run(sb.env);
  assert.equal(resume.status, 0, resume.stderr);
  assert.match(content(path.join(sb.dir, "ssh-calls.log")), /eventgraph-last-delivered-image/);
});

test("archive checksum mismatch fails before docker load and release pairing", () => {
  const sb = rsyncSandbox({ badHash: true });
  const res = run(sb.env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /checksum mismatch/);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /docker load|eventgraph-last-delivered-image/);
});

test("a wrong loaded image identity cannot become the active Worker tag", () => {
  const sb = rsyncSandbox({ badId: true });
  const res = run(sb.env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /does not match/);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /eventgraph-last-delivered-image/);
});

test("a wrong loaded source revision cannot become the active Worker tag", () => {
  const sb = rsyncSandbox({ badRevision: true });
  const res = run(sb.env);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /revision does not match/);
  assert.doesNotMatch(content(path.join(sb.dir, "ssh-calls.log")), /eventgraph-last-delivered-image/);
});

test("the ECDSA pinned host key is used by rsync as well as SSH", () => {
  const sb = rsyncSandbox({ pinEcdsa: true });
  const res = run(sb.env);
  assert.equal(res.status, 0, res.stderr);
  assert.match(content(path.join(sb.dir, "rsync-calls.log")), /HostKeyAlgorithms=ecdsa-sha2-nistp256/);
  assert.match(content(path.join(sb.dir, "ssh-calls.log")), /HostKeyAlgorithms=ecdsa-sha2-nistp256/);
});
