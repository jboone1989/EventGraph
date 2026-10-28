// Read-only, bounded projection of the current public routes; never a historical revision store.
import type { CaseStudyResponse, CaseStudyTrack, StoryRouteReport } from "@aihot/contracts/site";

const timestamp = (value: string | null) => value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ? Date.parse(value) : NaN;

export function caseReplayAsOf(value: string | null): string | null {
  return Number.isFinite(timestamp(value)) ? value : null;
}

function reportAt(report: StoryRouteReport, cutoff: number, clock: "known" | "valid") {
  const published = timestamp(report.publishedAt);
  // A known report may lack a publication date; an explicit future publication is embargoed.
  return (report.publishedAt === null || published <= cutoff) &&
    timestamp(clock === "known" ? report.discoveredAt : report.publishedAt) <= cutoff;
}

function trackAt(track: CaseStudyTrack, cutoff: number, clock: "known" | "valid"): CaseStudyTrack {
  const stations = track.stations.flatMap(station => {
    const reports = station.reports.filter(r => reportAt(r, cutoff, clock));
    const recorded = timestamp(station.timeRecorded);
    const knownByCutoff = clock === "known" && Number.isFinite(recorded) && recorded <= cutoff;
    if (!reports.length && !knownByCutoff) return [];
    // Reports are a selected-first subset (at most six). Its minimum/count is not the
    // full station's minimum/count. In known-time replay, authoritative timeRecorded can
    // prove the station existed even when the bounded selected reports cannot display it.
    return [{ ...station, reports }];
  }).sort((a, b) => {
    const first = timestamp(a.timeRecorded), second = timestamp(b.timeRecorded);
    return (Number.isFinite(first) ? first : Infinity) - (Number.isFinite(second) ? second : Infinity) || 0;
  });
  return { ...track, stations, status: stations.length ? "ok" : "insufficient",
    coverage: { stations: stations.length, reports: stations.reduce((n, s) => n + s.reports.length, 0),
      sources: new Set(stations.flatMap(s => s.reports.map(r => r.source))).size },
  };
}

function curatedBy(value: string, cutoff: number) {
  // ISO dates have no known hour. Do not invent one: make the whole UTC date elapse first.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(start) && new Date(start).toISOString().slice(0, 10) === value && start + 86_400_000 <= cutoff;
  }
  return timestamp(value) <= cutoff;
}

export function caseStudyAt(data: CaseStudyResponse, asOf: string | null, clock: "known" | "valid"): CaseStudyResponse {
  if (!caseReplayAsOf(asOf)) return data;
  const cutoff = timestamp(asOf);
  const tracks = data.tracks.map(track => trackAt(track, cutoff, clock));
  const visible = new Set(tracks.filter(t => t.status === "ok").map(t => t.key));
  return { ...data, tracks,
    links: data.links.filter(link => visible.has(link.from) && visible.has(link.to) &&
      timestamp(link.evidence.publishedAt) <= cutoff && (clock === "valid" || curatedBy(link.curatedAt, cutoff))),
    // These notes carry no curation timestamp, so only the current view can assert them.
    unlinked: [],
  };
}
