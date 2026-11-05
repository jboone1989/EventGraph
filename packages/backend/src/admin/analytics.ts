// Page-view-first operations reporting. Each event is counted only in its own source.
import { sql } from "../db.ts";
import { cloudflareReport } from "./cloudflare-analytics.ts";
import { searchConsoleReport } from "./search-console-analytics.ts";

export async function analyticsOverview() {
  const external = Promise.all([cloudflareReport(), searchConsoleReport()]);
  const [summary, daily, pageTypes, content, referrers, ingestion] = await Promise.all([
    sql`SELECT
      COUNT(*) FILTER (WHERE (occurred_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date)::int AS today,
      COUNT(*) FILTER (WHERE (occurred_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date - 1)::int AS yesterday,
      COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '7 days')::int AS seven_days,
      COUNT(*)::int AS thirty_days
      FROM product_analytics_events
      WHERE event_name = 'page_view' AND occurred_at >= NOW() - INTERVAL '30 days'`,
    sql`SELECT (occurred_at AT TIME ZONE 'UTC')::date::text AS day,
      COUNT(*)::int AS page_views
      FROM product_analytics_events
      WHERE event_name = 'page_view' AND occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1`,
    sql`SELECT page_type, COUNT(*)::int AS page_views
      FROM product_analytics_events
      WHERE event_name = 'page_view' AND occurred_at >= NOW() - INTERVAL '30 days'
      GROUP BY page_type ORDER BY page_views DESC LIMIT 20`,
    // story_open/item_open are emitted once when a detail page is opened;
    // this preserves historical rankings before page_view included content IDs.
    sql`SELECT page_type, content_id, COUNT(*)::int AS count
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
        AND event_name IN ('story_open', 'item_open') AND content_id IS NOT NULL
      GROUP BY page_type, content_id ORDER BY count DESC LIMIT 20`,
    sql`SELECT referrer_host AS host, COUNT(*)::int AS page_views
      FROM product_analytics_events WHERE occurred_at >= NOW() - INTERVAL '30 days'
        AND event_name = 'page_view' AND referrer_host IS NOT NULL
      GROUP BY referrer_host ORDER BY page_views DESC LIMIT 10`,
    sql`SELECT COUNT(*)::int AS total_events,
      (SELECT occurred_at::text FROM product_analytics_events ORDER BY occurred_at DESC, id DESC LIMIT 1) AS last_event_at
      FROM product_analytics_events`,
  ]);
  const [cloudflare, searchConsole] = await external;
  return {
    cloudflare, searchConsole,
    periodDays: 30, asOf: new Date().toISOString(),
    ingestion: ingestion[0] ?? { total_events: 0, last_event_at: null },
    summary: summary[0] ?? { today: 0, yesterday: 0, seven_days: 0, thirty_days: 0 },
    daily, pageTypes, content, referrers,
  };
}
