// The candidate half of the dynamic source lifecycle (specs/007): the operator-facing list and the
// one action the spec reserved for later — reviving an exited source. Preview, trial, evaluation and
// hold stay in admin/lifecycle.ts; this file only reads source_candidates and applies the revival,
// so there is no second decision path.
import type { AdminSourceCandidates, BeforeJson } from "@aihot/contracts/admin";
import { audit } from "../audit.ts";
import { sql } from "../db.ts";
import { updateSource } from "./sources.ts";

export interface CandidateListFilters { status?: string | null; q?: string | null; page?: number }

export async function listCandidates(f: CandidateListFilters): Promise<BeforeJson<AdminSourceCandidates>> {
  const page = Math.max(1, f.page ?? 1);
  const q = f.q?.trim() ? `%${f.q.trim()}%` : null;
  const status = f.status ?? null;
  const [rows, totals] = await Promise.all([
    sql<BeforeJson<AdminSourceCandidates>["rows"]>`
      SELECT c.id, c.name, c.kind, c.status, c.origin_channel, c.origin_note, c.tags, c.rationale,
        c.official_low_frequency, c.manual_hold, c.expires_at, c.attached_source_id, c.trial_started_at,
        c.preflight, c.last_decision, c.last_decision_at, c.last_score, c.created_at, c.updated_at,
        s.enabled AS source_enabled, s.health AS source_health, s.participation_mode AS source_mode
      FROM (
        SELECT * FROM source_candidates
        WHERE (${status}::text IS NULL OR status = ${status})
          AND (${q}::text IS NULL OR name ILIKE ${q} OR id ILIKE ${q} OR identity ILIKE ${q} OR tags::text ILIKE ${q})
        ORDER BY CASE status WHEN 'trial' THEN 0 WHEN 'discovered' THEN 1 ELSE 2 END, updated_at DESC
        LIMIT 100 OFFSET ${(page - 1) * 100}
      ) c
      LEFT JOIN sources s ON s.id = c.attached_source_id
      ORDER BY CASE c.status WHEN 'trial' THEN 0 WHEN 'discovered' THEN 1 ELSE 2 END, c.updated_at DESC`,
    sql<{ status: string; n: number }[]>`SELECT status, count(*)::int AS n FROM source_candidates GROUP BY 1`,
  ]);
  return { page, rows, totals: Object.fromEntries(totals.map((t) => [t.status, t.n])) };
}

/**
 * One-click revival (spec §E/O): a demoted or retired source returns to a fresh trial — the source is
 * re-enabled through the audited updateSource and the candidate's evidence window restarts, so the
 * next evaluation judges it on what it delivers from now on. A manual hold wins over revival.
 */
export async function reviveCandidate(id: string, reason: string, actor: string): Promise<{ revived: boolean; reason?: string }> {
  if (!reason?.trim()) throw Object.assign(new Error("reason is required"), { statusCode: 400 });
  return sql.begin(async (tx) => {
  // Serialize operator actions against this candidate before enabling the attached source.
  const [c] = await tx<{ status: string; attached_source_id: string | null; manual_hold: boolean; expired: boolean }[]>`
    SELECT status, attached_source_id, manual_hold,
      (expires_at IS NOT NULL AND expires_at <= now()) AS expired
    FROM source_candidates WHERE id = ${id} FOR UPDATE`;
  if (!c) return { revived: false, reason: "unknown-candidate" };
  if (c.status !== "demoted" && c.status !== "retired") return { revived: false, reason: `status:${c.status}` };
  if (c.manual_hold) return { revived: false, reason: "manual-hold" };
  // A retired breaking-event source must not be re-enabled after its event expiry.
  // Keep the expiry intact; a fresh event needs a separately bounded trial.
  if (c.expired) return { revived: false, reason: "expired" };
  if (c.attached_source_id) {
    const [src] = await tx<{ updated_at: Date }[]>`SELECT updated_at FROM sources WHERE id = ${c.attached_source_id}`;
    if (!src) return { revived: false, reason: "source-missing" };
    await updateSource(c.attached_source_id, { patch: { enabled: true }, version: new Date(src.updated_at).toISOString(), reason: `lifecycle revive: ${reason}` }, actor, tx);
  }
  const [row] = await tx`UPDATE source_candidates SET status = 'trial', trial_started_at = now(),
      last_decision = 'revived', last_decision_at = now(), updated_at = now()
    WHERE id = ${id} AND status IN ('demoted', 'retired') RETURNING id`;
  if (!row) return { revived: false, reason: "status-changed" };
  await audit(actor, "sourceLifecycle.revive", `candidate:${id}`, reason,
    { status: c.status }, { status: "trial", sourceId: c.attached_source_id }, { db: tx });
  return { revived: true };
  });
}
