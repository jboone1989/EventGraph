// Pure classification/aggregation of real Search Console landing-page rows.
// This is a returned-row sample, not a replacement for the independently queried site total.
export type LandingKind = "news" | "story" | "topic" | "daily" | "other";
type PageRow = { page: string; clicks: number; impressions: number; ctr: number; position: number };
export type PageKindStats = {
  kind: LandingKind; pages: number; clicks: number; impressions: number;
  ctr: number; position: number | null;
};

export function landingKind(page: string, siteHost: string): LandingKind {
  try {
    const u = new URL(page);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "other";
    const host = (s: string) => s.toLowerCase().replace(/^www\./, "");
    if (host(u.hostname) !== host(siteHost)) return "other";
    const p = u.pathname.replace(/\/+$/, "") || "/";
    if (/^\/(?:en\/)?items\/[^/]+$/.test(p)) return "news";
    if (/^\/(?:en\/)?story\/[^/]+$/.test(p)) return "story";
    if (/^\/(?:en\/)?topics(?:\/|$)/.test(p)) return "topic";
    if (/^\/(?:en\/)?(?:daily|weekly|monthly)(?:\/|$)/.test(p)) return "daily";
  } catch { /* Malformed Search Console row: do not throw away a whole report. */ }
  return "other";
}

export function summarizeLandingPages(rows: PageRow[], siteHost: string, rowLimit: number) {
  const order: LandingKind[] = ["news", "story", "topic", "daily", "other"];
  const bucket = new Map<LandingKind, { pages: number; clicks: number; impressions: number; weightedPosition: number }>(
    order.map(kind => [kind, { pages: 0, clicks: 0, impressions: 0, weightedPosition: 0 }]));
  for (const r of rows) {
    const b = bucket.get(landingKind(r.page, siteHost))!;
    b.pages++;
    b.clicks += r.clicks;
    b.impressions += r.impressions;
    b.weightedPosition += r.position * r.impressions;
  }
  const pageTypes: PageKindStats[] = order.map(kind => {
    const b = bucket.get(kind)!;
    return { kind, pages: b.pages, clicks: b.clicks, impressions: b.impressions,
      ctr: b.impressions ? b.clicks / b.impressions : 0,
      position: b.impressions ? b.weightedPosition / b.impressions : null };
  });
  // Prioritize actual impressions, not Google's click-ranked default page Top 10.
  const opportunities = rows.filter(r => landingKind(r.page, siteHost) === "news" && r.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions || a.ctr - b.ctr)
    .slice(0, 12);
  return { pageTypes, opportunities, pageRows: rows.length, pagesTruncated: rows.length >= rowLimit };
}
