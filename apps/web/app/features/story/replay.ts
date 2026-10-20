import type { StoryFactView, StoryReportView } from "@aihot/contracts/site";

function validTimestamp(value?: string): boolean {
  return !!value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}

/** Playback steps are source publications or first discovery timestamps.
 * Known-time replay never assumes that a later-discovered older article was already known.
 */
export interface ReplayFrame {
  publishedAt: string;
  reports: StoryReportView[];
  total: number;
  firstParty: number;
  sources: number;
}

export function buildReplayFrames(timeline: readonly StoryReportView[], clock: "published" | "known" = "published"): ReplayFrame[] {
  const at = (r: StoryReportView) => clock === "known" ? r.discoveredAt : r.publishedAt;
  const ordered = timeline
    .filter(r => validTimestamp(at(r)))
    .sort((a,b) => Date.parse(at(a)!) - Date.parse(at(b)!) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const frames: ReplayFrame[] = [];
  const sources = new Set<string>();
  let firstParty = 0;
  for (const report of ordered) {
    const time = Date.parse(at(report)!);
    const previous = frames[frames.length - 1];
    if (report.source.firstParty) firstParty++;
    sources.add(report.source.name);
    if (previous && Date.parse(previous.publishedAt) === time) {
      previous.reports.push(report);
      previous.total++;
      previous.firstParty = firstParty;
      previous.sources = sources.size;
    } else {
      frames.push({
        publishedAt: at(report)!,
        reports: [report],
        total: (previous?.total ?? 0) + 1,
        firstParty,
        sources: sources.size,
      });
    }
  }
  return frames;
}

/**
 * Only show event developments that belong to the selected historical cutoff.
 * Known-time replay uses first discovery; valid-time replay uses the first report
 * timestamp as a retrospective checkpoint. Missing or malformed timestamps are
 * omitted rather than inferred.
 */
export function developmentsAt(
  developments: readonly StoryFactView[],
  asOf: string | undefined,
  clock: "known" | "valid",
): StoryFactView[] {
  if (!asOf || !validTimestamp(asOf)) return [];
  const cutoff = Date.parse(asOf);
  const at = (development: StoryFactView) =>
    clock === "known" ? development.representative.discoveredAt : development.firstReportAt;
  const displayAt = (development: StoryFactView) =>
    clock === "known" ? development.representative.discoveredAt : development.representative.publishedAt;
  return developments
    .filter(development =>
      validTimestamp(at(development)) &&
      Date.parse(at(development)!) <= cutoff &&
      validTimestamp(development.representative.publishedAt) &&
      Date.parse(development.representative.publishedAt) <= cutoff
    )
    .sort((a, b) => Date.parse(displayAt(a)!) - Date.parse(displayAt(b)!) || a.factId.localeCompare(b.factId));
}
