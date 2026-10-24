import { useLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import type { ReportLatestPage } from "@aihot/contracts/site";
import { REPORTS, subjectAfter, withSubject } from "@aihot/site";
import { apiGet, cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta, reportLd } from "../lib/seo";
import { chinesePath } from "../lib/edition";
import { beijingDate } from "@aihot/contracts/time";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { ReportPaper, reportOutline } from "../features/report/ReportPaper";
import { GraphChanges, type DailyGraphChanges } from "../features/report/GraphChanges";
import { KIND_LABEL, kindLabel, feedLink, kindFromPath } from "../features/report/format";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "daily", name: "日报" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const { index, report } = await loadOr404<ReportLatestPage>(`/api/site/reports/${kind}/latest-page`, { signal: request.signal });
  const graph = kind === "daily" && report
    ? await apiGet<DailyGraphChanges>(`/api/site/knowledge/daily/${report.key}`, { signal: request.signal, timeoutMs: 2_000 }).catch(() => null)
    : null;
  return cachedPage(600, { kind, report, index, graph, today: beijingDate(Date.now()) });
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  const description = `${REPORTS.descriptions[kind]}。`;
  const report = loaderData?.report;
  const path = chinesePath(location.pathname);
  const enKind = kindLabel(kind, "en");
  return [...localized(pageMeta({
    title: kind === "daily" ? KIND_LABEL[kind] : withSubject(KIND_LABEL[kind]),
    description,
    path,
    image: `/og/pages/${kind}.png`,
    // The latest issue, described at this page's own address (its canonical).
    jsonLd: report ? reportLd(report, path, report.lead?.leadParagraph ?? description) : undefined,
  }), location.pathname, {
    title: enKind,
    description: `The latest ${enKind.toLowerCase()}: the period's most important reports with links to their original sources${kind === "daily" ? ", and what changed in the knowledge graph" : ""}.`,
  }), feedLink(kind)];
}

export default function ReportLatestPage() {
  const language = useUiLanguage();
  const t = useText();
  const { kind, report, index, graph, today } = useLoaderData<typeof loader>();
  // The editor's own note for this daily, written in the admin (specs/004-editorial-ops FR-001).
  const editorNote = kind === "daily" && report?.editorNote ? { note: report.editorNote.note, noteEn: report.editorNote.noteEn ?? undefined } : null;
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today} outline={report ? reportOutline(report, language) : []}>
      {report ? (
        <>
          <ReportPaper report={report} index={index} lang={language} editorNote={editorNote} />
          <GraphChanges changes={graph} />
        </>
      ) : (
        <EmptyState title={t(kind === "daily" ? "还没有发布日报" : subjectAfter("还没有发布", KIND_LABEL[kind]), `No ${kindLabel(kind, "en").toLowerCase()} published yet`)}>
          {t("第一期发布后会出现在这里。", "The first issue will appear here once it is out.")}
        </EmptyState>
      )}
    </ReportLayout>
  );
}
