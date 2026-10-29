// Runs the item explainer (specs/news-explainer, E-01/E-06 acceptance) against the site's real model
// route for a fixed sample of selected reports and writes the acceptance record: per sample the source
// facts (URL, language, body mode, published time), the input revision and prompt version, the paid
// receipt and the stored explanation. Reads no secrets — the model comes from the configured route
// (EXPLAIN_MODEL / the managed provider registry), everything else is a database read.
//   MODEL_CALLS_ENABLED=true DATABASE_URL=postgres://... EXPLAIN_MODEL=model:<uuid> \
//     node scripts/explain-acceptance.ts [--ids a,b,c] [--zh 6 --en 6] [--out <file>]
// Without --ids the sample is the newest pending selected news reports, six per language, at most one
// per source; prefer a mix of licensed-full and summary-only sources when reporting E-06.
// Default sampling is strict: if six distinct sources per language are unavailable, stop before
// paid calls. Explicit --ids supports focused retests, not an automatic 12-sample signoff.
import { writeFile } from "node:fs/promises";
import { sql, closeDb } from "@aihot/backend/db";
import { explanationCandidateFor, explanationsPending, explainLanguage, explainOne, explainPromptVersion, type ExplainCandidate } from "@aihot/backend/editorial/explain";
import { modelFor } from "@aihot/backend/editorial/models";

const arg = (name: string) => { const at = process.argv.indexOf(`--${name}`); return at > 0 ? process.argv[at + 1] : undefined; };

async function pick(zh: number, en: number): Promise<ExplainCandidate[]> {
  const rows = await explanationsPending({ limit: 300 });
  const bySource = new Set<string>();
  const take: ExplainCandidate[] = [];
  const want: Array<"zh" | "en"> = [];
  for (let i = 0; i < zh; i++) want.push("zh");
  for (let i = 0; i < en; i++) want.push("en");
  for (const language of want) {
    const row = rows.find((r) => explainLanguage(r) === language && !bySource.has(r.source_name));
    if (!row) continue;
    bySource.add(row.source_name);
    take.push(row);
  }
  return take;
}

async function reachable(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (compatible; acceptance-check)" } });
    return res.ok || res.status < 500 ? `HTTP ${res.status}` : `HTTP ${res.status} (error status)`;
  } catch (error) {
    return `unreachable from this host: ${String((error as Error).cause ?? (error as Error).message).slice(0, 120)}`;
  }
}

const model = await modelFor("explain");
const ids = arg("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
const rows: ExplainCandidate[] = [];
for (const id of ids ?? []) {
  const row = await explanationCandidateFor(id);
  if (!row) { console.error(`no selected publication for article ${id}`); process.exitCode = 1; }
  else rows.push(row);
}
const requestedZh = Number(arg("zh") ?? 6);
const requestedEn = Number(arg("en") ?? 6);
if (!ids?.length) rows.push(...(await pick(requestedZh, requestedEn)));

const zhCount = rows.filter((r) => explainLanguage(r) === "zh").length;
const enCount = rows.length - zhCount;
console.log(`model route: ${model} · samples: ${rows.length} (zh ${zhCount}, en ${enCount})`);
if (process.exitCode || rows.length === 0 || (!ids?.length && (zhCount !== requestedZh || enCount !== requestedEn))) {
  console.error(`incomplete acceptance sample: requested zh ${requestedZh}/en ${requestedEn}, found zh ${zhCount}/en ${enCount}; no paid calls started`);
  await closeDb();
  process.exit(1);
}

const sections: string[] = [];
const counts = { written: 0, insufficient_evidence: 0, failed: 0 } as Record<string, number>;
for (const r of rows) {
  const language = explainLanguage(r);
  const started = new Date();
  const res = await explainOne(r);
  counts[res.outcome] = (counts[res.outcome] ?? 0) + 1;
  const [stored] = await sql<{ outcome: string; error: string | null; inputs_hash: string; updated_at: Date }[]>`
    SELECT outcome, error, inputs_hash, updated_at FROM item_explanations WHERE article_id = ${r.article_id}`;
  const [receipt] = await sql<{ id: number; status: string; model: string | null; usage: unknown; updated_at: Date }[]>`
    SELECT id, status, model, usage, updated_at FROM receipts WHERE purpose = 'explain_item' AND subject LIKE ${`article:${r.article_id}#%`} ORDER BY id DESC LIMIT 1`;
  const [detail] = await sql<{ content: unknown }[]>`SELECT content FROM item_explanations WHERE article_id = ${r.article_id} AND outcome = 'written'`;
  const access = await reachable(r.url);
  sections.push(`### ${language!.toUpperCase()} · ${r.source_name} · ${r.article_id}

- 原文：${r.url}
- 原文可访问性（运行时实测）：${access}
- 来源语言：${r.language ?? "(unmarked)"} → 解释语言：${language}（prompt \`${language === "zh" ? "news-explainer" : "news-explainer-en"}\` v${explainPromptVersion(language!).slice(0, 8)}，正文模式：${r.text ? "licensed full" : "summary-only"}）
- 发布时间：${r.published_at?.toISOString() ?? "(none)"}；输入版本：\`${r.hash}\`；本次运行：${started.toISOString()}
- 回执 #${receipt?.id ?? "-"}：status=${receipt?.status ?? "-"} · model=${receipt?.model ?? model} · usage=${JSON.stringify(receipt?.usage ?? null)}
- 存档：outcome=${stored?.outcome ?? "-"}${stored?.error ? ` · error=${JSON.stringify(stored.error)}` : ""}

\`\`\`json
${JSON.stringify(detail?.content ?? null, null, 2)}
\`\`\`
`);
  console.log(`  ${r.article_id} ${language} ${res.outcome}${res.outcome === "failed" ? ` (${res.error})` : ""} receipt #${receipt?.id ?? "-"}`);
}

const out = arg("out") ?? "specs/news-explainer/acceptance-run.md";
await writeFile(out, `# Item explainer acceptance run — ${new Date().toISOString()}

Model route \`${model}\`, run against the managed provider. Each sample records its actual
outcome and receipt if available; halted/skipped attempts are not claimed as paid calls.
Sample: the newest pending selected news reports (one per source) or an explicit
\`--ids\` list. Grounding and language rules: specs/news-explainer D-01–D-04; per-claim audit E-06.

- outcome counts: ${JSON.stringify(counts)}

${sections.join("\n")}
`);
console.log(`acceptance record: ${out}`);
await closeDb();
