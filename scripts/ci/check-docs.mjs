#!/usr/bin/env node
// Basic offline validation for documentation-only changes: every relative
// link, image and heading anchor in the changed prose files must resolve
// inside the repository at HEAD. External http(s)/mailto links and absolute
// site routes are out of scope (CI makes no network calls). shortcut: inline
// and reference links plus GitHub-style slugs only, no full CommonMark.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

const base = process.env.SCOPE_BASE_SHA || "";
const head = process.env.SCOPE_HEAD_SHA || "";
const hash = /^[0-9a-f]{40}$/;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

const governance = /^(?:docs\/|specs\/|\.specify\/|\.agents\/|\.claude\/)/;
const rootDocs = /^(?:AGENTS|CLAUDE|README|CONTRIBUTING)\.md$/;
const prose = /\.(?:md|txt|rst|adoc)$/i;
const isDoc = file => rootDocs.test(file) || (governance.test(file) && prose.test(file));

function changedFiles() {
  if (!hash.test(base) || !hash.test(head)) return [];
  const ancestor = git("merge-base", base, head).trim();
  if (!ancestor) return [];
  return git("diff", "--no-renames", "--name-only", "-z", ancestor, head).split("\0").filter(Boolean);
}

// GitHub-style heading slugs: lowercase, drop punctuation, spaces to hyphens,
// repeated headings get -1, -2 suffixes. shortcut: no full unicode slugger.
function anchors(text) {
  const found = [];
  const counts = new Map();
  let fence = null;
  for (const line of text.split("\n")) {
    const opens = /^(?:```|~~~)/.exec(line.trim());
    if (opens) fence = fence && opens[0].startsWith(fence) ? null : opens[0];
    if (fence) continue;
    const heading = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!heading) continue;
    let slug = heading[1].toLowerCase()
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim().replace(/\s/g, "-"); // GitHub creates one hyphen per space after punctuation is removed.
    if (!slug) continue;
    const seen = counts.get(slug) || 0;
    counts.set(slug, seen + 1);
    if (seen) slug = `${slug}-${seen}`;
    found.push(slug);
  }
  return found;
}

function collectLinks(text) {
  const inline = [];
  const references = [];
  const definitions = new Map();
  let fence = null;
  text.split("\n").forEach((line, index) => {
    const opens = /^(?:```|~~~)/.exec(line.trim());
    if (opens) fence = fence && opens[0].startsWith(fence) ? null : opens[0];
    if (fence) return;
    const lineNo = index + 1;
    const def = /^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]*)>|(\S+))(?:\s+"[^"]*")?\s*$/.exec(line.trim());
    if (def) definitions.set(def[1].toLowerCase(), (def[2] ?? def[3] ?? "").trim());
    for (const m of line.matchAll(/!?\[(?:[^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]+))(?:\s+"[^"]*")?\s*\)/g)) {
      inline.push({ target: (m[1] || m[2] || "").trim(), line: lineNo });
    }
    for (const m of line.matchAll(/\[(?:[^\]]*)\]\[([^\]]+)\]/g)) references.push({ ref: m[1].toLowerCase(), line: lineNo });
  });
  return { inline, references, definitions };
}

function checkTarget(file, line, target, report, ownAnchors) {
  if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(target) || target.startsWith("/")) return; // external or site route
  if (target.startsWith("#")) {
    if (!ownAnchors.has(decodeURIComponent(target.slice(1)))) report.push(`${file}:${line} broken anchor ${target}`);
    return;
  }
  const [rawPath, rawAnchor = ""] = target.split("#");
  const path = normalize(join(dirname(file), decodeURIComponent(rawPath)));
  if (!existsSync(path)) {
    report.push(`${file}:${line} broken link ${target}`);
    return;
  }
  if (rawAnchor && /\.(?:md|rst|adoc)$/i.test(path)) {
    const targetAnchors = new Set(anchors(readFileSync(path, "utf8")));
    if (!targetAnchors.has(decodeURIComponent(rawAnchor))) report.push(`${file}:${line} broken anchor ${target}`);
  }
}

function checkFile(file, report) {
  if (!/\.(?:md|rst|adoc)$/i.test(file) || !existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  const ownAnchors = new Set(anchors(text));
  const { inline, references, definitions } = collectLinks(text);
  for (const link of inline) checkTarget(file, link.line, link.target, report, ownAnchors);
  for (const link of references) {
    const definition = definitions.get(link.ref);
    if (definition === undefined) report.push(`${file}:${link.line} undefined reference [${link.ref}]`);
    else checkTarget(file, link.line, definition, report, ownAnchors);
  }
}

const report = [];
try {
  for (const file of changedFiles().filter(isDoc)) checkFile(resolve(file), report);
} catch (error) {
  console.error(`::error::docs validation failed: ${error.message}`);
  process.exit(1);
}
if (report.length) {
  for (const problem of report) console.error(`::error::${problem}`);
  process.exit(1);
}
console.log("Docs validation PASS: changed documentation files resolve.");
