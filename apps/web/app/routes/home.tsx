// The 精选 feed's list (and /en, the English edition of the same list). The page frame — overview,
// heading, filter row, aside — lives in routes/feed-layout.tsx; this route owns only what changes.
import { redirect, useLoaderData, useOutletContext } from "react-router";
import type { Route } from "./+types/home";
import type { TimelineResponse } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { filterParams, hasFeedFilters, itemListLd, listPath, localized, pageMeta, readFilters, siteLd } from "../lib/seo";
import type { Screen } from "../components/shell/screens";
import { Timeline } from "../features/feed/Timeline";
import { FollowingFeed } from "../features/home/Following";

export const handle: Screen = { tab: "featured", name: "观察" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (q && q.trim()) throw redirect(`/all${url.search}`);
  const filters = readFilters(url.searchParams);
  const upstream = new Headers();
  const signal = request.signal;
  const data = await loadOr404<TimelineResponse>(listPath("/api/site/timeline", filterParams(filters)), { responseHeaders: upstream, signal });
  return cachedPage(60, { data, filters }, upstream);
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const path = listPath("/", loaderData ? filterParams(loaderData.filters) : {});
  const titles = loaderData?.data.cards.map(c => c.item.title) ?? [];
  return localized(pageMeta({
    title: "事件观察",
    description: "实时追踪 AI、加密与金融事件，沿报道时间线深入长期知识关系与原始证据。",
    path, noindex: hasFeedFilters(loaderData?.filters),
    jsonLd: path === "/" ? [...siteLd(), itemListLd("/", "事件观察", titles)] : undefined,
  }), location.pathname, {
    title: "Event intelligence for AI, crypto & global events",
    description: "Follow AI, crypto, finance and global events as they develop — source-linked timelines and knowledge graphs, published for humans and AI agents.",
  });
}

export default function Home() {
  const { data, filters } = useLoaderData<typeof loader>();
  const { following } = useOutletContext<{ following: boolean }>();
  const filtered = Boolean(filters.tag || filters.category || (filters.channel !== "all"));
  return following && !filtered ? <FollowingFeed /> : <Timeline initial={data} filters={data.filters} />;
}
