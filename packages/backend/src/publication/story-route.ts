// The structured story route (EG-T17): a deterministic station-by-station walk of one public
// story's own record. No model call — each station is a fact with public evidence, carrying its
// evidence URLs, distinguished times (stated occurrence vs what the system recorded) and explicit
// uncertainty. A story without public evidence breaks off instead of producing a fabricated path.
import type { StoryRoute } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { evidenceCondition, storyReportCondition } from "./scope.ts";
import { publicSourceName } from "./rules.ts";
import { resolveStory } from "./stories.ts";

const STATION_LIMIT = 24;
const REPORT_LIMIT = 6;

interface RouteRow {
  id: number; public_id: string; title: string; subject: string | null; action: string | null;
  object: string | null; occurred_at: Date | null;
  article_id: string; url: string; source_name: string; published_at: Date | null;
  discovered_at: Date; revision: number; selected: boolean;
}

export async function publicStoryRoute(publicId: string, now = new Date()): Promise<StoryRoute | null> {
  const found = await resolveStory(publicId);
  if (found.kind === "not_found") return null;
  // A merged alias reads through to the surviving story, like the story page's redirect.
  const target = found.kind === "merged" ? await resolveStory(found.target) : found;
  if (target.kind !== "found") return null;
  return readStoryRoute(target.storyId, target.publicId, now);
}

async function readStoryRoute(storyId: number, publicId: string, now: Date): Promise<StoryRoute> {
  const [story] = await sql<{ title: string }[]>`SELECT title FROM stories WHERE id = ${storyId}`;
  if (!story) return insufficient(publicId, "", now);
  // One row per (fact, article), primary role preferred; only public evidence (non-mention,
  // not composite) counts — the same evidence the story page's developments are built from.
  const rows = await sql<RouteRow[]>`
    SELECT DISTINCT ON (f.id, p.article_id) f.id, f.public_id::text, f.title, f.subject, f.action, f.object, f.occurred_at,
      p.article_id::text, p.url, s.name AS source_name, p.published_at, p.discovered_at, a.revision, p.selected
    FROM facts f
    JOIN fact_articles fa ON fa.fact_id = f.id
    JOIN publications p ON p.article_id = fa.article_id
    JOIN sources s ON s.id = p.source_id
    JOIN articles a ON a.id = p.article_id
    WHERE f.story_id = ${storyId} AND ${evidenceCondition()} AND ${storyReportCondition(now)}
    ORDER BY f.id, p.article_id, (fa.role = 'primary') DESC`;
  if (rows.length === 0) return insufficient(publicId, story.title, now);

  const byFact = new Map<number, RouteRow[]>();
  for (const r of rows) byFact.set(r.id, [...(byFact.get(r.id) ?? []), r]);
  const stations = [...byFact.entries()].map(([id, members]) => {
    const ordered = [...members].sort((a, b) =>
      (a.selected ? 0 : 1) - (b.selected ? 0 : 1) || a.discovered_at.getTime() - b.discovered_at.getTime() || a.article_id.localeCompare(b.article_id));
    const sourceCount = new Set(members.map((r) => r.source_name)).size;
    return {
      factId: members[0]!.public_id,
      title: members[0]!.title,
      subject: members[0]!.subject,
      action: members[0]!.action,
      object: members[0]!.object,
      timeEffective: members[0]!.occurred_at?.toISOString() ?? null,
      timeRecorded: members.reduce((m, r) => (r.discovered_at < m ? r.discovered_at : m), members[0]!.discovered_at).toISOString(),
      reports: ordered.slice(0, REPORT_LIMIT).map((r) => ({
        articleId: r.article_id,
        url: r.url,
        source: publicSourceName(r.source_name),
        publishedAt: r.published_at?.toISOString() ?? null,
        discoveredAt: r.discovered_at.toISOString(),
        revision: r.revision > 1 ? r.revision : null,
      })),
      sourceCount,
      uncertainty: {
        singleSource: sourceCount < 2,
        occurredAtMissing: members[0]!.occurred_at === null,
        revised: members.some((r) => r.revision > 1),
      },
      _overflow: ordered.length > REPORT_LIMIT,
      _id: id,
    };
  }).sort((a, b) => Date.parse(a.timeRecorded) - Date.parse(b.timeRecorded) || a._id - b._id);

  const truncated = stations.length > STATION_LIMIT || stations.some((s) => s._overflow);
  const shown = stations.slice(0, STATION_LIMIT).map(({ _overflow: _, _id: __, ...station }) => station);
  const sources = new Set<string>();
  for (const station of shown) for (const r of station.reports) sources.add(r.source);
  return {
    schemaVersion: 1,
    story: { publicId, title: story.title },
    status: "ok",
    reason: null,
    generatedAt: now.toISOString(),
    limits: { stationLimit: STATION_LIMIT, reportLimit: REPORT_LIMIT, truncated },
    stations: shown,
    coverage: {
      stations: shown.length,
      reports: shown.reduce((n, s) => n + s.reports.length, 0),
      sources: sources.size,
    },
  };
}

function insufficient(publicId: string, title: string, now: Date): StoryRoute {
  return {
    schemaVersion: 1,
    story: { publicId, title },
    status: "insufficient",
    reason: "no_public_evidence",
    generatedAt: now.toISOString(),
    limits: { stationLimit: STATION_LIMIT, reportLimit: REPORT_LIMIT, truncated: false },
    stations: [],
    coverage: { stations: 0, reports: 0, sources: 0 },
  };
}
