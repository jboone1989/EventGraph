/**
 * Station-level source drawers (specs/event-impact-tracing-p1 §4): every field comes from the
 * existing route projection — original URL, /items entry, revision (null shown as the first
 * version, never hidden), occurred/published/discovered times, uncertainty flags and the closed
 * evidenceKind tag. Native <details> keeps expand/collapse accessible at 390px. Layers are
 * reading groups only: no arrows, chains or causal edges are ever drawn between them.
 */
import { Link } from "react-router";
import type { StoryRoute, StoryRouteReport, StoryRouteStation } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { localizedSourceName } from "../../lib/english";
import { localizedMonthDayTime } from "../../lib/format";
import { LAYER_LABELS, stationEvidenceAt, type ImpactStationLayer } from "./impact-layers";

export function EvidenceRow({ report, clock }: { report: StoryRouteReport; clock?: "known" | "valid" }) {
  const t = useText(), lang = useUiLanguage();
  const when = (iso: string | null) => iso ? localizedMonthDayTime(iso, lang) : t("未知", "unknown");
  const rows: Array<[string, string, boolean]> = [
    [t("发布（valid 侧）", "Published (valid side)"), when(report.publishedAt), clock === "valid"],
    [t("收录（known 侧）", "First seen (known side)"), when(report.discoveredAt), clock === "known"],
  ];
  return <div className="py-2 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <a href={report.url} target="_blank" rel="noopener noreferrer" data-analytics-event="source_open"
        className="text-[12.5px] font-medium text-accent hover:underline">
        {localizedSourceName(report.source, lang, report.url)} ↗
      </a>
      <Link to={(lang === "en" ? "/en" : "") + "/items/" + encodeURIComponent(report.articleId)}
        className="text-[11.5px] text-accent hover:underline">{t("本站报道页", "Report page")}</Link>
      <span className="text-[11.5px] text-ink-4">
        {report.revision
          ? <>{t("版本", "Revision")} {report.revision} · {t("现为修订版", "currently revised")}</>
          : t("原版 / Original", "Original / first version")}
      </span>
    </div>
    <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-[11.5px] text-ink-4 sm:grid-cols-2">
      {rows.map(([label, value, active]) => <div key={label} className="flex gap-1.5">
        <dt>{label}：</dt>
        <dd className={active ? "font-medium text-ink-3" : undefined}>{value}</dd>
        {active && <dd className="text-[10.5px] text-ink-4">({t("当前时钟依据", "this clock's basis")})</dd>}
      </div>)}
    </dl>
  </div>;
}

/** The expandable evidence drawer for one station; reused by the story route panel. */
export function StationEvidenceDrawer({ station, clock }: { station: StoryRouteStation; clock?: "known" | "valid" }) {
  const t = useText(), lang = useUiLanguage();
  const badge = "rounded border border-line-soft px-1.5 py-0.5";
  const structured: Array<[string, string | null]> = [
    [t("主体", "Subject"), station.subject],
    [t("动作", "Action"), station.action],
    [t("客体", "Object"), station.object],
  ];
  return <details className="mt-1 group">
    <summary className="cursor-pointer list-none text-[12px] font-medium text-accent hover:underline">
      {t("证据与修订", "Evidence & revisions")} · {station.reports.length} {t("条来源记录", "source records")}
    </summary>
    <div className="mt-2 rounded-panel border border-line-soft bg-bg-sunk/30 p-3">
      {structured.some(([, v]) => v) && <dl className="mb-2 grid gap-x-4 gap-y-0.5 text-[11.5px] text-ink-4 sm:grid-cols-3">
        {structured.map(([label, value]) => <div key={label} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0">{label}：</dt>
          <dd className="truncate" title={value ?? undefined}>{value ?? t("未记录", "not recorded")}</dd>
        </div>)}
      </dl>}
      <dl className="mb-2 text-[11.5px] text-ink-4">
        <div className="flex gap-1.5">
          <dt>{t("发生（事实侧）", "Occurred (fact side)")}：</dt>
          <dd>{station.timeEffective ? localizedMonthDayTime(station.timeEffective, lang) : t("未记录", "not recorded")}</dd>
        </div>
      </dl>
      <div className="divide-y divide-line-soft">
        {station.reports.map(r => /^https?:\/\//i.test(r.url)
          ? <EvidenceRow key={r.articleId} report={r} clock={clock} />
          : null)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-4">
        <span className={badge}>{t("事实站", "Fact station")}</span>
        {station.uncertainty.singleSource && <span className={badge}>{t("单一来源 · 单方主张", "Single source · one-sided claim")}</span>}
        {station.uncertainty.revised && <span className={badge}>{t("有修订", "Revised")}</span>}
        {station.uncertainty.occurredAtMissing && <span className={badge}>{t("仅报道时间", "Report-time only")}</span>}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-4">
        {t("报道文字可能被事后修订，双时间视图是有界重建；层标签只决定阅读分组，不是层间因果。",
          "Copy may have been revised later; time replay is bounded. Layer labels group reading only, not causation between layers.")}
      </p>
    </div>
  </details>;
}

export function LayerBadge({ layer }: { layer: ImpactStationLayer }) {
  const lang = useUiLanguage();
  return <span className="rounded border border-line-soft bg-bg-sunk/50 px-1.5 py-0.5 text-[11px] text-ink-3">
    {LAYER_LABELS[layer][lang === "zh" ? 0 : 1]}
  </span>;
}

/** The typed fact-station list of the impact workbench; hidden stations are only hidden. */
export function StationEvidenceList({ route, asOf, clock }: {
  route: StoryRoute | null;
  asOf: string | undefined;
  clock: "known" | "valid";
}) {
  const t = useText(), lang = useUiLanguage();
  const when = (iso: string) => localizedMonthDayTime(iso, lang);
  const items = stationEvidenceAt(route, asOf, clock);
  return <section data-testid="impact-stations" aria-label={t("事实站与证据抽屉", "Fact stations and evidence drawers")}
    className="rounded-panel border border-line-soft p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-[16px] font-semibold text-ink">{t("事实站与层标签", "Fact stations & layer labels")}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">
          {t("每站带类型标签与站级来源抽屉；关键词只决定这条事实在哪个层被阅读，层与层之间不画因果连线。",
            "Every station carries a type label and a source drawer; keywords only decide where a fact is read. No causal arrows are drawn between layers.")}
        </p>
      </div>
      <span className="shrink-0 rounded-control border border-line-soft px-2 py-1 text-[11px] text-ink-4">
        {items.length} {t("站", "stations")}
      </span>
    </header>
    {items.length ? <ol className="mt-3 space-y-3" data-station-count={items.length}>
      {items.map(({ station, layer }) => <li key={station.factId} className="border-l-2 border-line-soft pl-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-4">
          <span data-layer={layer}><LayerBadge layer={layer} /></span>
          <span className="num">{station.timeEffective ? when(station.timeEffective) : when(station.timeRecorded)}</span>
          {station.timeEffective && <span className="num">{t("收录于", "recorded")} {when(station.timeRecorded)}</span>}
        </div>
        <p className="mt-1 text-[14px] font-semibold leading-[1.6] text-ink">{station.title}</p>
        <StationEvidenceDrawer station={station} clock={clock} />
      </li>)}
    </ol> : <p className="mt-3 text-[13px] leading-relaxed text-ink-4">
      {t("该时点没有可显示的事实站：报道须有原文链接与可核时间，无可显示报道的站只说明证据不可展示，不能反推当时不存在。",
        "No displayable fact station at this cutoff: reports need an original link and verifiable times. A hidden station only means its evidence is not displayable, not that it did not exist.")}
    </p>}
  </section>;
}
