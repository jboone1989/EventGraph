import type { StoryDetail, StoryRoute } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText } from "../../lib/english";
import { EVIDENCE_DOMAINS, energyShippingEvidenceAt } from "./energy-shipping-evidence";

/** A source drawer on the existing impact station, using its shared replay clock. */
export function EnergyShippingEvidence({ story, route, asOf, clock }: {
  story: StoryDetail; route: StoryRoute | null;
  asOf: string | undefined; clock: "known" | "valid";
}) {
  const t = useText(), lang = useUiLanguage();
  const evidence = energyShippingEvidenceAt(route, story.timeline, asOf, clock);
  return <section data-testid="energy-shipping-evidence" className="mt-4 border-t border-line-soft pt-4">
    <h4 className="text-[13.5px] font-semibold text-ink">{t("能源与航运证据", "Energy & shipping evidence")}</h4>
    <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
      {t("仅展示所选时点的公开报道线索，不是价格、运价或过峡计数。报道中的数字未转换为指标。",
        "Public reporting leads at the selected cutoff, not prices, freight rates or transit counts. Numbers in reports are not converted to indicators.")}
    </p>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {EVIDENCE_DOMAINS.map(domain => <section key={domain} data-evidence-domain={domain}
        className="min-w-0 rounded-panel border border-line-soft p-3">
        <h5 className="text-[13px] font-semibold text-ink">{domain === "energy" ?
          t("EIA 能源报道", "EIA energy reporting") : t("航运报道", "Shipping reporting")}</h5>
        {evidence[domain].length ? <ul className="mt-2 space-y-2">
          {evidence[domain].slice(0, 4).map(row => <li key={row.articleId} className="break-words text-[12px] text-ink-3">
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {lang === "zh" ? row.title : englishText(row.englishTitle) ?? englishText(row.title) ?? "Original-language report"}
            </a>
            <details className="mt-1">
              <summary className="cursor-pointer">{t("来源与时间", "Source & times")}</summary>
              <p>{new URL(row.url).hostname} · {t("报道线索", "Reporting lead")}</p>
              <p>{t("发布", "Published")}: <time dateTime={row.publishedAt!}>{row.publishedAt}</time></p>
              <p>{t("收录", "Discovered")}: <time dateTime={row.discoveredAt}>{row.discoveredAt}</time></p>
              <p>{t("当前修订版", "Current revision")}: {row.revision ?? t("原版", "Original")}</p>
              {domain === "energy" && <p>Source: U.S. Energy Information Administration</p>}
              <a className="text-accent hover:underline" href={`${lang === "en" ? "/en" : ""}/items/${encodeURIComponent(row.articleId)}`}>
                {t("阅读本站报道与证据", "Open report and provenance")}
              </a>
            </details>
          </li>)}
        </ul> : <p className="mt-2 text-[12px] text-ink-4">{t("该时点没有已加载的公开证据，不代表没有变化。",
          "No loaded public evidence at this cutoff; this does not establish absence of change.")}</p>}
        {evidence[domain].length > 4 && <p className="mt-2 text-[11px] text-ink-4">{t("仅展示前四条线索。", "Showing first four leads.")}</p>}
      </section>)}
    </div>
    <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
      {t("尚无可比数值序列，基线、交易日和窗口闭合未验证。PortWatch 未获商用许可，不展示其数据；无运价指标。能源波动还可能来自供需、库存与汇率；航运变化还可能来自既有封锁、改道与 AIS/GNSS 观测缺口。共现不能证明事件效应。",
        "No comparable numeric series; baselines, trading days and window closure are unverified. PortWatch data is withheld pending commercial permission; no freight indicators. Energy moves may also reflect supply, demand, inventories and currencies; shipping changes may reflect existing blockades, rerouting and AIS/GNSS observation gaps. Co-occurrence does not establish an event effect.")}
    </p>
  </section>;
}
