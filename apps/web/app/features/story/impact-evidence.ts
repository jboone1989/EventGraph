/**
 * Conservative, time-scoped *report discovery* for the EventGraph impact workbench.
 * A keyword match is only a reading lead, NEVER a verified policy, supply
 * dependency, corporate loss or causal link. Do not render these as graph edges.
 *
 * Only dated and currently public StoryRoute evidence is eligible. The route is
 * sourced from the public publication scope, not Graphiti's generic RELATES_TO.
 */
import type { StoryDetail, StoryRoute, StoryRouteReport } from "@aihot/contracts/site";

export const IMPACT_AREAS = ["policy", "logistics", "companies"] as const;
export type ImpactArea = (typeof IMPACT_AREAS)[number];
export type ImpactLead = {
  area: ImpactArea;
  articleId: string;
  /** Current report metadata (may have been revised after the selected time). */
  title: string;
  englishTitle: string | null;
  source: string;
  url: string;
  publishedAt: string | null;
  discoveredAt: string;
  revision: number | null;
  /** This is a discovery hint, NOT evidence of a causal or supply-chain edge. */
  evidenceKind: "related_reporting";
};

const TERMS: Record<ImpactArea, RegExp> = {
  policy: /制裁|禁运|关税|出口管制|出口限制|监管禁令|行政命令|贸易限制|进口禁令|贸易政策|贸易禁令|解除制裁|制裁豁免|\bsanction(?:s|ed)?\b|\btariff(?:s)?\b|\bexport (?:controls?|ban|restriction(?:s)?)\b|\btrade (?:restrictions?|ban)\b|\bembargo\b|\bexecutive order\b/i,
  logistics: /海峡|航运|船运|油轮|港口|航道|航线|停航|断航|封锁航道|运输中断|物流|供应链|原油供应|天然气供应|能源供应|\bshipping\b|\bport(?:s)?\b|\bmaritime\b|\bfreight\b|\btanker(?:s)?\b|\bstrait\b|\bsupply chain\b|\blogistics\b|\bvessel(?:s)?\b|\bcrude oil\b/i,
  companies: /企业披露|公司披露|上市公司公告|停工|停产|工厂关闭|工厂停工|生产中断|营收影响|成本上升|财报披露|\bcompany disclosure\b|\bfiling\b|\bfactory (?:closure|shutdown)\b|\bproduction (?:halt|suspension|disruption)\b|\bearnings impact\b|\bcompany warns\b/i,
};

const timestamp = (value: string | null | undefined) =>
  !!value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
const safeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch { return false; }
};

function inScope(report: StoryRouteReport, cutoff: number, clock: "known" | "valid") {
  const at = clock === "known" ? report.discoveredAt : report.publishedAt;
  // A future-dated or embargoed publication cannot appear before its stated
  // publication time, even if a collector saw it earlier (replay.ts contract).
  return timestamp(report.publishedAt) && Date.parse(report.publishedAt!) <= cutoff &&
    timestamp(at) && Date.parse(at!) <= cutoff;
}

/**
 * Candidate evidence is bounded by the existing route's 24 stations / 6 reports
 * per station. Do not infer absence of impact from an empty result or present
 * report title/summary as a historically frozen original revision.
 */
export function impactLeadsAt(
  route: StoryRoute | null,
  timeline: readonly StoryDetail["timeline"][number][],
  asOf: string | null | undefined,
  clock: "known" | "valid",
): Record<ImpactArea, ImpactLead[]> {
  const out: Record<ImpactArea, ImpactLead[]> = { policy: [], logistics: [], companies: [] };
  if (!route || route.status !== "ok" || !timestamp(asOf)) return out;
  const cutoff = Date.parse(asOf!);
  const publicReports = new Map(timeline.map((report) => [report.id, report]));
  const seen = new Set<string>();
  for (const station of route.stations) {
    for (const evidence of station.reports) {
      if (!inScope(evidence, cutoff, clock) || !safeUrl(evidence.url)) continue;
      const report = publicReports.get(evidence.articleId);
      if (!report) continue; // No evidence beyond the current public page's approved reports.
      // A title may be revised; this list is an explicitly bounded reconstruction.
      const searchable = [report.title, report.originalTitle, report.english?.title, report.summary, report.english?.summary]
        .filter(Boolean).join(" ");
      for (const area of IMPACT_AREAS) {
        const key = area + ":" + evidence.articleId;
        if (!TERMS[area].test(searchable) || seen.has(key)) continue;
        seen.add(key);
        out[area].push({
          area, articleId: evidence.articleId, title: report.title,
          englishTitle: report.english?.title ?? report.originalTitle ?? null,
          source: evidence.source, url: evidence.url,
          publishedAt: evidence.publishedAt, discoveredAt: evidence.discoveredAt,
          revision: evidence.revision, evidenceKind: "related_reporting",
        });
      }
    }
  }
  for (const area of IMPACT_AREAS) {
    out[area].sort((a, b) => Date.parse(clock === "known" ? a.discoveredAt : a.publishedAt!) -
      Date.parse(clock === "known" ? b.discoveredAt : b.publishedAt!) || a.articleId.localeCompare(b.articleId));
  }
  return out;
}

/** Only show a market observation after BOTH underlying snapshots were observed. */
export function marketObservationAt<A extends { before: { at: string }; after: { at: string } }>(
  market: { eventAt: string; assets: A[] } | null,
  asOf: string | null | undefined,
) {
  if (!market || !timestamp(asOf)) return null;
  const cutoff = Date.parse(asOf!);
  const assets = market.assets.filter(a =>
    timestamp(a.before.at) && timestamp(a.after.at) &&
    Date.parse(a.before.at) <= cutoff && Date.parse(a.after.at) <= cutoff);
  return assets.length ? { ...market, assets } : null;
}
