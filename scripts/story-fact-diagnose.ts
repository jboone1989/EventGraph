// Read-only T10 evidence audit. Never groups, regroups or modifies Fact identities.
// Usage: node --env-file-if-exists=.env scripts/story-fact-diagnose.ts --story <public-uuid>
import { parseArgs } from "node:util";
import { closeDb, sql } from "@aihot/backend/db";
import { publicStoryRoute } from "@aihot/backend/publication/story-route";
import { storyFactDiagnosis, type DecisionTrace, type Membership, type SourceRecord } from "./story-fact-diagnosis-core.ts";

const { values } = parseArgs({ options: { story: { type: "string" } } });

async function main() {
  const id = values.story;
  if (!id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    throw new Error("--story must be a public Story UUID");
  }
  // Reuse the public read boundary: no private/withdrawn/mention evidence is introduced.
  const route = await publicStoryRoute(id);
  if (!route || route.status !== "ok") throw new Error("No public story evidence for this ID");
  const articleIds = [...new Set(route.stations.flatMap(s => s.reports.map(r => r.articleId)))];
  if (!route.stations.length || !articleIds.length) throw new Error("No public Fact/report pairs");

  const membershipRows = await sql<{
    fact_id: string; article_id: string; role: string; fact_manual: boolean;
    membership_manual: boolean; evidence: string | null;
  }[]>`
    SELECT f.public_id::text AS fact_id, fa.article_id, fa.role, fa.evidence,
      f.manual AS fact_manual, fa.manual AS membership_manual
    FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id
    -- Search every Fact membership for the visible public reports, not only
    -- Fact IDs already in the truncated StoryRoute. This is read-only.
    WHERE fa.article_id IN ${sql(articleIds)}`;
  // Public-route article IDs are the sole scope; source tiers are recorded metadata,
  // not an assertion that an original document was independently verified.
  const sourceRows = await sql<{ article_id: string; tier: string | null; body_mode: "full" | "summary" | null }[]>`
    SELECT p.article_id::text, s.tier, p.body_mode
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.article_id IN ${sql(articleIds)} AND p.visibility = 'public'`;
  const decisions = await sql<{
    id: number; article_id: string; verdict: string; candidates: unknown;
    fact_id: number | null; story_id: number | null; receipt_id: number | null; created_at: Date;
  }[]>`
    SELECT id, article_id, verdict, candidates, fact_id, story_id, receipt_id, created_at FROM (
      SELECT id, article_id, verdict, candidates, fact_id, story_id, receipt_id, created_at,
        row_number() OVER (PARTITION BY article_id ORDER BY id DESC) AS ordinal
      FROM grouping_decisions WHERE article_id IN ${sql(articleIds)}
    ) recent WHERE ordinal <= 5 ORDER BY article_id, id DESC`;
  const memberships: Membership[] = membershipRows.map(m => ({
    factId: m.fact_id, articleId: m.article_id, role: m.role,
    factManual: m.fact_manual, membershipManual: m.membership_manual, evidence: m.evidence,
  }));
  const history: DecisionTrace[] = decisions.map(d => ({
    id: d.id, articleId: d.article_id, verdict: d.verdict, candidates: d.candidates,
    factId: d.fact_id, storyId: d.story_id,
    receiptId: d.receipt_id, createdAt: d.created_at.toISOString(),
  }));
  const sources: SourceRecord[] = sourceRows.map(r => ({
    articleId: r.article_id, tier: r.tier, bodyMode: r.body_mode,
  }));
  console.log(JSON.stringify(storyFactDiagnosis(route, memberships, history, sources), null, 2));
}

try { await main(); } finally { await closeDb(); }
