// Dynamic source lifecycle (specs/007-dynamic-source-lifecycle/spec.md): candidate preflight, trial
// scoring and promotion decisions. Nothing here runs on its own — no cron, no queue job; an operator
// script or a future discovery channel calls these functions. DeepSeek discovery is the next stage
// (PR#132's deepseekSearch): SourceDiscoverer below is where it wires in, and until then the only
// registration channel is "operator". Auto actions stay dry-run until the sourceLifecycle.autoPromote
// setting is enabled.
import { z } from "zod";
import { audit } from "../audit.ts";
// admin is the top layer: it may import the collectors below, and this lifecycle is an operator
// control-plane concern (it decides which sources exist), not a collection concern.
import { createSource, findDuplicateSource, previewSource, sourceIdentity, updateSource } from "./sources.ts";
import { sql, type Db } from "../db.ts";
import { budgetMessage } from "../providers/receipts.ts";
import { unsupportedConfig } from "../sources/config-keys.ts";

export const CANDIDATE_KINDS = ["rss", "json_list"] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

/** Lifecycle states a candidate moves through; rejected/demoted/retired/promoted/preflight_failed are terminal for the auto chain. */
export const CANDIDATE_STATUSES = ["discovered", "preflight_failed", "trial", "promoted", "demoted", "retired", "rejected"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** First collection stays small: no candidate may re-run a publisher's history. */
export const BACKFILL_LIMIT_MAX = 8;
/** Days before a trial is first judged, and when it must have shown enough to stay. */
export const MIN_TRIAL_DAYS = 7;
export const PROMOTE_SCORE = 70;
export const DEMOTE_SCORE = 40;
/** Share of items this source delivered first; below this a candidate must earn its place another way. */
export const EXCLUSIVE_PROMOTE = 0.2;

export const SOURCE_KIND_BY_CANDIDATE_KIND: Record<CandidateKind, "rss" | "json_list"> = {
  rss: "rss", json_list: "json_list",
};

const utcInstant = (v: unknown): boolean =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) && Number.isFinite(Date.parse(v));

export const DiscoveryInput = z.object({
  /** Coverage-gap tags (the audit's uncovered domains) steering what to look for. */
  gapTags: z.array(z.string().min(1).max(60)).max(20),
  /** Titles of currently active event groups: a breaking event asks for its region's sources. */
  activeTopics: z.array(z.string().min(1).max(200)).max(20),
}).strict();
export type DiscoveryInput = z.infer<typeof DiscoveryInput>;

/** One publisher-domain source a discovery channel proposes. Not trusted: it is a lead, not a fact. */
export const DiscoveredSource = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,76}$/),
  origin: z.object({ channel: z.enum(["deepseek", "operator", "breaking_event"]), note: z.string().max(500).optional() }).strict(),
  kind: z.enum(CANDIDATE_KINDS),
  name: z.string().min(1).max(200),
  config: z.record(z.string(), z.unknown()),
  tags: z.array(z.string().min(1).max(60)).min(1).max(30),
  /** Why we want it: the gap or active event it addresses. Kept for every later decision. */
  rationale: z.string().min(1).max(1000),
  /** Official publishers (sanctions bodies, regulators) publish rarely; volume never retires them. */
  officialLowFrequency: z.boolean().default(false),
  /** A breaking-event source stops being wanted when the event does; required for that channel. */
  expiresAt: z.string().datetime().optional(),
}).strict();
export type DiscoveredSource = z.infer<typeof DiscoveredSource>;

/**
 * Where DeepSeek Search plugs in (PR#132): one daily run per gap set, paid through the deepseek_web
 * budget and receipts there. Until that lands the only implementation is an operator list — an empty
 * discoverer here would only pretend to work.
 */
export type SourceDiscoverer = (input: DiscoveryInput) => Promise<DiscoveredSource[]>;

export interface PreflightResult {
  ok: boolean;
  /** Machine-readable refusals, kept in source_candidates.preflight for the audit trail. */
  reasons: string[];
  identity: string | null;
}

/** The checks every candidate passes before it may be previewed or trialled (spec §P). Pure. */
export function preflightCandidate(c: DiscoveredSource): PreflightResult {
  const reasons: string[] = [];
  const identity = sourceIdentity(SOURCE_KIND_BY_CANDIDATE_KIND[c.kind], c.config);
  if (!identity) reasons.push("identity");
  let unsupported: string[] = [];
  try {
    unsupported = unsupportedConfig(SOURCE_KIND_BY_CANDIDATE_KIND[c.kind], c.config);
  } catch {
    unsupported = ["kind"];
  }
  if (unsupported.length) reasons.push(`unsupported-config:${unsupported.join(",")}`);
  const address = String(c.config.feedUrl ?? c.config.url ?? "");
  try {
    const u = new URL(address);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) reasons.push("address");
  } catch {
    reasons.push("address");
  }
  const backfill = (c.config._aihot as Record<string, unknown> | undefined)?.initialBackfillLimit;
  if (typeof backfill !== "number" || !Number.isInteger(backfill) || backfill < 1 || backfill > BACKFILL_LIMIT_MAX) reasons.push("backfill-limit");
  if (!utcInstant(c.config.publishedAfter)) reasons.push("published-after");
  if (c.origin.channel === "breaking_event" && !c.expiresAt) reasons.push("expires-at");
  if (c.officialLowFrequency && c.origin.channel !== "operator") reasons.push("official-requires-operator-verification");
  return { ok: reasons.length === 0, reasons, identity };
}

/** Trial evidence measured from the existing tables, one query per candidate (spec §E). */
export interface TrialEvidence {
  trialDays: number;
  runs: number;
  failed: number;
  items: number;
  dated: number;
  /** Items whose identity_key no other source had delivered earlier: the dedupe rate's numerator. */
  exclusive: number;
  selected: number;
  everOutput: boolean;
  healthFailing: boolean;
}

export interface Decision {
  action: "promote" | "demote" | "retire" | "keep";
  score: number;
  reasons: string[];
}

const share = (n: number, d: number) => (d > 0 ? n / d : 0);

/** The six-dimension score (spec §E): exclusive 30, coverage 25, timeliness 15, reliability 15, selection 10, cost 5. */
export function scoreCandidate(e: TrialEvidence, uncoveredTags: number): number {
  const exclusive = share(e.exclusive, e.items);
  let score = 30 * exclusive;
  score += uncoveredTags >= 3 ? 25 : uncoveredTags === 2 ? 18 : uncoveredTags === 1 ? 10 : 0;
  score += 15 * share(e.dated, e.items);
  score += 15 * (e.runs > 0 ? 1 - share(e.failed, e.runs) : 0);
  score += 10 * share(e.selected, e.items);
  if (e.items > 0) score += share(e.items, Math.max(e.runs, 1)) >= 1 ? 5 : share(e.items, Math.max(e.runs, 1)) >= 0.5 ? 3 : 1;
  return Math.round(score);
}

/**
 * Hard rules first, score second (spec §E). An official low-frequency publisher is never demoted or
 * retired for quiet output — only technical failure or a human ends it. A manual hold freezes the
 * auto chain entirely.
 */
export function decideCandidate(
  flags: { status: CandidateStatus; officialLowFrequency: boolean; manualHold: boolean; expiresAt: Date | null; previewPassed: boolean; now?: Date },
  e: TrialEvidence,
  uncoveredTags: number,
): Decision {
  const score = scoreCandidate(e, uncoveredTags);
  const exclusive = share(e.exclusive, e.items);
  if (flags.manualHold) return { action: "keep", score, reasons: ["manual-hold"] };
  if (flags.status !== "trial") return { action: "keep", score, reasons: ["not-in-trial"] };
  if (flags.officialLowFrequency) {
    if (e.healthFailing && e.trialDays >= MIN_TRIAL_DAYS) return { action: "retire", score, reasons: ["official-failing"] };
    if (exclusive >= EXCLUSIVE_PROMOTE && score >= PROMOTE_SCORE && flags.previewPassed) return { action: "promote", score, reasons: ["official-earning-editorial"] };
    return { action: "keep", score, reasons: ["official-low-frequency-protected"] };
  }
  const expired = flags.expiresAt !== null && flags.expiresAt <= (flags.now ?? new Date());
  if (expired) {
    return exclusive >= EXCLUSIVE_PROMOTE && flags.previewPassed
      ? { action: "promote", score, reasons: ["breaking-event-proved-itself"] }
      : { action: "retire", score, reasons: ["breaking-event-over"] };
  }
  if (!e.everOutput && e.trialDays >= MIN_TRIAL_DAYS) return { action: "retire", score, reasons: ["no-output"] };
  if (e.healthFailing && e.trialDays >= MIN_TRIAL_DAYS) return { action: "retire", score, reasons: ["failing"] };
  if (exclusive < EXCLUSIVE_PROMOTE && uncoveredTags === 0 && e.trialDays >= MIN_TRIAL_DAYS) return { action: "demote", score, reasons: ["pure-duplicate"] };
  if (e.trialDays < MIN_TRIAL_DAYS) return { action: "keep", score, reasons: ["trial-too-young"] };
  if (score >= PROMOTE_SCORE && exclusive >= EXCLUSIVE_PROMOTE && flags.previewPassed) return { action: "promote", score, reasons: ["score"] };
  if (score < DEMOTE_SCORE) return { action: "demote", score, reasons: ["score"] };
  return { action: "keep", score, reasons: ["watch"] };
}

export interface CandidateRow {
  id: string;
  identity: string;
  status: CandidateStatus;
  origin_channel: "deepseek" | "operator" | "breaking_event";
  origin_note: string | null;
  kind: CandidateKind;
  name: string;
  config: Record<string, unknown>;
  tags: string[];
  rationale: string;
  official_low_frequency: boolean;
  manual_hold: boolean;
  expires_at: Date | null;
  attached_source_id: string | null;
  trial_started_at: Date | null;
  created_at: Date | null;
  preflight: { ok?: boolean; reasons?: string[]; previewPassed?: boolean; previewCount?: number; previewDated?: number };
  last_decision: string | null;
  last_decision_at: Date | null;
  last_score: Record<string, unknown> | null;
}

export interface RegisteredCandidate {
  id: string;
  status: CandidateStatus;
  preflightReasons: string[];
  duplicateOf?: { id: string; name: string };
}


/** Register discovery output: validate, preflight, dedupe against sources and candidates, persist. */
export async function registerCandidates(input: { candidates: unknown[]; actor: string; db?: Db }): Promise<RegisteredCandidate[]> {
  const db = input.db ?? sql;
  const out: RegisteredCandidate[] = [];
  for (const raw of input.candidates) {
    const c = DiscoveredSource.parse(raw);
    const pre = preflightCandidate(c);
    if (!pre.ok) {
      await db`INSERT INTO source_candidates (id, identity, status, origin_channel, origin_note, kind, name, config, tags, rationale,
          official_low_frequency, expires_at, preflight)
        VALUES (${c.id}, ${pre.identity ?? `invalid:${c.id}`}, 'preflight_failed', ${c.origin.channel}, ${c.origin.note ?? null}, ${c.kind},
          ${c.name}, ${db.json(c.config as never)}, ${c.tags}, ${c.rationale}, ${c.officialLowFrequency},
          ${c.expiresAt ? new Date(c.expiresAt) : null}, ${db.json({ ok: false, reasons: pre.reasons } as never)})
        ON CONFLICT DO NOTHING`;
      out.push({ id: c.id, status: "preflight_failed", preflightReasons: pre.reasons });
      continue;
    }
    const dup = await findDuplicateSource(SOURCE_KIND_BY_CANDIDATE_KIND[c.kind], c.config, undefined, db);
    if (dup) {
      await db`INSERT INTO source_candidates (id, identity, status, origin_channel, origin_note, kind, name, config, tags, rationale,
          official_low_frequency, expires_at, preflight)
        VALUES (${c.id}, ${pre.identity}, 'preflight_failed', ${c.origin.channel}, ${c.origin.note ?? null}, ${c.kind},
          ${c.name}, ${db.json(c.config as never)}, ${c.tags}, ${c.rationale}, ${c.officialLowFrequency},
          ${c.expiresAt ? new Date(c.expiresAt) : null}, ${db.json({ ok: false, reasons: ["duplicate-source"], duplicate: dup.id } as never)})
        ON CONFLICT DO NOTHING`;
      out.push({ id: c.id, status: "preflight_failed", preflightReasons: ["duplicate-source"], duplicateOf: { id: dup.id, name: dup.name } });
      continue;
    }
    const [row] = await db<{ id: string }[]>`
      INSERT INTO source_candidates (id, identity, status, origin_channel, origin_note, kind, name, config, tags, rationale,
          official_low_frequency, expires_at, preflight)
      VALUES (${c.id}, ${pre.identity}, 'discovered', ${c.origin.channel}, ${c.origin.note ?? null}, ${c.kind},
        ${c.name}, ${db.json(c.config as never)}, ${c.tags}, ${c.rationale}, ${c.officialLowFrequency},
        ${c.expiresAt ? new Date(c.expiresAt) : null}, ${db.json({ ok: true, reasons: [] } as never)})
      ON CONFLICT DO NOTHING RETURNING id`;
    if (!row) {
      // Never claim "discovered" unless an actual discovered row exists.
      // Preflight failures retain their identity so operators can correct and re-submit.
      const [existing] = await db<{ id: string; status: CandidateStatus }[]>`
        SELECT id, status FROM source_candidates WHERE identity = ${pre.identity} OR id = ${c.id}
        ORDER BY (id = ${c.id}) DESC LIMIT 1`;
      out.push({ id: existing?.id ?? c.id, status: existing?.status ?? "preflight_failed",
        preflightReasons: [existing?.id === c.id ? "duplicate-candidate-id" : "duplicate-candidate-identity"] });
      continue;
    }
    await audit(input.actor, "sourceLifecycle.register", `candidate:${c.id}`, null, null,
      { origin: c.origin, kind: c.kind, name: c.name, identity: pre.identity, rationale: c.rationale }, { db });
    out.push({ id: c.id, status: "discovered", preflightReasons: [] });
  }
  return out;
}

/** Record a previewSource() outcome; only a passed preview may enter a trial (spec §V). */
export async function markPreviewed(id: string, preview: { ok: boolean; count: number; dated: number; actor: string; db?: Db }): Promise<boolean> {
  const db = preview.db ?? sql;
  const [row] = await db`UPDATE source_candidates
    SET preflight = preflight || ${db.json({ previewPassed: preview.ok, previewCount: preview.count, previewDated: preview.dated } as never)},
        updated_at = now()
    WHERE id = ${id} AND status = 'discovered' RETURNING id`;
  if (!row) return false;
  await audit(preview.actor, "sourceLifecycle.preview", `candidate:${id}`, null, null,
    { previewPassed: preview.ok, previewCount: preview.count, previewDated: preview.dated }, { db });
  return true;
}

/** Run the existing collector preview before accepting a newly discovered source.
 * No article writes; paid DeepSeek previews still obey receipts and finite budgets.
 */
export async function previewCandidate(id: string, actor: string, db: Db = sql): Promise<{ passed: boolean; count: number; dated: number; error?: string }> {
  const [row] = await db<CandidateRow[]>`SELECT * FROM source_candidates WHERE id = ${id}`;
  if (!row || row.status !== "discovered") return { passed: false, count: 0, dated: 0, error: "candidate-not-discovered" };
  if (row.manual_hold) return { passed: false, count: 0, dated: 0, error: "manual-hold" };
  try {
    const sample = await previewSource({ id: row.id, kind: row.kind, config: row.config } as never);
    const dated = sample.items.filter(item => item.publishedAt !== null).length;
    const passed = sample.count > 0 && dated > 0;
    await markPreviewed(id, { ok: passed, count: sample.count, dated, actor, db });
    return { passed, count: sample.count, dated };
  } catch (error) {
    await markPreviewed(id, { ok: false, count: 0, dated: 0, actor, db });
    return { passed: false, count: 0, dated: 0, error: String(error).slice(0, 220) };
  }
}

/** Whether auto actions may run at all; off unless the settings key says otherwise. */
export async function lifecycleEnabled(db: Db = sql): Promise<boolean> {
  const [row] = await db<{ value: { enabled?: boolean } }[]>`SELECT value FROM settings WHERE key = 'sourceLifecycle.autoPromote'`;
  return row?.value?.enabled === true;
}

/**
 * Create the trial source through the regular createSource (duplicate checks, audit) and attach it:
 * T2 hot_signal, hourly, fulltext rights off. No preview ever passed → no source, no exceptions.
 */
export async function startTrial(id: string, actor: string, db: Db = sql): Promise<{ started: boolean; sourceId?: string; reason?: string }> {
  const [c] = await db<CandidateRow[]>`SELECT * FROM source_candidates WHERE id = ${id}`;
  if (!c) return { started: false, reason: "unknown-candidate" };
  if (c.status !== "discovered") return { started: false, reason: `status:${c.status}` };
  if (!c.preflight.previewPassed) return { started: false, reason: "preview-not-passed" };
  if (c.manual_hold) return { started: false, reason: "manual-hold" };
  const sourceId = `lc-${id}`;
  let attachedId: string;
  try {
    const created = await createSource({
      id: sourceId, name: c.name, kind: c.kind,
      // Future-only trial: never bulk-ingest previously published items.
      config: { ...c.config, publishedAfter: new Date(Math.max(Date.parse(String(c.config.publishedAfter)), Date.now())).toISOString() },
      tier: "T2", participation_mode: "hot_signal",
      interval_minutes: 60, tags: [...new Set([...c.tags, "lifecycle-trial"])],
      site_fulltext: false, syndicate_fulltext: false,
    }, actor);
    if (!created.created) return { started: false, reason: `duplicate-source:${created.duplicate.id}` };
    attachedId = created.source.id;
  } catch (error) {
    // An interrupted run might have created the source but failed before
    // attaching it to its candidate. A retry is safe if the existing source
    // has exactly the same normalized identity and trial purpose.
    const [existing] = await db<{ id: string; kind: string; config: Record<string, unknown>;
      tier: string; participation_mode: string }[]>`
      SELECT id, kind, config, tier, participation_mode FROM sources WHERE id = ${sourceId}`;
    if (!existing || existing.tier !== "T2" || existing.participation_mode !== "hot_signal" ||
        sourceIdentity(existing.kind, existing.config) !== c.identity) {
      return { started: false, reason: `create-source-conflict:${String((error as Error).message ?? error).slice(0, 140)}` };
    }
    attachedId = existing.id;
  }
  const [attached] = await db<{ id: string }[]>`
    UPDATE source_candidates SET status = 'trial', attached_source_id = ${attachedId},
      trial_started_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'discovered' RETURNING id`;
  if (!attached) return { started: false, reason: "candidate-status-changed" };
  await audit(actor, "sourceLifecycle.startTrial", `candidate:${id}`, null,
    { status: "discovered" }, { status: "trial", sourceId: attachedId }, { db });
  return { started: true, sourceId: attachedId };
}

const spentBudget = sql`LIKE ${budgetMessage("%", "%")}`;

interface EvidenceRow {
  runs: number; failed: number; items: number; dated: number; exclusive: number; selected: number;
  ever_output: boolean; failing: boolean; uncovered_tags: number;
}

async function trialEvidence(c: CandidateRow, now: Date, db: Db): Promise<TrialEvidence & { uncoveredTags: number }> {
  const since = c.trial_started_at ?? c.created_at ?? now;
  const [e] = await db<EvidenceRow[]>`
    WITH runs AS (
      SELECT count(*) FILTER (WHERE status IN ('ok','failed') AND coalesce(error,'') NOT ${spentBudget})::int AS runs,
             count(*) FILTER (WHERE status = 'failed' AND coalesce(error,'') NOT ${spentBudget})::int AS failed
      FROM fetch_runs WHERE source_id = ${c.attached_source_id} AND started_at >= ${since}
    ), seen AS (
      -- What the trial delivered: articles it owns plus articles another source owned that it also
      -- found (article_discoveries). One real-world item is one row either way.
      SELECT a.id, a.identity_key, a.discovered_at, a.published_at FROM articles a
      WHERE a.source_id = ${c.attached_source_id} AND a.discovered_at >= ${since}
      UNION
      SELECT a.id, a.identity_key, d.discovered_at, a.published_at FROM article_discoveries d
      JOIN articles a ON a.id = d.article_id
      WHERE d.source_id = ${c.attached_source_id} AND d.discovered_at >= ${since}
    ), items AS (
      SELECT count(DISTINCT identity_key)::int AS items,
             count(DISTINCT identity_key) FILTER (WHERE published_at IS NOT NULL)::int AS dated FROM seen
    ), exclusive AS (
      -- Identity keys this source delivered first: no other source had the same item earlier.
      SELECT count(DISTINCT a.identity_key)::int AS n FROM articles a
      WHERE a.source_id = ${c.attached_source_id} AND a.discovered_at >= ${since}
        AND NOT EXISTS (SELECT 1 FROM articles b WHERE b.identity_key = a.identity_key AND b.source_id <> a.source_id AND b.discovered_at < a.discovered_at)
    ), selected AS (
      SELECT count(*)::int AS n FROM publications p JOIN articles a ON a.id = p.article_id
      WHERE a.source_id = ${c.attached_source_id} AND p.selected AND a.discovered_at >= ${since}
    ), covered AS (
      -- The trial source itself carries the candidate's tags; coverage must not be proven by it.
      SELECT DISTINCT unnest(tags) AS tag FROM sources WHERE enabled AND id <> ${c.attached_source_id}
    )
    SELECT r.runs, r.failed, i.items, i.dated, x.n AS exclusive, s.n AS selected,
      (EXISTS (SELECT 1 FROM articles h WHERE h.source_id = ${c.attached_source_id})
        OR EXISTS (SELECT 1 FROM article_discoveries h WHERE h.source_id = ${c.attached_source_id})) AS ever_output,
      (${c.attached_source_id} IN (SELECT id FROM sources WHERE health = 'failing')) AS failing,
      (SELECT count(*)::int FROM unnest(${c.tags}::text[]) t WHERE t NOT LIKE 'lifecycle-%' AND NOT EXISTS (SELECT 1 FROM covered cv WHERE cv.tag = t)) AS uncovered_tags
    FROM runs r, items i, exclusive x, selected s`;
  return {
    trialDays: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000)),
    runs: e?.runs ?? 0, failed: e?.failed ?? 0, items: e?.items ?? 0, dated: e?.dated ?? 0,
    exclusive: e?.exclusive ?? 0, selected: e?.selected ?? 0,
    everOutput: e?.ever_output ?? false, healthFailing: e?.failing ?? false,
    uncoveredTags: e?.uncovered_tags ?? 0,
  };
}

export interface Evaluation {
  id: string;
  decision: Decision;
  /** Whether the action was actually applied; false means dry-run (autoPromote disabled) or no-op. */
  applied: boolean;
  evidence: TrialEvidence & { uncoveredTags: number };
}

/**
 * Evaluate one candidate in trial and apply the decision when allowed. With sourceLifecycle.autoPromote
 * off (the default) this only records the decision on the candidate row. Promotion goes through
 * updateSource so the hot_signal→editorial switch keeps its re-adjudication semantics.
 */
export async function evaluateCandidate(id: string, opts: { actor?: string; now?: Date; db?: Db }): Promise<Evaluation | null> {
  const db = opts.db ?? sql;
  const actor = opts.actor ?? "system:source-lifecycle";
  const now = opts.now ?? new Date();
  const [c] = await db<CandidateRow[]>`SELECT * FROM source_candidates WHERE id = ${id}`;
  if (!c || !c.attached_source_id) return null;
  const evidence = await trialEvidence(c, now, db);
  const decision = decideCandidate(
    { status: c.status, officialLowFrequency: c.official_low_frequency, manualHold: c.manual_hold,
      expiresAt: c.expires_at, previewPassed: c.preflight.previewPassed === true, now },
    evidence, evidence.uncoveredTags,
  );
  // A terminal decision or an operator hold must not be overwritten by a
  // subsequent read-only evaluation returning "keep/not-in-trial".
  if (c.status !== "trial" || c.manual_hold) return { id, decision, applied: false, evidence };
  const enabled = await lifecycleEnabled(db);
  let applied = false;
  if (enabled && decision.action !== "keep") {
    const [src] = await db<{ updated_at: Date }[]>`SELECT updated_at FROM sources WHERE id = ${c.attached_source_id}`;
    if (src) {
      if (decision.action === "promote") {
        await updateSource(c.attached_source_id, { patch: { participation_mode: "editorial" }, version: new Date(src.updated_at).toISOString(), reason: `lifecycle promote: ${decision.reasons.join(",")}` }, actor);
        await db`UPDATE source_candidates SET status = 'promoted', last_decision = 'promote', last_decision_at = now(),
            last_score = ${db.json(decision as never)}, updated_at = now() WHERE id = ${id}`;
      } else {
        await updateSource(c.attached_source_id, { patch: { enabled: false }, version: new Date(src.updated_at).toISOString(), reason: `lifecycle ${decision.action}: ${decision.reasons.join(",")}` }, actor);
        await db`UPDATE source_candidates SET status = ${decision.action === "demote" ? "demoted" : "retired"},
            last_decision = ${decision.action}, last_decision_at = now(), last_score = ${db.json(decision as never)}, updated_at = now() WHERE id = ${id}`;
      }
      applied = true;
    }
  }
  if (!applied) {
    await db`UPDATE source_candidates SET last_decision = ${decision.action}, last_decision_at = now(),
        last_score = ${db.json(decision as never)}, updated_at = now() WHERE id = ${id}`;
  }
  await audit(actor, "sourceLifecycle.evaluate", `candidate:${id}`, null, null,
    { action: decision.action, applied, score: decision.score, reasons: decision.reasons, evidence }, { db });
  return { id, decision, applied, evidence };
}

/** Freeze or release a candidate for the auto chain; a human decision always wins (spec §O). */
export async function holdCandidate(id: string, hold: boolean, actor: string, reason: string, db: Db = sql): Promise<boolean> {
  const [row] = await db`UPDATE source_candidates SET manual_hold = ${hold}, updated_at = now() WHERE id = ${id} RETURNING id`;
  if (!row) return false;
  await audit(actor, "sourceLifecycle.hold", `candidate:${id}`, reason, { manual_hold: !hold }, { manual_hold: hold }, { db });
  return true;
}
