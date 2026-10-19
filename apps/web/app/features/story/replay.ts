import type { StoryReportView } from "@aihot/contracts/site";

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
  const valid = (s?: string) => !!s && /(?:Z|[+-]\d{2}:\d{2})$/i.test(s) && Number.isFinite(Date.parse(s));
  const ordered = timeline
    .filter(r => valid(at(r)))
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
