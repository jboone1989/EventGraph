// The public analytics ingestion route owns validation and throttling; persistence lives in the backend.
import { sql } from "../db.ts";

export interface PublicAnalyticsEvent {
  name: string;
  pageType: string;
  language: string;
  sessionId: string;
  contentId: string | null;
  durationMs: number | null;
  referrerHost: string | null;
}

export async function storePublicAnalyticsEvent(event: PublicAnalyticsEvent) {
  await sql`INSERT INTO product_analytics_events
    (session_id, event_name, page_type, language, content_id, duration_ms, referrer_host)
    VALUES (${event.sessionId}, ${event.name}, ${event.pageType}, ${event.language},
            ${event.contentId}, ${event.durationMs}, ${event.referrerHost})`;
  if (Math.random() < 0.01)
    await sql`DELETE FROM product_analytics_events WHERE occurred_at < NOW() - INTERVAL '90 days'`;
}
