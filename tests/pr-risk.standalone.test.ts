import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, tierOf } from "../scripts/pr-risk.ts";

test("deploy, CI, migrations, auth, money and review rules are high", () => {
  for (const path of [
    ".github/workflows/check.yml",
    ".github/security-review.md",
    "scripts/pr-risk.ts",
    "tests/pr-risk.standalone.test.ts",
    "REVIEW.md",
    "Dockerfile",
    "knowledge_service/Dockerfile",
    "docker-compose.production.yml",
    "docker-compose.yml",
    "scripts/deploy-prod.sh",
    "scripts/rollback-prod.sh",
    "scripts/production-smoke.py",
    "config/environments/production.flags.env.example",
    "database/migrations/0106_example.sql",
    "modules/foo/migrations/0001_foo.sql",
    "packages/backend/src/admin/auth.ts",
    "apps/api/src/routes/admin-auth.ts",
    "packages/backend/src/providers/receipts.ts",
  ]) assert.equal(tierOf(path), "high", path);
});

test("docs and images are low, ordinary code is medium", () => {
  for (const path of ["docs/deploy.md", "README.en.md", "assets/brand/logo.png", ".github/pull_request_template.md", "site/changelog.json"]) {
    assert.equal(tierOf(path), "low", path);
  }
  for (const path of ["apps/web/app/root.tsx", "packages/backend/src/publication/hot.ts", "industry/prompts/selection-score.md", "tests/hot.test.ts", "scripts/smoke.ts", "package.json"]) {
    assert.equal(tierOf(path), "medium", path);
  }
});

test("a pull request takes its highest path's tier", () => {
  assert.equal(classify(["docs/deploy.md", "README.md", ""]).tier, "low");
  assert.equal(classify(["docs/deploy.md", "apps/web/app/root.tsx"]).tier, "medium");
  const mixed = classify(["docs/deploy.md", "apps/web/app/root.tsx", "database/migrations/0106_example.sql"]);
  assert.equal(mixed.tier, "high");
  assert.deepEqual(mixed.paths.map((p) => p.tier), ["high", "medium", "low"]);
  assert.equal(classify([]).tier, "low");
});
