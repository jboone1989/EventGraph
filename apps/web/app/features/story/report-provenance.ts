// Read-only evidence markers for the canonical Story report timeline. Every marker
// comes from the existing fact route; no Fact identity or public report is merged.
import type { StoryRoute } from "@aihot/contracts/site";
import { displayableStationReports } from "./impact-layers";

export type ReportProvenance = {
  revised: boolean;
  singleSourceFact: boolean;
  reportTimeOnly: boolean;
};

export function reportProvenance(route: StoryRoute | null): Map<string, ReportProvenance> {
  const byArticle = new Map<string, ReportProvenance>();
  if (route?.status !== "ok") return byArticle;
  for (const station of route.stations) {
    // Match the source drawer: undated or unsafe source links cannot support a public badge.
    for (const report of displayableStationReports(station)) {
      const prior = byArticle.get(report.articleId);
      byArticle.set(report.articleId, {
        revised: station.uncertainty.revised || (report.revision !== null && report.revision > 1) || (prior?.revised ?? false),
        // A report may support several facts. Only show a restrictive marker if
        // every fact it supports has that uncertainty; do not imply all are alike.
        singleSourceFact: station.uncertainty.singleSource && (prior?.singleSourceFact ?? true),
        reportTimeOnly: station.uncertainty.occurredAtMissing && (prior?.reportTimeOnly ?? true),
      });
    }
  }
  return byArticle;
}
