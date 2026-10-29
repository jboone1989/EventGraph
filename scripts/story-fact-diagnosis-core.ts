import type { StoryRoute } from "../packages/contracts/src/site.ts";

export type Membership = {
  factId: string; articleId: string; role: string; factNumericId?: number;
  factManual: boolean; membershipManual: boolean;
  evidence: string | null;
};
export type SourceRecord = {
  articleId: string; tier: string | null; bodyMode: "full" | "summary" | null;
};
export type DecisionTrace = {
  id: number; articleId: string; verdict: string; candidates: unknown;
  factId: number | null; storyId: number | null;
  receiptId: number | null; createdAt: string;
};

/** Candidate IDs are internal; only candidates matching visible route Facts are resolved. */
function visibleCandidateRelations(history: readonly DecisionTrace[], routeIds: ReadonlyMap<number, string>) {
  return history.map(decision => ({
    decisionId: decision.id,
    visibleCandidates: Array.isArray(decision.candidates) ? decision.candidates.flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const candidate = value as Record<string, unknown>;
      const factId = typeof candidate.id === "number" ? routeIds.get(candidate.id) : undefined;
      if (!factId) return [];
      return [{
        factId,
        relation: typeof candidate.relation === "string" ? candidate.relation : null,
        score: typeof candidate.score === "number" ? candidate.score : null,
        confidence: typeof candidate.confidence === "number" ? candidate.confidence : null,
      }];
    }) : [],
  }));
}

/** A review ledger, not a classifier. Shared reporting does not establish identical occurrences. */
export function storyFactDiagnosis(
  route: StoryRoute,
  memberships: readonly Membership[],
  decisions: readonly DecisionTrace[],
  sourceRecords: readonly SourceRecord[] = [],
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
  const sourceByArticle = new Map(sourceRecords.filter(r => visible.has(r.articleId)).map(r => [r.articleId, r]));
  const routeFactIds = new Set(route.stations.map(s => s.factId));
  const publicIdByNumeric = new Map(memberships
    .filter(m => visible.has(m.articleId) && routeFactIds.has(m.factId) && m.factNumericId !== undefined)
    .map(m => [m.factNumericId!, m.factId] as const));
  const linkedFacts = new Map<string, Set<string>>();
  const mentionFacts = new Map<string, Set<string>>();
  // Only primary/report memberships are occurrence evidence. A 'mention'
  // is a reference to another Fact, not proof that the same event occurred.
  // Keep mentions separately for review without suggesting a merge.
  for (const member of memberships) {
    if (!visible.has(member.articleId)) continue;
    if (!["primary", "report", "mention"].includes(member.role)) continue;
    const target = member.role === "mention" ? mentionFacts : linkedFacts;
    const facts = target.get(member.articleId) ?? new Set<string>();
    facts.add(member.factId);
    target.set(member.articleId, facts);
  }
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
        sourceRecord: (() => {
          const recorded = sourceByArticle.get(report.articleId);
          return {
            tier: recorded?.tier ?? null,
            bodyMode: recorded?.bodyMode ?? null,
            attribution: !recorded?.tier ? "metadata_missing" : recorded.tier === "T1" ? "recorded_first_party" : "recorded_other",
            originalSourceVerified: false,
          };
        })(),
        alsoInFactIds: [...(linkedFacts.get(report.articleId) ?? [])]
          .filter(id => id !== station.factId).sort(),
        mentionedInFactIds: [...(mentionFacts.get(report.articleId) ?? [])]
          .filter(id => id !== station.factId).sort(),
        groupingHistory: byArticle.get(report.articleId) ?? [],
        candidateRouteRelations: visibleCandidateRelations(byArticle.get(report.articleId) ?? [], publicIdByNumeric),
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
