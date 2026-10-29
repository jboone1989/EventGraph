#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const REPOSITORY = "jboone1989/EventGraph";
export const MAX_REPAIR_ROUNDS = 3;
const MAX_PATCH_BYTES = 256 * 1024;
const MAX_PATCH_FILES = 20;
const ALLOWED_ROOTS = ["apps/", "packages/", "modules/", "tests/", "e2e/", "site/", "docs/"];
const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".html",
  ".md", ".txt", ".rst", ".json",
]);
const FORBIDDEN_SEGMENTS = new Set([
  ".git", ".github", ".pi", ".agents", ".claude", "node_modules", "migrations",
  "migration", "auth", "security", "permissions", "secrets", "credentials",
  "infra", "deploy", "database", "db", "schema",
]);

export function isAllowedRepairPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return false;
  if (!ALLOWED_ROOTS.some(root => value.startsWith(root))) return false;
  if (parts.some(part => FORBIDDEN_SEGMENTS.has(part.toLowerCase()))) return false;
  if (parts.some(part => part.startsWith(".") && part !== ".")) return false;
  if (/(^|\/)(AGENTS|CLAUDE|SYSTEM)\.md$/i.test(value)) return false;
  if (/(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i.test(value)) return false;
  if (/(^|\/)\.env(?:\..*)?$/i.test(value)) return false;
  if (/(^|\/)(Dockerfile(?:\..*)?|docker-compose(?:\..*)?\.ya?ml)$/i.test(value)) return false;
  if (/\.(pem|key|p12|pfx|crt|cer|der|sqlite|db)$/i.test(value)) return false;
  if (/(^|\/).*(migration|schema).*\.(ts|tsx|js|mjs|sql|prisma)$/i.test(value)) return false;
  const dot = value.lastIndexOf(".");
  const extension = dot < 0 ? "" : value.slice(dot).toLowerCase();
  return ALLOWED_EXTENSIONS.has(extension);
}

export function parsePatchPaths(patch) {
  if (typeof patch !== "string" || Buffer.byteLength(patch, "utf8") === 0) {
    throw new Error("empty repair patch");
  }
  if (Buffer.byteLength(patch, "utf8") > MAX_PATCH_BYTES) {
    throw new Error("repair patch exceeds size limit");
  }
  const blocks = patch.split(/^diff --git /m).slice(1);
  if (blocks.length === 0 || blocks.length > MAX_PATCH_FILES) {
    throw new Error("repair patch has no files or too many files");
  }
  const paths = [];
  for (const block of blocks) {
    const firstLine = block.split(/\r?\n/, 1)[0];
    const match = /^a\/([A-Za-z0-9._/-]+) b\/([A-Za-z0-9._/-]+)$/.exec(firstLine);
    if (!match || match[1] !== match[2]) throw new Error("quoted, renamed, or unsafe patch path");
    const filePath = match[1];
    if (!isAllowedRepairPath(filePath)) throw new Error("repair path is not allowlisted: " + filePath);
    if (/^(deleted file mode|rename from |rename to |copy from |copy to |GIT binary patch|Binary files |old mode |new mode |new file mode (?!100644)|Subproject commit)/m.test(block)) {
      throw new Error("repair patch contains a deletion, rename, binary, symlink, or mode change");
    }
    if (/^\+\+\+ \/dev\/null$/m.test(block)) throw new Error("repair patch deletes a file");
    const oldHeader = /^--- a\/([A-Za-z0-9._/-]+)$/m.exec(block);
    const newHeader = /^\+\+\+ b\/([A-Za-z0-9._/-]+)$/m.exec(block);
    if (oldHeader && oldHeader[1] !== filePath) throw new Error("old patch header does not match path");
    if (newHeader && newHeader[1] !== filePath) throw new Error("new patch header does not match path");
    paths.push(filePath);
  }
  return [...new Set(paths)];
}

export function decideAttempt(commentBodies, prNumber, sha, maxRounds = MAX_REPAIR_ROUNDS) {
  const markers = [];
  const markerPattern = /<!-- pi-autorepair pr=(\d+) sha=([0-9a-f]{40}) attempt=(\d+) status=([a-z-]+) -->/g;
  for (const body of commentBodies) {
    let match;
    while ((match = markerPattern.exec(String(body)))) {
      if (Number(match[1]) === Number(prNumber)) {
        markers.push({ pr: Number(match[1]), sha: match[2], attempt: Number(match[3]), status: match[4] });
      }
    }
  }
  if (markers.some(marker => marker.sha === sha)) {
    return { shouldRepair: false, reason: "duplicate-sha", attempt: 0 };
  }
  const seenShas = new Set(markers.map(marker => marker.sha));
  if (seenShas.size >= maxRounds) {
    return { shouldRepair: false, reason: "retry-limit", attempt: seenShas.size };
  }
  return { shouldRepair: true, reason: "eligible", attempt: seenShas.size + 1 };
}

export function replaceMarkerStatus(body, status, summary) {
  if (!["pushed", "failed", "blocked"].includes(status)) throw new Error("invalid repair status");
  const marker = /<!-- pi-autorepair pr=(\d+) sha=([0-9a-f]{40}) attempt=(\d+) status=[a-z-]+ -->/;
  const match = marker.exec(String(body));
  if (!match) throw new Error("repair marker missing from comment");
  const nextMarker = "<!-- pi-autorepair pr=" + match[1] + " sha=" + match[2] +
    " attempt=" + match[3] + " status=" + status + " -->";
  const safeSummary = String(summary || "").replace(/[<>]/g, "").replace(/\r/g, "").slice(0, 1200);
  return String(body).replace(marker, nextMarker).replace(/\n\n(?:Pi auto-repair result:)[\s\S]*$/, "") +
    "\n\nPi auto-repair result: " + safeSummary;
}

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 90000,
    env: process.env,
  }).trim();
}

function ghJson(endpoint) {
  const output = gh(["api", endpoint]);
  return JSON.parse(output);
}

function ghWrite(method, endpoint, fields) {
  const args = ["api", "-X", method, endpoint];
  for (const [key, value] of Object.entries(fields || {})) args.push("-f", key + "=" + value);
  const output = gh(args);
  return output ? JSON.parse(output) : {};
}

function writeOutputs(values) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) throw new Error("GITHUB_OUTPUT is unavailable");
  const lines = Object.entries(values).map(([key, value]) => key + "=" + String(value ?? ""));
  appendFileSync(path, lines.join("\n") + "\n", { encoding: "utf8" });
}

function skip(reason) {
  writeOutputs({
    should_repair: "false", skip_reason: reason, pr_number: "", sha: "",
    head_ref: "", failure_kind: "", run_id: "", attempt: "", comment_id: "",
  });
}

function getComments(prNumber) {
  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const rows = ghJson("repos/" + REPOSITORY + "/issues/" + prNumber +
      "/comments?per_page=100&page=" + page);
    if (!Array.isArray(rows)) throw new Error("invalid PR comments response");
    comments.push(...rows);
    if (rows.length < 100) return comments;
  }
  throw new Error("PR comment pagination exceeded limit");
}

function resolvePullRequest(event, eventName) {
  let sha = "";
  let runId = "";
  let failureKind = "";
  let candidates = [];
  if (eventName === "workflow_run") {
    const run = event.workflow_run || {};
    if (run.event !== "pull_request" || run.conclusion !== "failure" ||
        !run.head_repository || run.head_repository.full_name !== REPOSITORY) {
      return null;
    }
    sha = String(run.head_sha || "");
    runId = String(run.id || "");
    failureKind = "check";
    candidates = Array.isArray(run.pull_requests) ? run.pull_requests.map(item => item.number) : [];
    if (candidates.length === 0 && /^[A-Za-z0-9._/-]{1,240}$/.test(String(run.head_branch || ""))) {
      const owner = REPOSITORY.split("/")[0];
      const branch = encodeURIComponent(owner + ":" + run.head_branch);
      const rows = ghJson("repos/" + REPOSITORY + "/pulls?state=open&head=" + branch + "&base=develop&per_page=100");
      candidates = Array.isArray(rows) ? rows.map(item => item.number) : [];
    }
  } else if (eventName === "status") {
    if (event.context !== "claude-review" || event.state !== "failure") return null;
    sha = String(event.sha || "");
    failureKind = "claude-review";
    const rows = ghJson("repos/" + REPOSITORY + "/commits/" + sha + "/pulls?per_page=100");
    candidates = Array.isArray(rows) ? rows.map(item => item.number) : [];
  } else if (eventName === "workflow_dispatch") {
    sha = String((event.inputs || {}).sha || "");
    const pr = Number((event.inputs || {}).pr_number);
    failureKind = "manual";
    if (Number.isInteger(pr) && pr > 0) candidates = [pr];
  } else {
    return null;
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  const uniqueCandidates = [...new Set(candidates.map(Number).filter(n => Number.isInteger(n) && n > 0))];
  const eligible = [];
  for (const number of uniqueCandidates) {
    const pr = ghJson("repos/" + REPOSITORY + "/pulls/" + number);
    if (pr.state === "open" && !pr.draft && pr.base?.ref === "develop" &&
        pr.head?.repo?.full_name === REPOSITORY && pr.head?.sha === sha) {
      eligible.push(pr);
    }
  }
  if (eligible.length !== 1) return null;
  return { pr: eligible[0], sha, runId, failureKind };
}

function locate() {
  const eventName = process.env.EVENT_NAME || "";
  const eventPath = process.env.GITHUB_EVENT_PATH || "";
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const resolved = resolvePullRequest(event, eventName);
  if (!resolved) return skip("no-eligible-current-develop-pr");
  const { pr, sha, runId, failureKind } = resolved;
  const comments = getComments(pr.number);
  const decision = decideAttempt(comments.map(comment => comment.body || ""), pr.number, sha);
  if (!decision.shouldRepair) {
    if (decision.reason === "retry-limit") {
      ghWrite("POST", "repos/" + REPOSITORY + "/issues/" + pr.number + "/comments", {
        body: "<!-- pi-autorepair-stop pr=" + pr.number + " sha=" + sha + " -->\n" +
          "Pi auto-repair stopped after " + MAX_REPAIR_ROUNDS +
          " rounds for this PR. The current failure needs manual attention; no merge was attempted.",
      });
    }
    return skip(decision.reason);
  }
  const markerBody = "<!-- pi-autorepair pr=" + pr.number + " sha=" + sha +
    " attempt=" + decision.attempt + " status=started -->\n" +
    "Pi auto-repair attempt " + decision.attempt + "/" + MAX_REPAIR_ROUNDS +
    " started for the current " + failureKind + " failure at " + sha + ". " +
    "The existing CI and independent Claude review remain the merge gates.";
  const comment = ghWrite("POST", "repos/" + REPOSITORY + "/issues/" + pr.number + "/comments", {
    body: markerBody,
  });
  writeOutputs({
    should_repair: "true",
    skip_reason: "",
    pr_number: pr.number,
    sha,
    head_ref: pr.head.ref,
    failure_kind: failureKind,
    run_id: runId,
    attempt: decision.attempt,
    comment_id: comment.id,
  });
}

function writeContext() {
  const kind = process.env.FAILURE_KIND || "";
  const prNumber = String(process.env.PR_NUMBER || "");
  const runId = String(process.env.RUN_ID || "");
  let context = "";
  let blocked = false;
  if (kind === "check") {
    if (!/^\d+$/.test(runId)) throw new Error("missing Check workflow run ID");
    context = gh(["run", "view", runId, "--repo", REPOSITORY, "--log-failed"]);
    if (/Spec gate:|pre-existing approved Spec|missing or invalid PR base\/head SHA/i.test(context)) {
      blocked = true;
      context = "The Check failure is a Spec/governance gate failure, not an application-code failure. Do not attempt an application patch. The PR description or approved Spec must be corrected through the normal workflow.";
    }
    context = context.slice(-18000);
  } else if (kind === "claude-review") {
    const comments = getComments(prNumber);
    const reports = comments.filter(comment => {
      const body = String(comment.body || "");
      return body.includes("Code review") && (body.includes(process.env.EXPECTED_SHA || "") ||
        body.includes("Read-only automated review"));
    });
    if (reports.length === 0) throw new Error("no Claude review report found for the failing SHA");
    context = String(reports[reports.length - 1].body || "").slice(0, 16000);
  } else {
    throw new Error("unsupported repair failure kind");
  }
  const outputPath = process.env.CONTEXT_OUTPUT;
  if (!outputPath) throw new Error("CONTEXT_OUTPUT is unavailable");
  writeFileSync(outputPath, context, { encoding: "utf8", mode: 0o600 });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "context_blocked=" + String(blocked) + "\n");
  if (blocked) process.exitCode = 2;
}

function finish() {
  const id = String(process.env.COMMENT_ID || "");
  const status = String(process.env.FINAL_STATUS || "");
  const summary = String(process.env.FINAL_SUMMARY || "");
  if (!/^\d+$/.test(id)) throw new Error("invalid repair comment ID");
  const current = ghJson("repos/" + REPOSITORY + "/issues/comments/" + id);
  const body = replaceMarkerStatus(current.body || "", status, summary);
  ghWrite("PATCH", "repos/" + REPOSITORY + "/issues/comments/" + id, { body });
}

function main() {
  const command = process.argv[2];
  if (command === "locate") return locate();
  if (command === "context") return writeContext();
  if (command === "finish") return finish();
  if (command === "validate-patch") {
    const patchPath = process.argv[3];
    if (!patchPath) throw new Error("patch path required");
    const patch = readFileSync(patchPath, "utf8");
    const paths = parsePatchPaths(patch);
    process.stdout.write(JSON.stringify({ ok: true, paths }) + "\n");
    return;
  }
  throw new Error("unknown command");
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write("Pi auto-repair: " + String(error?.message || error) + "\n");
    process.exitCode = 1;
  }
}
