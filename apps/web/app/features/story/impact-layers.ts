/**
 * Impact-tracing P1 one-hop projection (specs/event-impact-tracing-p1 §3): a deterministic,
 * read-only classification of each story-route station into ONE reading layer.
 * Keywords decide only where a fact is read — never a relation between layers; no edges exist.
 * Classification input is the fact's own title plus the structured subject/action/object the
 * route now passes through. conflict_event and company_disclosure are action-guarded: a missing
 * structured action must NOT be replaced by title co-occurrence.
 */
import type { ImpactEvidenceKind, StoryRoute, StoryRouteStation } from "@aihot/contracts/site";
import { TERMS, inScope } from "./impact-evidence.ts";

export const IMPACT_STATION_LAYERS = [
  "conflict_event", "policy_statement", "company_disclosure", "logistics_observation", "unclassified",
] as const;
export type ImpactStationLayer = (typeof IMPACT_STATION_LAYERS)[number];

// Conflict vocabulary (spec §3; zh primary, EN translations). An open set by design — the
// dictionaries group reading, they do not assert conflict severity.
const CONFLICT_ACTION = /触雷|爆炸|袭击|交火|击沉|伤亡|开火|炮击|空袭|\bmine strike\b|\bstruck a mine\b|\bhit a mine\b|\bexplosion\b|\battacked?\b|\bclashes?\b|\bs(?:an|un)k\b|\bshelling\b|\bairstrikes?\b|\bcasualt(?:y|ies)\b|\bopened fire\b|\bfired (?:on|at)\b/i;
// A disclosure is only a disclosure when the fact's own action states it (spec §3).
const DISCLOSURE_ACTION = /停产|停工|停产停工|披露|公告|财报|\bhalt(?:ed|s)?\b|\bsuspend(?:ed|s)?\b|\bshut(?:ting)? down\b|\bdisclos(?:e|ed|ing|ure)\b|\bfiling\b|\bfiled\b|\bwarn(?:s|ed)?\b/i;

export function stationLayer(station: Pick<StoryRouteStation, "title" | "subject" | "action" | "object">): ImpactStationLayer {
  const action = station.action ?? "";
  // Deterministic priority: conflict (structured action) → policy → company (action-guarded) →
  // logistics → unclassified. One station, one layer, independent of iteration order.
  if (action && CONFLICT_ACTION.test(action)) return "conflict_event";
  const text = [station.title, station.subject, action, station.object].filter(Boolean).join(" ");
  if (TERMS.policy.test(text)) return "policy_statement";
  if (action && TERMS.companies.test(text) && DISCLOSURE_ACTION.test(action)) return "company_disclosure";
  if (TERMS.logistics.test(text)) return "logistics_observation";
  return "unclassified";
}

// Labels use "线索/陈述" wording and never imply effect: no 影响/导致/生效 and no policy
// stage (拟议/宣布/生效/撤销) — a policy station is a verbal act, not an enacted policy (N4).
export const LAYER_LABELS: Record<ImpactStationLayer, [string, string]> = {
  conflict_event: ["冲突事实线索", "Conflict-event lead"],
  policy_statement: ["机构表态", "Institutional statement"],
  company_disclosure: ["企业披露陈述", "Company disclosure statement"],
  logistics_observation: ["航运物流观察", "Logistics observation"],
  unclassified: ["未分类事实站", "Unclassified fact station"],
};

export type StationEvidenceItem = {
  station: StoryRouteStation;
  layer: ImpactStationLayer;
  evidenceKind: Extract<ImpactEvidenceKind, "fact_station">;
};

/** Reports safe to show in any station drawer (AC-2): a source URL and both clock timestamps are required. */
export function displayableStationReports(
  station: Pick<StoryRouteStation, "reports">,
): StoryRouteStation["reports"] {
  const safeUrl = (url: string) => { try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; } };
  const dated = (value: string | null | undefined) =>
    !!value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
  return station.reports.filter(r => safeUrl(r.url) && dated(r.publishedAt) && dated(r.discoveredAt));
}

/**
 * Stations displayable at the shared cutoff. A report needs a safe http(s) original URL and the
 * timestamps both clocks rely on (AC-2); a station hides only when none of its (bounded, ≤6
 * selected-first) reports is displayable. Never infer that a hidden station did not exist.
 */
export function stationEvidenceAt(
  route: StoryRoute | null,
  asOf: string | null | undefined,
  clock: "known" | "valid",
): StationEvidenceItem[] {
  if (!route || route.status !== "ok") return [];
  // Same strict timestamp rule as the leads: a value without an explicit zone is not displayable.
  if (!asOf || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(asOf) || !Number.isFinite(Date.parse(asOf))) return [];
  const cutoff = Date.parse(asOf);
  return route.stations.flatMap(station => {
    // Project only the evidence visible at this cutoff. Filtering the station but
    // leaving its full reports array would leak future links through the drawer.
    const reports = displayableStationReports(station).filter(r => inScope(r, cutoff, clock));
    return reports.length ? [{
      station: { ...station, reports },
      layer: stationLayer(station),
      evidenceKind: "fact_station" as const,
    }] : [];
  });
}
