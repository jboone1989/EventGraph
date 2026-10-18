import type { StoryReportView } from "@aihot/contracts/site";

/** Each playback step contains all public reports bearing one publication timestamp.
 * Publication time is not ingestion time or proof of when a fact became known.
 */
export interface ReplayFrame {
  publishedAt: string;
  reports: StoryReportView[];
  total: number;
  firstParty: number;
  sources: number;
}

export function buildReplayFrames(timeline: readonly StoryReportView[]): ReplayFrame[] {
  const ordered = timeline
    .filter((report) => Number.isFinite(Date.parse(report.publishedAt)))
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt) || a.id.localeCompare(b.id));
  const frames: ReplayFrame[] = [];
  const sources = new Set<string>();
  let firstParty = 0;
  for (const report of ordered) {
    const time = Date.parse(report.publishedAt);
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
        publishedAt: report.publishedAt,
        reports: [report],
        total: (previous?.total ?? 0) + 1,
        firstParty,
        sources: sources.size,
      });
    }
  }
  return frames;
}
