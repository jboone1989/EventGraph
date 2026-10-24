// AdSense readiness preflight (specs/002-adsense-readiness FR-001/FR-003): the policy pages must be
// filled in and a public contact email must exist before anything ships or is submitted for review.
// Run locally and in CI: npm run adsense:preflight — exits 1 listing every violation.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["site/pages/privacy.md", "site/pages/privacy.en.md", "site/pages/terms.md", "site/pages/terms.en.md"];
const PLACEHOLDERS = [
  "请填写", "请写明", "开源框架自带的模板",
  "To be filled", "State a contact address", "State which uses you allow", "to-be-completed",
];

const { SITE } = await import(pathToFileURL(path.join(root, "site/site.ts")).href);

const problems = [];
for (const page of PAGES) {
  const text = await readFile(path.join(root, page), "utf8");
  for (const needle of PLACEHOLDERS) {
    if (text.includes(needle)) problems.push(`${page}: contains placeholder "${needle}"`);
  }
}
if (!SITE.contactEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(SITE.contactEmail)) {
  problems.push("site/site.ts: SITE.contactEmail is empty or not an email address");
}

if (problems.length > 0) {
  console.error(`adsense-preflight: ${problems.length} problem(s) — fix before deploy or review`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("adsense-preflight: policy pages filled, contact email set — OK");
