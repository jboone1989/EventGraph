import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/report-detail";
import type { ReportDetail, ReportNavigationResponse, ReportKind } from "@aihot/contracts/site";
import { SITE, subjectAfter } from "@aihot/site";
import { EDITOR_NOTES } from "@aihot/site/editor-notes";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta, reportLd, reportTitle, titled } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { ReportLayout } from "../features/report/ReportLayout";
import { useUiLanguage } from "../components/LanguageSwitch";
import { ReportPaper, reportOutline } from "../features/report/ReportPaper";
import { GraphChanges, type DailyGraphChanges } from "../features/report/GraphChanges";
import { KIND_LABEL, kindLabel, feedLink, kindFromPath } from "../features/report/format";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "日报" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

const PATTERN: Record<ReportKind, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-W\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const key = params.key ?? "";
  if (!PATTERN[kind].test(key)) throw data({ message: "not_found" }, { status: 404 });
  const [report, { items: index }, graph] = await Promise.all([
    loadOr404<ReportDetail>(`/api/site/reports/${kind}/${key}`, { signal: request.signal }),
    apiGet<ReportNavigationResponse>(`/api/site/reports/${kind}/navigation/${key}`, { signal: request.signal }),
    kind === "daily" ? apiGet<DailyGraphChanges>(`/api/site/knowledge/daily/${key}`, { signal: request.signal, timeoutMs: 2_000 }).catch(() => null) : null,
  ]);
  return cachedPage(3600, { report, index, graph, today: beijingDate(Date.now()) });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("报告不存在") }, { name: "robots", content: "noindex" }];
  const r = loaderData.report;
  const description = r.lead?.leadParagraph ?? r.overview?.slice(0, 150) ?? `${SITE.name} ${r.key} ${subjectAfter("的", KIND_LABEL[r.kind])}。`;
  const path = `/${r.kind}/${r.key}`;
  const kind = kindLabel(r.kind, "en").toLowerCase();
  return [...localized(pageMeta({
    title: reportTitle(r),
    description,
    path,
    image: `/og/reports/${r.kind}/${r.key}.png`,
    type: "article",
    jsonLd: reportLd(r, path, description),
  }), location.pathname, {
    title: `${kindLabel(r.kind, "en")} · ${r.key}`,
    description: `The ${r.key} ${kind}: the period's most important reports with links to their original sources${r.kind === "daily" ? ", and what changed in the knowledge graph" : ""}.`,
  }), feedLink(r.kind)];
}

export default function ReportDetailPage() {
  const language = useUiLanguage();
  const { report, index, graph, today } = useLoaderData<typeof loader>();
  // The editor's own note for this daily, written in site/editor-notes.ts (specs/003-content-assets FR-004).
  const editorNote = report.kind === "daily" ? EDITOR_NOTES[report.key] ?? null : null;
  return (
    <ReportLayout kind={report.kind} index={index} current={report.key} today={today} outline={reportOutline(report, language)}>
      <ReportPaper report={report} index={index} lang={language} editorNote={editorNote} />
      <GraphChanges changes={graph} />
    </ReportLayout>
  );
}
