// Aggregated, non-identifying site metrics for the authenticated admin.
import { sql } from "../db.ts";
import { cloudflareReport } from "./cloudflare-analytics.ts";
import { posthogReport } from "./posthog-analytics.ts";
import { searchConsoleReport } from "./search-console-analytics.ts";

export async function analyticsOverview() {
  const external = Promise.all([cloudflareReport(), posthogReport(), searchConsoleReport()]);
  const [totals, daily, events, content, languages, referrers, performance, effective, ingestion] = await Promise.all([
    sql`SELECT
      COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='page_view')::int AS sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='story_open')::int AS story_sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='graph_node_select')::int AS graph_sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='source_open')::int AS source_sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='search_submit')::int AS search_sessions
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'`,
    sql`SELECT (occurred_at AT TIME ZONE 'UTC')::date::text AS day,
      COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='page_view')::int AS sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE event_name='graph_node_select')::int AS graph_sessions
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1`,
    sql`SELECT event_name AS name, COUNT(*)::int AS count,
      COUNT(DISTINCT session_id)::int AS sessions
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY event_name ORDER BY count DESC LIMIT 20`,
    sql`SELECT page_type, content_id, COUNT(*)::int AS count
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
        AND event_name IN ('story_open','item_open') AND content_id IS NOT NULL
      GROUP BY page_type, content_id ORDER BY count DESC LIMIT 15`,
    sql`SELECT language, COUNT(*) FILTER (WHERE event_name='page_view')::int AS page_views
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY language ORDER BY page_views DESC`,
    sql`SELECT referrer_host AS host, COUNT(*)::int AS page_views
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
        AND event_name='page_view' AND referrer_host IS NOT NULL
      GROUP BY referrer_host ORDER BY page_views DESC LIMIT 12`,
    sql`SELECT COUNT(*)::int AS samples,
      ROUND(AVG(duration_ms))::int AS mean_ms,
      ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration_ms))::numeric)::int AS p75_ms
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
        AND event_name='navigation_complete' AND duration_ms IS NOT NULL`,
    sql`SELECT COUNT(*)::int AS sessions FROM (
      SELECT session_id FROM product_analytics_events
      WHERE occurred_at >= NOW() - INTERVAL '7 days'
      GROUP BY session_id
      HAVING BOOL_OR(event_name = 'story_open')
        AND BOOL_OR(event_name IN ('graph_node_select', 'source_open'))
    ) AS qualified`,
    sql`SELECT COUNT(*)::int AS total_events,
      (SELECT occurred_at::text FROM product_analytics_events ORDER BY occurred_at DESC, id DESC LIMIT 1) AS last_event_at
      FROM product_analytics_events`,
  ]);
  const [cloudflare, posthog, searchConsole] = await external;
  return {
    cloudflare, posthog, searchConsole,
    periodDays: 30, asOf: new Date().toISOString(),
    ingestion: ingestion[0] ?? {total_events: 0, last_event_at: null},
    totals: totals[0] ?? {},
    weeklyEffectiveExplorers: Number(effective[0]?.sessions ?? 0),
    daily, events, content, languages, referrers,
    performance: performance[0] ?? { samples: 0, mean_ms: null, p75_ms: null },
  };
}
