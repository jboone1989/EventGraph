import { type RouteConfig, type RouteConfigEntry, index, layout, route } from "@react-router/dev/routes";
import type { ModulePage } from "@aihot/contracts/modules";
import { MODULES } from "@aihot/site/modules";

/** A module's route module, from the app directory. */
const file = (module: string, path: string) => `../../../modules/${module}/${path}`;
const page = (module: string, p: ModulePage) => route(p.path, file(module, p.file), p.id ? { id: p.id } : {});

/** The site's modules' pages, after the engine's. */
const modulePages: RouteConfigEntry[] = MODULES.flatMap((m) =>
  (m.pages ?? []).map((p) => ("layout" in p ? layout(file(m.name, p.layout), p.id ? { id: p.id } : {}, p.pages.map((c) => page(m.name, c))) : page(m.name, p))),
);
const moduleAdminPages: RouteConfigEntry[] = MODULES.flatMap((m) => (m.adminPages ?? []).map((p) => page(m.name, p)));

export default [
  // The two feed scopes (/ and /all) render inside one persistent frame (routes/feed-layout.tsx)
  // so switching 精选/全部 swaps only the list; the ids are asserted by tests/cache.test.ts.
  layout("routes/feed-layout.tsx", { id: "feed-layout" }, [
    index("routes/home.tsx", { id: "routes/home" }),
    route("all", "routes/all.tsx", { id: "routes/all" }),
    route("en", "routes/home.tsx", { id: "en-home" }),
  ]),
  route("all/search-busy", "routes/search-busy.tsx", { id: "all-search-busy" }),
  route("search-busy", "routes/search-busy.tsx", { id: "search-busy" }),
  route("items/:id", "routes/item.tsx"),
  route("items/:id/original", "routes/item-original.tsx", { id: "item-original" }),
  route("hot", "routes/hot.tsx"),
  route("knowledge", "routes/knowledge.tsx"),
  route("knowledge/entity/:key", "routes/knowledge-entity.tsx"),
  route("explore", "routes/explore.tsx"),
  route("story/:publicId", "routes/story.tsx"),
  route("daily", "routes/report-latest.tsx", { id: "daily-latest" }),
  route("daily/archive", "routes/daily-archive.tsx"),
  route("daily/:key", "routes/report-detail.tsx", { id: "daily-detail" }),
  route("weekly", "routes/report-latest.tsx", { id: "weekly-latest" }),
  route("weekly/:key", "routes/report-detail.tsx", { id: "weekly-detail" }),
  route("monthly", "routes/report-latest.tsx", { id: "monthly-latest" }),
  route("monthly/:key", "routes/report-detail.tsx", { id: "monthly-detail" }),
  route("topics", "routes/topics.tsx"),
  route("topics/:slug", "routes/topic.tsx", { id: "topic" }),
  route("topics/:slug/page/:page", "routes/topic.tsx", { id: "topic-page" }),
  route("about", "routes/about.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("changelog", "routes/changelog.tsx"),
  route("feedback", "routes/feedback.tsx"),
  route("more", "routes/more.tsx"),
  route("starred", "routes/starred.tsx"),
  route("agent", "routes/agent.tsx"),
  // The English edition (lib/edition.ts): the same pages at stable /en addresses.
  route("en/hot", "routes/hot.tsx", { id: "en-hot" }),
  route("en/knowledge", "routes/knowledge.tsx", { id: "en-knowledge" }),
  route("en/knowledge/entity/:key", "routes/knowledge-entity.tsx", { id: "en-knowledge-entity" }),
  route("en/explore", "routes/explore.tsx", { id: "en-explore" }),
  route("en/story/:publicId", "routes/story.tsx", { id: "en-story" }),
  route("en/items/:id", "routes/item.tsx", { id: "en-items-detail" }),
  route("en/daily", "routes/report-latest.tsx", { id: "en-daily-latest" }),
  route("en/daily/archive", "routes/daily-archive.tsx", { id: "en-daily-archive" }),
  route("en/daily/:key", "routes/report-detail.tsx", { id: "en-daily-detail" }),
  route("en/weekly", "routes/report-latest.tsx", { id: "en-weekly-latest" }),
  route("en/weekly/:key", "routes/report-detail.tsx", { id: "en-weekly-detail" }),
  route("en/monthly", "routes/report-latest.tsx", { id: "en-monthly-latest" }),
  route("en/monthly/:key", "routes/report-detail.tsx", { id: "en-monthly-detail" }),
  route("en/topics", "routes/topics.tsx", { id: "en-topics" }),
  route("en/topics/:slug", "routes/topic.tsx", { id: "en-topic" }),
  route("en/privacy", "routes/privacy.tsx", { id: "en-privacy" }),
  route("en/terms", "routes/terms.tsx", { id: "en-terms" }),
  route("calendar", "routes/calendar.tsx"),
  route("en/calendar", "routes/calendar.tsx", { id: "en-calendar" }),
  ...modulePages,
  route("admin/login", "routes/admin-login.tsx"),
  layout("routes/admin/layout.tsx", { id: "admin-layout" }, [
    route("admin", "routes/admin/index.tsx"),
    route("admin/content", "routes/admin/content.tsx"),
    route("admin/content/:id", "routes/admin/content-item.tsx"),
    route("admin/sources", "routes/admin/sources.tsx"),
    route("admin/sources/new", "routes/admin/source-new.tsx"),
    route("admin/sources/:id", "routes/admin/source.tsx"),
    route("admin/feedback", "routes/admin/feedback.tsx"),
    route("admin/analytics", "routes/admin/analytics.tsx"),
    route("admin/runs", "routes/admin/runs.tsx"),
    route("admin/models", "routes/admin/models.tsx"),
    route("admin/settings", "routes/admin/settings.tsx"),
    route("admin/audit", "routes/admin/audit.tsx"),
    ...moduleAdminPages,
  ]),
] satisfies RouteConfig;
