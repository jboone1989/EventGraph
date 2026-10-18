import type { FastifyInstance } from "fastify";
import { sql } from "@aihot/backend/db";

// Explicit allowlist: content, path queries and sensitive browser fields are never collected.
const EVENT_NAMES = new Set([
  "page_view", "story_open", "item_open", "graph_node_select",
  "graph_relation_select", "source_open", "search_submit",
  "navigation_complete", "agent_access_open", "feedback_open",
]);
const PAGE_TYPES = new Set([
  "home", "all", "story", "item", "hot", "knowledge", "entity",
  "search", "daily", "weekly", "monthly", "topics", "agent", "other",
]);
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const HOST = /^(?:[a-z0-9-]{1,63}\.)*[a-z0-9-]{1,63}$/i;
const perMinute = new Map<string, { count: number; until: number }>();

export function validAnalyticsEvent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!EVENT_NAMES.has(String(v.name)) || !PAGE_TYPES.has(String(v.pageType))) return null;
  if (v.language !== "zh" && v.language !== "en") return null;
  if (typeof v.sessionId !== "string" || !SESSION_ID.test(v.sessionId)) return null;
  if (v.contentId != null && (typeof v.contentId !== "string" || !CONTENT_ID.test(v.contentId))) return null;
  if (v.durationMs != null && (typeof v.durationMs !== "number" || !Number.isInteger(v.durationMs) || v.durationMs < 0 || v.durationMs > 60000)) return null;
  if (v.referrerHost != null && (typeof v.referrerHost !== "string" || v.referrerHost.length > 100 || !HOST.test(v.referrerHost))) return null;
  return {
    name: v.name as string, pageType: v.pageType as string,
    language: v.language as string, sessionId: v.sessionId,
    contentId: (v.contentId as string | undefined) ?? null,
    durationMs: (v.durationMs as number | undefined) ?? null,
    referrerHost: (v.referrerHost as string | undefined) ?? null,
  };
}

export function registerAnalytics(app: FastifyInstance) {
  app.post("/api/analytics/events", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const origin = req.headers.origin;
    const host = req.headers.host;
    // A browser can only submit from the origin whose page owns this endpoint.
    if (!origin || !host) return reply.code(403).send({ error: "origin_required" });
    let originHost: string;
    try { originHost = new URL(origin).host; } catch { return reply.code(403).send({ error: "invalid_origin" }); }
    if (originHost !== host || !["https:", "http:"].includes(new URL(origin).protocol))
      return reply.code(403).send({ error: "cross_origin" });
    if (JSON.stringify(req.body ?? {}).length > 1024) return reply.code(413).send({ error: "too_large" });
    const event = validAnalyticsEvent(req.body);
    if (!event) return reply.code(400).send({ error: "invalid_event" });
    // Ephemeral limiter; IP addresses are never stored in analytics.
    const key = req.ip;
    const now = Date.now();
    const prior = perMinute.get(key);
    const count = prior && prior.until > now ? prior.count + 1 : 1;
    perMinute.set(key, { count, until: prior && prior.until > now ? prior.until : now + 60_000 });
    if (perMinute.size > 5000) perMinute.clear();
    if (count > 120) return reply.code(429).send({ error: "rate_limited" });
    await sql`INSERT INTO product_analytics_events
      (session_id, event_name, page_type, language, content_id, duration_ms, referrer_host)
      VALUES (${event.sessionId}, ${event.name}, ${event.pageType}, ${event.language},
              ${event.contentId}, ${event.durationMs}, ${event.referrerHost})`;
    if (Math.random() < 0.01)
      await sql`DELETE FROM product_analytics_events WHERE occurred_at < NOW() - INTERVAL '90 days'`;
    return reply.code(204).send();
  });
}
