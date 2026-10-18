// Sorts a pull request into a review tier from the paths it changes (docs/review-pipeline.md):
// high: deploy, CI, migrations, auth, money and the review rules themselves; low: docs and images only;
// medium: everything else. The tier is the highest tier among the changed paths.
// Usage: node scripts/pr-risk.ts <base-sha> [head-sha]   prints `tier=<tier>`, then each high or medium path.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type Tier = "low" | "medium" | "high";

const HIGH: RegExp[] = [
  /^\.github\/workflows\//,
  /^\.github\/CODEOWNERS$/,
  /^\.github\/security-review\.md$/,
  /^scripts\/pr-risk\.ts$/,
  /^tests\/pr-risk\.standalone\.test\.ts$/,
  /^(REVIEW|CLAUDE|AGENTS)\.md$/,
  /(^|\/)Dockerfile$/,
  /^docker-compose(\.[\w-]+)?\.yml$/,
  /^deploy\//,
  /^scripts\/(deploy-prod|rollback-prod)\.sh$/,
  /^scripts\/production-[\w-]+\.py$/,
  /^scripts\/(migrate|check-migrations|migration-safety)\.ts$/,
  /^config\/environments\//,
  /^\.env\.example$/,
  /^database\/migrations\//,
  /^modules\/[^/]+\/migrations\//,
  /^packages\/backend\/src\/admin\/auth\.ts$/,
  /^apps\/api\/src\/routes\/admin(-auth)?\.ts$/,
  /^packages\/backend\/src\/providers\/receipts\.ts$/,
  /^packages\/backend\/src\/config\.ts$/,
];

const LOW: RegExp[] = [
  /^docs\//,
  /^assets\//,
  /^(README(\.[\w-]+)?|CONTRIBUTING|SECURITY)\.md$/,
  /^(LICENSE|NOTICE)$/,
  /^\.github\/(ISSUE_TEMPLATE\/|pull_request_template\.md$)/,
  /^site\/changelog\.json$/,
];

const RANK: Record<Tier, number> = { low: 0, medium: 1, high: 2 };

export function tierOf(path: string): Tier {
  if (HIGH.some((re) => re.test(path))) return "high";
  if (LOW.some((re) => re.test(path))) return "low";
  return "medium";
}

export function classify(paths: string[]): { tier: Tier; paths: { path: string; tier: Tier }[] } {
  const rated = paths.filter(Boolean).map((path) => ({ path, tier: tierOf(path) }));
  const tier = rated.reduce<Tier>((max, p) => (RANK[p.tier] > RANK[max] ? p.tier : max), "low");
  return { tier, paths: rated.sort((a, b) => RANK[b.tier] - RANK[a.tier] || a.path.localeCompare(b.path)) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [base, head = "HEAD"] = process.argv.slice(2);
  if (!base) {
    console.error("Usage: node scripts/pr-risk.ts <base-sha> [head-sha]");
    process.exit(2);
  }
  const changed = execFileSync("git", ["diff", "--no-renames", "--name-only", `${base}...${head}`], { encoding: "utf8" }).split("\n");
  const { tier, paths } = classify(changed);
  console.log(`tier=${tier}`);
  for (const p of paths) if (p.tier !== "low") console.log(`${p.tier}\t${p.path}`);
}
