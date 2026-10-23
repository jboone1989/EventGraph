// Minimal, anonymous browser telemetry. No cookies, URL queries, search terms or user identifiers.
export type EventName =
  | "page_view" | "story_open" | "item_open" | "graph_node_select"
  | "graph_relation_select" | "source_open" | "search_submit"
  | "navigation_complete" | "agent_access_open" | "feedback_open" | "rss_open";
export type PageType = "home" | "all" | "story" | "item" | "hot" | "knowledge"
  | "entity" | "search" | "daily" | "weekly" | "monthly" | "topics" | "agent" | "other";
export type AnalyticsConfig = {
  cloudflareToken: string | null;
  posthogToken: string | null;
  posthogRegion: "us" | "eu";
  searchConsoleVerification: string | null;
};
export const EMPTY_ANALYTICS: AnalyticsConfig = {
  cloudflareToken: null, posthogToken: null, posthogRegion: "us", searchConsoleVerification: null,
};
let current: AnalyticsConfig = EMPTY_ANALYTICS;

export function setAnalyticsConfig(config: AnalyticsConfig) { current = config; }
export function pageType(pathname: string): PageType {
  if (pathname === "/") return "home";
  if (pathname === "/all" || pathname.startsWith("/all/")) return "all";
  if (pathname.startsWith("/story/")) return "story";
  if (pathname.startsWith("/items/")) return "item";
  if (pathname === "/hot") return "hot";
  if (pathname.startsWith("/knowledge/entity/")) return "entity";
  if (pathname.startsWith("/knowledge")) return "knowledge";
  if (pathname.startsWith("/daily")) return "daily";
  if (pathname.startsWith("/weekly")) return "weekly";
  if (pathname.startsWith("/monthly")) return "monthly";
  if (pathname.startsWith("/topics")) return "topics";
  if (pathname === "/agent") return "agent";
  return "other";
}
function anonymousSession() {
  try {
    const key = "eventgraph:anonymous-session";
    let session = sessionStorage.getItem(key);
    if (!session || !/^[0-9a-f-]{36}$/i.test(session)) {
      // getRandomValues also works on HTTP development origins; randomUUID requires a secure context.
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
      session = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      sessionStorage.setItem(key, session);
    }
    return session;
  } catch { return null; }
}
function referrerHost() {
  try {
    const host = new URL(document.referrer).hostname.toLowerCase();
    return host !== location.hostname && /^[a-z0-9.-]{1,100}$/.test(host) ? host : null;
  } catch { return null; }
}

export function trackAnalytics(name: EventName, options: {
  pageType?: PageType; language?: "zh" | "en"; contentId?: string;
  durationMs?: number;
} = {}) {
  if (typeof window === "undefined" || location.pathname.startsWith("/admin")
    || navigator.doNotTrack === "1" || (navigator as Navigator & {globalPrivacyControl?: boolean}).globalPrivacyControl) return;
  const sessionId = anonymousSession();
  if (!sessionId) return;
  const page = options.pageType ?? pageType(location.pathname);
  const language = options.language ?? (document.documentElement.lang.startsWith("en") ? "en" : "zh");
  const contentId = options.contentId && /^[a-zA-Z0-9_-]{1,80}$/.test(options.contentId) ? options.contentId : undefined;
  const durationMs = options.durationMs === undefined ? undefined : Math.min(60000, Math.max(0, Math.round(options.durationMs)));
  const referrer = name === "page_view" ? referrerHost() : null;
  const event = {
    name, pageType: page, language, sessionId, ...(contentId ? { contentId } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(referrer ? { referrerHost: referrer } : {}),
  };
  // Fire-and-forget; analytics must never hold up navigation or throw in event handlers.
  void fetch("/api/analytics/events", {
    method: "POST", credentials: "omit", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(event),
  }).catch(() => {});
  if (current.posthogToken) {
    const host = current.posthogRegion === "eu" ? "https://eu.i.posthog.com" : "https://us.i.posthog.com";
    void fetch(host + "/capture/", {
      method: "POST", mode: "cors", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: current.posthogToken, event: name === "page_view" ? "$pageview" : name,
        properties: {
          distinct_id: sessionId, $session_id: sessionId, $process_person_profile: false,
          source: "eventgraph", site_host: location.hostname, $host: location.hostname,
          $current_url: location.origin + location.pathname, $pathname: location.pathname,
          page_type: page, language, ...(referrer ? { $referring_domain: referrer } : {}),
          ...(contentId ? { content_id: contentId } : {}), ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
        },
      }),
    }).catch(() => {});
  }
}
