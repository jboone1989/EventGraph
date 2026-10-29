import type { StoryRoute } from "../packages/contracts/src/site.ts";

export type Membership = {
  factId: string; articleId: string; role: string;
  factManual: boolean; membershipManual: boolean;
  evidence: string | null;
};
export type DecisionTrace = {
  id: number; articleId: string; verdict: string; candidates: unknown;
  factId: number | null; storyId: number | null;
  receiptId: number | null; createdAt: string;
};

/** A review ledger, not a classifier. Shared reporting does not establish identical occurrences. */
export function storyFactDiagnosis(
  route: StoryRoute,
  memberships: readonly Membership[],
  decisions: readonly DecisionTrace[],
) {
  const visible = new Set(route.stations.flatMap(s => s.reports.map(r => r.articleId)));
  const byArticle = new Map<string, DecisionTrace[]>();
  for (const decision of [...decisions].sort((a, b) => b.id - a.id)) {
    if (!visible.has(decision.articleId)) continue;
    const history = byArticle.get(decision.articleId) ?? [];
    if (history.length < 5) history.push(decision);
    byArticle.set(decision.articleId, history);
  }
  const membershipsByKey = new Map(memberships.map(m => [`${m.factId}\0${m.articleId}`, m]));
  const linkedFacts = new Map<string, Set<string>>();
  for (const station of route.stations) for (const report of station.reports) {
    const facts = linkedFacts.get(report.articleId) ?? new Set<string>();
    facts.add(station.factId);
    linkedFacts.set(report.articleId, facts);
  }
  const facts = route.stations.map(station => ({
    factId: station.factId,
    title: station.title,
    frame: { subject: station.subject, action: station.action, object: station.object },
    occurredAt: station.timeEffective,
    firstRecordedAt: station.timeRecorded,
    sourceCount: station.sourceCount,
    flags: {
      occurrenceTimeMissing: station.uncertainty.occurredAtMissing,
      singleSource: station.uncertainty.singleSource,
      routeTruncated: route.limits.truncated,
    },
    reports: station.reports.map(report => {
      const member = membershipsByKey.get(`${station.factId}\0${report.articleId}`);
      return {
        articleId: report.articleId, url: report.url, source: report.source,
        revision: report.revision, publishedAt: report.publishedAt,
        discoveredAt: report.discoveredAt, role: member?.role ?? "unknown",
        manual: member?.membershipManual ?? null,
        factManual: member?.factManual ?? null,
        membershipEvidence: member?.evidence ?? null,
        alsoInFactIds: [...(linkedFacts.get(report.articleId) ?? [])].filter(id => id !== station.factId),
        groupingHistory: byArticle.get(report.articleId) ?? [],
      };
    }),
  }));
  return {
    story: route.story,
    generatedAt: route.generatedAt,
    publicRouteUntruncated: route.status === "ok" && !route.limits.truncated,
    diagnosticOnly: true,
    decision: "human_source_review_required",
    limits: route.limits,
    facts,
  };
}
