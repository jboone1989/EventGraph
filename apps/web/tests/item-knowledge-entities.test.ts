import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The "关联知识实体" block on a report page: lazy, failure-isolated, and never a guess.
const block = readFileSync(new URL("../app/features/item/ItemKnowledgeEntities.tsx", import.meta.url), "utf8");
const item = readFileSync(new URL("../app/routes/item.tsx", import.meta.url), "utf8");

test("the block sits with the explainer and the event, on every report page", () => {
  assert.match(item, /import \{ ItemKnowledgeEntities \} from "\.\.\/features\/item\/ItemKnowledgeEntities";/);
  const placed = item.indexOf("<ItemKnowledgeEntities itemId={item.id} />");
  const event = item.indexOf("<EventContext story={item.story}");
  assert.ok(placed > event, "after 所属事件");
  const explainer = item.indexOf("{item.explanation && <ItemExplainer");
  assert.ok(placed > explainer, "after 新闻解读");
});

test("loading, disabled and not_ingested never show a section or placeholder", () => {
  // Only final responses except disabled/not_ingested may render the section.
  assert.match(block, /\{result && result\.status !== "disabled" && result\.status !== "not_ingested" && \(/);
  assert.doesNotMatch(block, /尚未建立知识实体关联|Knowledge entities not yet linked/);
  assert.doesNotMatch(block, /skeleton|Skeleton/);
  // A failed or 404 answer leaves the block away; it is never shown as "no entities".
  assert.match(block, /\.then\(\(body: ItemKnowledgeEntitiesResponse \| null\) => \{/);
  assert.match(block, /if \(body && !controller\.signal\.aborted\) setResult\(body\);/);
});

test("the request is lazy, cancellable and never repeats on its own", () => {
  assert.match(block, /new IntersectionObserver\(\(entries\) => \{/);
  assert.match(block, /rootMargin: "500px"/);
  assert.match(block, /new AbortController\(\)/);
  assert.match(block, /if \(started\) return;/);
  assert.match(block, /observer\?\.disconnect\(\); controller\.abort\(\);/);
  // The only re-request is the reader's own retry click on an unavailable graph.
  assert.match(block, /onClick=\{\(\) => setAttempt\(attempt \+ 1\)\}/);
});

test("chips link to the existing entity profiles in both editions", () => {
  assert.match(block, /to=\{\(en \? englishPath\(`\/knowledge\/entity\/\$\{encodeURIComponent\(entity\.key\)\}`\) : null\) \?\? `\/knowledge\/entity\/\$\{encodeURIComponent\(entity\.key\)\}`\}/);
  assert.match(block, /import \{ Link \} from "react-router";/);
});

test("entity names wrap instead of squeezing the layout", () => {
  assert.match(block, /className="chip h-auto max-w-full items-start py-\[3px\] text-left leading-snug"/);
  assert.match(block, /<span className="min-w-0 break-words">\{entity\.name\}<\/span>/);
  assert.match(block, /flex flex-wrap gap-1\.5/);
});

test("each state carries its own bilingual copy, and truncation says how many are left out", () => {
  assert.match(block, /t\("关联知识实体", "Related entities"\)/);
  assert.match(block, /t\("暂无关联知识实体", "No related knowledge entities"\)/);
  assert.match(block, /t\("知识图谱暂不可用", "Knowledge graph temporarily unavailable"\)/);
  assert.match(block, /另有 \$\{result\.totalCount - result\.entities\.length\} 个实体未展示/);
  assert.match(block, /more \$\{result\.totalCount - result\.entities\.length === 1 \? "entity" : "entities"\} not shown/);
});
