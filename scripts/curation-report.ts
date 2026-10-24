// Monthly curation coverage (specs/003-content-assets FR-011): what the editor's index gate let in,
// what it kept out, and how much is waiting for a decision. Run against any database:
//   DATABASE_URL=... npm run curation:report -- --days=30
import { sql } from "@aihot/backend/db";
import { SEO } from "@aihot/site";

const daysArg = process.argv.find((a) => a.startsWith("--days="));
const days = Math.min(Math.max(Number(daysArg?.slice("--days=".length) ?? 30) || 30, 1), 365);

const [publications] = await sql<{ total: number; indexed: number; excluded: number; pending: number }[]>`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE indexable)::int AS indexed,
         count(*) FILTER (WHERE seo_excluded_at IS NOT NULL)::int AS excluded,
         count(*) FILTER (WHERE selected AND visibility = 'public' AND NOT indexable AND seo_excluded_at IS NULL)::int AS pending
  FROM publications p JOIN sources s ON s.id = p.source_id
  WHERE p.timeline_at > now() - (${days} || ' days')::interval`;

// Stories under the same rules the sitemap uses: a curated report among them, and not a thin
// single-source page whose digest sits under the indexing floor.
const [stories] = await sql<{ total: number; indexable: number; thin: number; pending: number }[]>`
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE curated AND NOT thin)::int AS indexable,
         count(*) FILTER (WHERE curated AND thin)::int AS thin,
         count(*) FILTER (WHERE NOT curated)::int AS pending
  FROM (
    SELECT st.id,
      EXISTS (
        SELECT 1 FROM publications p JOIN sources s ON s.id = p.source_id
        WHERE p.story_id = st.id AND p.indexable AND s.participation_mode = 'editorial'
          AND p.visibility = 'public' AND (NOT p.selected OR p.visible_after <= now())
      ) AS curated,
      (coalesce(length(st.digest), 0) < ${SEO.minSingleSourceDigestChars}
        AND (SELECT count(*) FROM publications p WHERE p.story_id = st.id AND p.visibility = 'public') < 2) AS thin
    FROM stories st WHERE st.merged_into IS NULL AND st.latest_at > now() - (${days} || ' days')::interval
  ) s`;

const [reports] = await sql<{ total: number; withOverview: number }[]>`
  SELECT count(*)::int AS total, count(*) FILTER (WHERE content ? 'overview')::int AS "withOverview"
  FROM reports WHERE generated_at > now() - (${days} || ' days')::interval`;

const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 1000) / 10}%`);

const lines = [
  `# 收录覆盖率（最近 ${days} 天）`,
  "",
  "| 对象 | 总数 | 可收录 | 被排除 | 待策展 | 可收录占比 |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  `| 条目 | ${publications!.total} | ${publications!.indexed} | ${publications!.excluded} | ${publications!.pending} | ${pct(publications!.indexed, publications!.total)} |`,
  `| 事件 | ${stories!.total} | ${stories!.indexable} | ${stories!.thin}（薄页） | ${stories!.pending} | ${pct(stories!.indexable, stories!.total)} |`,
  `| 日报 | ${reports!.total} | ${reports!.withOverview}（带综述） | — | — | — |`,
  "",
  "待策展 = 精选、公开、尚未决定；薄页 = 单来源且综述低于收录门槛，按规则不收录。",
];

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ days, publications, stories, reports }, null, 2));
} else {
  console.log(lines.join("\n"));
}
await sql.end();
