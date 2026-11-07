import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// Static wiring tests for the canonical admin product+reuse contract
// (docs/admin-ui-reuse.md). They prove the guide, both existing reviewer
// prompts, the Worker and the agent entry documents are connected. They do
// NOT prove what an LLM reviewer decides on a live PR, nor that any admin
// page renders correctly — those stay with real Spec review and browser PRs.

const workflow = readFileSync(".github/workflows/check.yml", "utf8");
const specReview = workflow.split("\n  spec_review:")[1]?.split("\n  check:")[0] ?? "";
const codeReview = workflow.split("\n  claude_review:")[1]?.split("\n  auto_merge_develop:")[0] ?? "";
const workerSource = readFileSync(".github/workflows/eventgraph-worker.md", "utf8").replaceAll("\r\n", "\n");
const workerLock = readFileSync(".github/workflows/eventgraph-worker.lock.yml", "utf8");
const workerBody = workerSource.slice(workerSource.indexOf("\n---\n") + 5);
const agents = readFileSync("AGENTS.md", "utf8");
const constraints = readFileSync(".agents/CONSTRAINTS.md", "utf8");
const guide = readFileSync("docs/admin-ui-reuse.md", "utf8");

test("the guide is the product contract first: dimensions, authorized decisions, examples", () => {
  // Material dimensions a feature Spec must answer (docs guide §1 table).
  for (const dimension of ["目标与范围", "数据与业务语义", "完整交互", "列表/搜索/分页", "状态与反馈", "长数据与响应式", "边界与非目标", "验收证据", "Given/When/Then"]) {
    assert.ok(guide.includes(dimension), `guide must cover ${dimension}`);
  }
  // Business-significant decisions need an explicit authorized basis, never an
  // invented default; the repo's real soft-delete precedent is the evidence.
  assert.match(guide, /有产品后果的决策需要明确授权依据/);
  assert.match(guide, /硬删还是软删/);
  assert.match(guide, /0126_source_soft_delete\.sql/);
  // One deficient "add CRUD" example and one adequate compact example, both
  // explicitly marked as illustrations, not features to implement.
  assert.match(guide, /### 两个示例（只说明完整度，不是要实现的功能）/);
  assert.match(guide, /\*\*不合格\*\*/);
  assert.match(guide, /\*\*合格（紧凑即可，不必长篇）\*\*/);
  assert.match(guide, /不是可验收条件/);
});

test("the guide maps real admin components and does not force pagination everywhere", () => {
  assert.match(guide, /apps\/web\/app\/features\/admin\/ui\.tsx/);
  const ui = readFileSync("apps/web/app/features/admin/ui.tsx", "utf8");
  for (const component of ["AdminPage", "Card", "Stat", "Badge", "DataTable", "Empty", "Button", "ButtonLink", "Field", "Input", "Textarea", "Select", "FilterChips", "Pager", "Json", "ReasonDialog", "KV"]) {
    assert.match(guide, new RegExp(`\\|\\s*\`${component}\`|\\\`${component}\\\``), `guide must map ${component}`);
    assert.ok(new RegExp(`export function ${component}\\b`).test(ui), `ui.tsx must really export ${component}`);
  }
  // Reference implementations the guide points at must exist on this branch.
  for (const path of ["apps/web/app/features/admin/ProviderConnectionsAdmin.tsx", "apps/web/app/routes/admin/sources.tsx", "apps/web/app/routes/admin/audit.tsx", "apps/web/app/routes/admin/feedback.tsx"]) {
    assert.ok(existsSync(path), `guide reference ${path} must exist`);
  }
  // Known limitations are documented instead of pretended away.
  assert.match(guide, /不内置排序\/搜索\/分页/);
  assert.match(guide, /只有方向导航/);
  // Reuse order with external options only on a proven gap; no gratuitous
  // reimplementation, but also no forced pagination for small fixed lists.
  assert.match(guide, /先核对已安装依赖的官方 API/);
  assert.match(guide, /把缺口证据和选型理由写进 `plan\.md`/);
  assert.match(guide, /是独立代码评审的阻断项/);
  assert.match(guide, /短小的固定列表可不分页/);
  // Implementation PRs owe a reuse record and an evidence matrix.
  assert.match(guide, /复用记录/);
  assert.match(guide, /验收矩阵/);
  assert.match(guide, /PASS \/ FAIL \/ UNVERIFIED/);
  assert.match(guide, /没跑过的浏览器验收不得写成已通过/);
});

test("spec-review checks material product contract completeness before technical decisions", () => {
  assert.match(specReview, /Product contract first/);
  assert.match(specReview, /hard vs soft delete/);
  assert.match(specReview, /complete user journey/);
  assert.match(specReview, /loading, empty, failure, no/);
  assert.match(specReview, /Given\/When\/Then or equivalent/);
  assert.match(specReview, /"Tests pass", "UI works"\s+and "implements CRUD" are not testable criteria/);
  assert.match(specReview, /docs\/admin-ui-reuse\.md/);
  // Small fixes are not mechanically blocked for missing irrelevant sections.
  assert.match(specReview, /do not reject small fixes for missing sections irrelevant to the change/);
  // The existing review model, schema and verdict structure stay intact.
  assert.match(specReview, /Return a structured review verdict matching the configured JSON schema/);
  assert.match(specReview, /status FAIL and 1-8 findings/);
  assert.equal((workflow.match(/--json-schema/g) ?? []).length, 2);
});

test("claude-review treats demonstrated bad admin CRUD UX as actionable blockers", () => {
  assert.match(codeReview, /docs\/admin-ui-reuse\.md/);
  assert.match(codeReview, /no meaningful success or error feedback/);
  assert.match(codeReview, /controls that look usable but do\s+nothing/);
  assert.match(codeReview, /unbounded IDs or URLs crushing the columns/);
  assert.match(codeReview, /apps\/web\/app\/features\/admin\/ui\.tsx/);
  assert.match(codeReview, /without a stated reason/);
  assert.match(codeReview, /Do not demand\s+pagination or features the expected data size does not justify/);
  // Unchanged review contract: untrusted diff, no tools, same verdict schema.
  assert.match(codeReview, /UNTRUSTED DATA/);
  assert.match(codeReview, /Do not use tools, edit code, run commands, or post comments/);
  assert.match(codeReview, /status FAIL with 1-8 concrete blockers/);
});

test("the Worker reads the guide and reports acceptance evidence in its PR", () => {
  // Body guidance is runtime-imported by the compiled lock, so it reaches the
  // Worker without recompilation — but the frontmatter must stay hash-identical.
  const frontmatter = workerSource.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  const metadata = JSON.parse(workerLock.split("\n")[0].slice("# gh-aw-metadata: ".length));
  assert.equal(
    createHash("sha256").update(JSON.stringify({ "frontmatter-text": frontmatter })).digest("hex"),
    metadata.frontmatter_hash,
    "worker frontmatter drifted from the compiled lock; only the body may change without gh aw compile",
  );
  assert.match(workerBody, /docs\/admin-ui-reuse\.md/);
  assert.match(workerBody, /Spec completeness → reuse selection → minimal implementation → criterion-by-criterion acceptance/);
  assert.match(workerBody, /stop for an owner decision instead of inventing a default/);
  assert.match(workerBody, /acceptance → implementation → test\/browsing-result matrix/);
  assert.match(workerBody, /what was searched, what was reused, what was missing and why new code was needed/);
});

test("AGENTS.md and .agents/CONSTRAINTS.md link the canonical guide", () => {
  assert.match(agents, /\[docs\/admin-ui-reuse\.md\]\(docs\/admin-ui-reuse\.md\)/);
  assert.match(agents, /Product contract before CRUD/);
  assert.match(constraints, /Product contract before CRUD/);
  assert.match(constraints, /`docs\/admin-ui-reuse\.md`/);
  assert.match(constraints, /acceptance → implementation → test\/browsing-evidence matrix/);
});

// The two fixtures below exercise the material gap criteria the guide defines.
// The tiny detector mirrors the guide's own checklist keywords; it shows the
// deficient sample is distinguishable from a compact sufficient one by the
// same categories the reviewer prompts name. It is a fixture check for the
// guide's examples, not a guarantee of LLM review outcomes or UI rendering.
function materialGaps(spec) {
  const gaps = [];
  if (!/(硬删|软删|删除语义|级联|deleted_at|不删除|仅新增)/.test(spec)) gaps.push("business semantics of destructive operations");
  if (!/(加载|空|失败|无匹配|冲突)/.test(spec)) gaps.push("main states");
  if (!/(Given|When|Then|验收)/.test(spec)) gaps.push("observable acceptance");
  return gaps;
}

test("sample scenarios: an incomplete CRUD Spec is distinguishable, a compact sufficient one is not mechanically blocked", () => {
  const deficient = "给信源管理加 CRUD：支持新增、编辑、删除信源。";
  const gaps = materialGaps(deficient);
  assert.deepEqual(gaps, [
    "business semantics of destructive operations",
    "main states",
    "observable acceptance",
  ]);
  // Every category the detector flags is one the spec-review prompt names.
  for (const gap of gaps) {
    if (gap.includes("business semantics")) assert.match(specReview, /hard vs soft delete/);
    if (gap.includes("states")) assert.match(specReview, /main states/);
    if (gap.includes("acceptance")) assert.match(specReview, /not testable criteria/);
  }
  // Compact but materially complete: passes without template-length padding,
  // so the guide/prompt must not block it for brevity or missing sections.
  const sufficient = [
    "目标：管理员在 /admin/sources 删除错误信源，新闻保留。",
    "语义：按已批准合同软删除（deleted_at 置位、停采集）；确认不要求原因。",
    "路径：URL 分页列表 → 行内删除 → 确认 → 成功后列表刷新；失败保留记录并显示失败原因，冲突提示刷新。",
    "验收：Given 列表有信源 X，When 删除并确认，Then X 消失且刷新后仍消失。",
  ].join("\n");
  assert.deepEqual(materialGaps(sufficient), []);
  assert.match(specReview, /do not reject small fixes for missing sections/);
  assert.match(guide, /不必长篇/);
});
