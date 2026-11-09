// Read-only diagnosis of the published hot ranking, for production release acceptance
// (specs/prod-hot-ranking-release-gate-20261109). An empty hot list is only acceptable when every
// measurement agrees nothing qualifies; this module gathers those measurements through the ranking's
// own queries and the public read layer, reports aggregate counts and timestamps only (no story
// titles, source IDs, credentials or article text), and decides fail-closed. computeHotRanking stays
// the only writer; nothing here writes.
import { HOT_RULE_VERSION, behindSources, eligibleHotRows, heatRows, sourceClocks, storedHotRanking } from "../events/hot.ts";
import { latestHotRanking } from "../publication/hot.ts";

// A published snapshot is fresh for three runs of the 5-minute hot.rank cron (apps/worker/src/schedules.ts).
export const HOT_RANKING_FRESH_MS = 15 * 60_000;

export interface HotDiagnosticSnapshot {
  computedAt: string;
  ruleVersion: string;
  storedEntries: number;
  /** Eligible candidates the ranking job counted at compute time; null when the evidence metadata is missing. */
  candidates: number | null;
}

export interface HotDiagnostic {
  probeAt: string;
  ruleVersion: string;
  snapshot: HotDiagnosticSnapshot | null;
  /** Entries the public read layer still shows (it re-checks every stored entry). */
  publicEntries: number;
  /** Eligible stories recomputed with the actual rules (48 h, MIN_PARTICIPANTS, one editorial). */
  eligible: { now: number; atSnapshot: number | null };
  sources: { scheduled: number; behind: number };
}

export type HotFailureReason =
  | "hot diagnostic payload is malformed"
  | "hot ranking is absent"
  | "hot ranking is stale"
  | "hot rule version is unknown or mismatched"
  | "hot candidate evidence is missing"
  | "hot eligible candidates are not publicly visible"
  | "hot candidate counts disagree with the recomputed rules"
  | "hot publication read layer disagrees with the public API"
  | "hot source collection is behind";

export type HotAcceptance =
  | { accepted: true; verdict: "populated" | "expected sparse window"; diagnostic: HotDiagnostic }
  | { accepted: false; reason: HotFailureReason; detail: string; diagnostic: HotDiagnostic | null };

/** Everything the acceptance decision needs, read once: stored snapshot, public read-layer view,
 * candidates recomputed with the ranking's own rules now and at the snapshot's compute time, and the
 * source-clock lag rule exactly as the ranking applies it. */
export async function readHotRankingDiagnostic(now = new Date()): Promise<HotDiagnostic> {
  const clocks = await sourceClocks();
  const behind = behindSources(clocks, now.getTime(), true);
  const [snapshot, ranking] = await Promise.all([storedHotRanking(), latestHotRanking()]);
  const computedAt = snapshot ? new Date(snapshot.computedAt) : null;
  const [nowRows, snapshotRows] = await Promise.all([
    heatRows(now, behind),
    computedAt ? heatRows(computedAt, behind) : Promise.resolve([]),
  ]);
  const evidence = snapshot?.coverage?.candidates;
  return {
    probeAt: now.toISOString(),
    ruleVersion: HOT_RULE_VERSION,
    snapshot: snapshot && {
      computedAt: snapshot.computedAt,
      ruleVersion: snapshot.ruleVersion,
      storedEntries: snapshot.entries.length,
      candidates: typeof evidence === "number" && Number.isFinite(evidence) ? evidence : null,
    },
    publicEntries: ranking?.entries.length ?? 0,
    eligible: {
      now: eligibleHotRows(nowRows).length,
      atSnapshot: computedAt ? eligibleHotRows(snapshotRows).length : null,
    },
    sources: { scheduled: clocks.length, behind: behind.length },
  };
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isIso = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

/** The diagnostic exactly as it crosses the process boundary (JSON), or null when it is not one. */
export function parseHotDiagnostic(payload: unknown): HotDiagnostic | null {
  if (typeof payload !== "object" || payload === null) return null;
  const d = payload as Record<string, unknown>;
  const { snapshot: raw } = d;
  let snapshot: HotDiagnosticSnapshot | null = null;
  if (raw !== null) {
    if (typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (!isIso(s.computedAt) || typeof s.ruleVersion !== "string" || !isCount(s.storedEntries) || (s.candidates !== null && !isCount(s.candidates))) return null;
    snapshot = { computedAt: s.computedAt, ruleVersion: s.ruleVersion as string, storedEntries: s.storedEntries, candidates: (s.candidates ?? null) as number | null };
  }
  const eligible = d.eligible as Record<string, unknown> | undefined;
  const sources = d.sources as Record<string, unknown> | undefined;
  if (!isIso(d.probeAt) || typeof d.ruleVersion !== "string" || !isCount(d.publicEntries) || !eligible || !sources
    || !isCount(eligible.now) || (eligible.atSnapshot !== null && !isCount(eligible.atSnapshot))
    || !isCount(sources.scheduled) || !isCount(sources.behind)) return null;
  return {
    probeAt: d.probeAt as string,
    ruleVersion: d.ruleVersion as string,
    snapshot,
    publicEntries: d.publicEntries as number,
    eligible: { now: eligible.now as number, atSnapshot: (eligible.atSnapshot ?? null) as number | null },
    sources: { scheduled: sources.scheduled as number, behind: sources.behind as number },
  };
}

/**
 * The fail-closed acceptance decision over one hot API answer and the diagnostic that backs it.
 * Freshness and rule version are checked for every answer; an empty list is then accepted only as a
 * proven sparse window — zero everywhere, and no source collecting late enough to hide the story
 * that would qualify. Anything unknown, stale, inconsistent or merely unprovable fails.
 */
export function evaluateHotAcceptance(apiEntries: number, payload: unknown, nowMs: number = Date.now()): HotAcceptance {
  const diagnostic = parseHotDiagnostic(payload);
  if (!diagnostic || !isCount(apiEntries)) {
    return { accepted: false, reason: "hot diagnostic payload is malformed", detail: "the diagnostic did not validate against its contract", diagnostic: null };
  }
  const fail = (reason: HotFailureReason, detail: string): HotAcceptance => ({ accepted: false, reason, detail, diagnostic });
  const { snapshot } = diagnostic;
  if (!snapshot) return fail("hot ranking is absent", "no published hot_rankings row");
  const ageMs = nowMs - Date.parse(snapshot.computedAt);
  if (!(ageMs >= 0 && ageMs <= HOT_RANKING_FRESH_MS)) {
    return fail("hot ranking is stale", `computed_at ${snapshot.computedAt} is ${Math.round(ageMs / 60_000)} min old (fresh within ${HOT_RANKING_FRESH_MS / 60_000} min)`);
  }
  if (snapshot.ruleVersion !== HOT_RULE_VERSION || diagnostic.ruleVersion !== HOT_RULE_VERSION) {
    return fail("hot rule version is unknown or mismatched", `snapshot ${snapshot.ruleVersion}, probe ${diagnostic.ruleVersion}, expected ${HOT_RULE_VERSION}`);
  }
  if (snapshot.candidates === null) {
    return fail("hot candidate evidence is missing", "the stored ranking carries no numeric evidence.candidates");
  }
  if (apiEntries > 0) {
    if (diagnostic.publicEntries === 0) {
      return fail("hot publication read layer disagrees with the public API", `the API returned ${apiEntries} entries, the read layer now shows 0`);
    }
    return { accepted: true, verdict: "populated", diagnostic };
  }
  if (diagnostic.publicEntries !== 0) {
    return fail("hot publication read layer disagrees with the public API", `the API returned 0 entries, the read layer shows ${diagnostic.publicEntries}`);
  }
  if (diagnostic.eligible.now !== 0) {
    return fail("hot eligible candidates are not publicly visible", `${diagnostic.eligible.now} qualifying stories right now, 0 public entries`);
  }
  if (snapshot.storedEntries !== 0) {
    return fail("hot eligible candidates are not publicly visible", `${snapshot.storedEntries} stored entries, none still publicly visible`);
  }
  if (snapshot.candidates !== 0) {
    return fail("hot eligible candidates are not publicly visible", `${snapshot.candidates} qualifying candidates at computed_at, 0 stored entries`);
  }
  if (diagnostic.eligible.atSnapshot === null || diagnostic.eligible.atSnapshot !== 0) {
    return fail("hot candidate counts disagree with the recomputed rules", `the snapshot recorded 0 candidates, the rules recomputed at computed_at yield ${diagnostic.eligible.atSnapshot}`);
  }
  if (diagnostic.sources.behind !== 0) {
    return fail("hot source collection is behind", `${diagnostic.sources.behind} of ${diagnostic.sources.scheduled} scheduled sources without a recent successful fetch`);
  }
  return { accepted: true, verdict: "expected sparse window", diagnostic };
}
