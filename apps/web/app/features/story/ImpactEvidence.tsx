import type { StoryDetail, StoryRoute } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText, hasHan } from "../../lib/english";
import { localizedMonthDayTime } from "../../lib/format";
import type { StoryMarket } from "./EventPrices";
import { IMPACT_AREAS, impactLeadsAt, marketObservationAt, type ImpactArea } from "./impact-evidence";

const COPY: Record<ImpactArea, [string, string, string, string]> = {
  policy: ["政策报道线索", "Policy reporting", "没有可核查的政策报道线索，不能据此断言没有政策变化。",
    "No policy reporting lead found; this does not prove there was no policy change."],
  logistics: ["航运与供应链", "Logistics & supply", "没有可核查的航运或供应链线索；不推断供应中断。",
    "No shipping or supply-chain lead found; disruption is not inferred."],
  companies: ["企业影响线索", "Company-impact reporting", "没有可核查的企业影响线索；公司被提及不等于受到损失。",
    "No company exposure lead found; a mention alone does not establish impact."],
};
const price = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 1 : 4 });

/** Source-linked leads at the shared Explorer cutoff; never render inferred causal edges. */
export function ImpactEvidence({ story, route, market, asOf, clock }: {
  story: StoryDetail;
  route: StoryRoute | null;
  market: StoryMarket | null;
  asOf: string | undefined;
  clock: "known" | "valid";
}) {
  const t = useText(), lang = useUiLanguage();
  const leads = impactLeadsAt(route, story.timeline, asOf, clock);
  const observed = marketObservationAt(market, asOf);
  const sourceName = (name: string, url: string) => {
    if (lang !== "en" || !hasHan(name)) return name;
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return "Source"; }
  };
  return <section data-testid="impact-evidence" aria-label={t("事件影响证据", "Event impact evidence")}
    className="rounded-panel border border-line-soft p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-[16px] font-semibold text-ink">{t("影响证据与待核查线索", "Impact evidence & leads")}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">
          {t("从公开报道中筛选线索，不自动认定政策生效、供应中断、企业损失或市场因果。",
            "Public reports provide reading leads, not proof of a policy action, supply disruption, company loss or market causation.")}
        </p>
      </div>
      <span className="shrink-0 rounded-control border border-line-soft px-2 py-1 text-[11px] text-ink-4">
        {clock === "known" ? t("当时已收录", "Seen by cutoff") : t("当时已发布", "Published by cutoff")}
      </span>
    </header>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {IMPACT_AREAS.map(area => {
        const rows = leads[area].slice(0, 4), copy = COPY[area];
        return <section key={area} data-impact-area={area} className="min-w-0 rounded-panel border border-line-soft bg-bg-sunk/30 p-3.5">
          <h4 className="flex items-baseline justify-between gap-2 text-[13.5px] font-semibold text-ink">
            <span>{lang === "zh" ? copy[0] : copy[1]}</span>
            <span className="num text-[11px] font-normal text-ink-4">{leads[area].length} {t("条线索","leads")}</span>
          </h4>
          {rows.length ? <ul className="mt-2 divide-y divide-line-soft">
            {rows.map(row => {
              const heading = lang === "zh" ? row.title :
                englishText(row.englishTitle) ?? englishText(row.title) ?? "Original-language report";
              return <li key={row.articleId} className="py-2.5">
                <a href={row.url} target="_blank" rel="noopener noreferrer" data-analytics-event="source_open"
                  className="block text-[13px] font-medium leading-[1.55] text-ink-2 hover:text-accent">
                  {heading} <span aria-hidden="true" className="text-accent">↗</span>
                </a>
                <div className="mt-1 text-[11px] text-ink-4">
                  {sourceName(row.source,row.url)} · {localizedMonthDayTime(clock === "known" ? row.discoveredAt : row.publishedAt ?? row.discoveredAt, lang)}
                  {row.revision && <span> · {t("现为修订版","Current revision")} {row.revision}</span>}
                </div>
                <a href={(lang === "en" ? "/en" : "") + "/items/" + encodeURIComponent(row.articleId)}
                  className="mt-1 inline-block text-[11.5px] text-accent hover:underline">
                  {t("阅读本站报道与证据","Open report and provenance")}
                </a>
              </li>;
            })}
          </ul> : <p className="mt-2 text-[12.5px] leading-relaxed text-ink-4">{lang === "zh" ? copy[2] : copy[3]}</p>}
          {leads[area].length > rows.length && <p className="mt-2 text-[11.5px] text-ink-4">
            {t("仅展示前四条线索。", "Showing first four leads.")}
          </p>}
        </section>;
      })}
      <section data-impact-area="markets" className="min-w-0 rounded-panel border border-line-soft bg-bg-sunk/30 p-3.5">
        <h4 className="text-[13.5px] font-semibold text-ink">{t("市场观测","Market observations")}</h4>
        {observed?.assets.length ? <>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">
            {t("所选时点已记录的交易所现货快照，不是跨市场归因研究。",
              "Exchange spot snapshots recorded by this cutoff, not an attribution analysis.")}
          </p>
          <ul className="mt-2 divide-y divide-line-soft">
            {observed.assets.map(row => <li key={row.asset} className="py-2 text-[12.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono font-semibold text-ink">{row.asset} / USDT</span>
                <span className="font-mono text-ink-2">{row.changePercent > 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</span>
              </div>
              <div className="mt-0.5 text-ink-3">{price(row.before.priceUsdt)} → {price(row.after.priceUsdt)}</div>
              <p className="mt-0.5 text-[11px] text-ink-4">{localizedMonthDayTime(row.before.at,lang)} → {localizedMonthDayTime(row.after.at,lang)}</p>
            </li>)}
          </ul>
        </> : <p className="mt-2 text-[12.5px] leading-relaxed text-ink-4">
          {t("该时点没有完整可比的市场快照。油气、运价及股票尚未覆盖。",
            "No complete comparable snapshots at this cutoff. Oil, freight and equities are not yet covered.")}
        </p>}
      </section>
    </div>
    <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
      {t("当前公开事件内的关键词线索，不是已核验的政策状态或企业供应链关系。报道文字可能被事后修订，双时间视图是有界重建。",
        "Keyword leads from currently public reports, not verified policy states or supplier relationships. Copy may have been revised later; time replay is bounded.")}
      {route?.limits.truncated && " " + t("部分事件证据被截断，不能据此排除其他影响。",
        "Some evidence is truncated; missing leads do not establish absence of impact.")}
      {story.reportCount > story.timeline.length && " " + t("只包含已加载的公开报道。",
        "Only loaded public reports are considered.")}
    </p>
  </section>;
}
