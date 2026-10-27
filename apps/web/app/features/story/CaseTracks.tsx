// The cross-Story evolution experiment (specs/event-evolution-experiment): a curated case laid
// out as parallel read-only tracks. Each track is one public story's route re-read through the
// publication layer at request time; cross-track links are human annotations with verifiable
// evidence, never drawn as arrows between tracks — coincidence in time or topic stays unlinked.
import { Link } from "react-router";
import type { CaseStudyLink, CaseStudyResponse, CaseStudyTrack } from "@aihot/contracts/site";
import { IconArrowRight } from "../../components/icons";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { localizedRelativeTime } from "../../lib/format";

const LINK_TYPES: Record<CaseStudyLink["type"], { zh: string; en: string }> = {
  response: { zh: "响应", en: "Response" },
  citation: { zh: "引用", en: "Citation" },
  dependency: { zh: "依赖", en: "Dependency" },
  claim: { zh: "主张（有署名）", en: "Claim (attributed)" },
  "follow-up": { zh: "后续发展", en: "Follow-up" },
};

function Track({ track, prefix }: { track: CaseStudyTrack; prefix: string }) {
  const t = useText(), lang = useUiLanguage();
  const label = lang === "en" ? track.labelEn : track.label;
  const formatTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { timeZone: "Asia/Shanghai" }) : null;
  return <section className="rounded-panel border border-line-soft p-4" aria-label={label}>
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-[15px] font-semibold text-ink">{label}</h3>
      <Link to={`${prefix}/explore?story=${track.story.publicId}`}
        className="shrink-0 text-[12px] text-accent hover:underline">{t("打开回放 ↗", "Open replay ↗")}</Link>
    </div>
    {track.status !== "ok"
      ? <p className="mt-3 text-[13px] leading-[1.7] text-ink-4">
          {t("这条轨道当前没有可公开引用的证据，站点与证据已一并隐藏。",
             "This track has no publicly citable evidence right now; its stations and evidence are hidden with it.")}
        </p>
      : <>
        <p className="mt-1 text-[12px] text-ink-4">
          {t(`${track.coverage.stations} 个站点 · ${track.coverage.reports} 条证据 · ${track.coverage.sources} 个来源`,
             `${track.coverage.stations} stations · ${track.coverage.reports} evidence · ${track.coverage.sources} sources`)}
        </p>
        <ol className="mt-3 space-y-3 border-l-2 border-line pl-3">
          {track.stations.map((s) => <li key={s.factId}>
            <p className="text-[13px] font-medium leading-snug text-ink">{s.title}</p>
            <p className="mt-1 text-[12px] leading-[1.6] text-ink-4">
              {s.timeEffective
                ? t(`事实发生于 ${formatTime(s.timeEffective)}`, `Occurred ${formatTime(s.timeEffective)}`)
                : t("发生时间未有报道给出", "Occurrence time not reported")}
              {" · "}{t(`收录 ${formatTime(s.timeRecorded)}`, `recorded ${formatTime(s.timeRecorded)}`)}
            </p>
            {s.uncertainty.singleSource && <p className="text-[12px] text-ink-4">· {t("单一来源", "Single source")}</p>}
            {s.uncertainty.revised && <p className="text-[12px] text-ink-4">· {t("证据此后修订", "Evidence revised later")}</p>}
            <ul className="mt-1 space-y-1">
              {s.reports.map((r) => <li key={r.articleId} className="text-[12px] leading-[1.6] text-ink-3">
                {r.source}
                {" · "}{t("发布", "published")} {formatTime(r.publishedAt) ?? t("时间未给", "not stated")}
                {" · "}<a href={r.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{t("核查原文 ↗", "Check source ↗")}</a>
              </li>)}
            </ul>
          </li>)}
        </ol>
      </>}
  </section>;
}

export function CaseTracks({ data }: { data: CaseStudyResponse }) {
  const t = useText(), lang = useUiLanguage();
  const prefix = lang === "en" ? "/en" : "";
  return <div className="space-y-5">
    <header>
      <h1 data-page-title className="text-[22px] font-semibold leading-[1.3] text-ink">
        {lang === "en" ? data.titleEn : data.title}
      </h1>
      <p className="mt-2 max-w-[680px] text-[14px] leading-[1.8] text-ink-3">
        {lang === "en" ? data.summaryEn : data.summary}
      </p>
      <p className="mt-2 text-[12px] text-ink-4">
        {t(`阅读实验 · 案例更新 ${data.updated} · 轨道按当前公开证据实时组装`,
           `Reading experiment · case updated ${data.updated} · tracks rebuilt from today's public evidence`)}
      </p>
    </header>

    <p className="rounded-panel border border-line-soft bg-bg-sunk/40 px-4 py-3 text-[13px] leading-[1.7] text-ink-3">
      {t("每条轨道是一个独立事件的可核查路线：站点与证据来自本站公开记录，撤稿即消失。轨道之间不画箭头——下面的联系逐条人工标注类型与原始出处；同期发生或同属一个话题本身不是联系。",
        "Each track is one independent event's evidence-backed route: stations and evidence come from this site's public records and vanish with a withdrawal. No arrows are drawn between tracks — the links below are annotated one by one with their type and original source; sharing a time window or a topic is not a connection.")}
    </p>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {data.tracks.map((track) => <Track key={track.key} track={track} prefix={prefix} />)}
    </div>

    {data.links.length > 0 && <section aria-label={t("跨事件联系（人工标注）", "Cross-event links (annotated)")}>
      <h2 className="text-[16px] font-semibold text-ink">{t("跨事件联系（人工标注）", "Cross-event links (annotated)")}</h2>
      <ul className="mt-3 space-y-3">
        {data.links.map((link) => {
          const from = data.tracks.find((tr) => tr.key === link.from);
          const to = data.tracks.find((tr) => tr.key === link.to);
          const type = LINK_TYPES[link.type];
          return <li key={link.key} className="rounded-panel border border-line-soft p-4">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink">
              <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3">{lang === "en" ? type.en : type.zh}</span>
              <span>{lang === "en" ? from?.labelEn : from?.label}</span>
              <IconArrowRight size={14} className="shrink-0 text-ink-4" />
              <span>{lang === "en" ? to?.labelEn : to?.label}</span>
            </p>
            <p className="mt-2 text-[13px] leading-[1.7] text-ink-3">{lang === "en" ? link.noteEn : link.note}</p>
            <p className="mt-2 text-[12px] leading-[1.6] text-ink-4">
              {link.evidence.source}
              {" · "}{t("发布", "published")} {localizedRelativeTime(link.evidence.publishedAt, lang)}
              {" · "}<a href={link.evidence.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{t("核查出处 ↗", "Check source ↗")}</a>
              {link.evidence.attribution && <span className="block">{lang === "en" ? link.evidence.attributionEn : link.evidence.attribution}</span>}
              <span className="block">{t(`标注于 ${link.curatedAt}`, `Annotated ${link.curatedAt}`)}</span>
            </p>
          </li>;
        })}
      </ul>
    </section>}

    {data.unlinked.length > 0 && <section aria-label={t("同期但未画线", "Same window, deliberately unlinked")}>
      <h2 className="text-[16px] font-semibold text-ink">{t("同期但未画线", "Same window, deliberately unlinked")}</h2>
      <ul className="mt-3 space-y-2">
        {data.unlinked.map((u) => {
          const track = data.tracks.find((tr) => tr.key === u.track);
          return <li key={u.track} className="rounded-panel border border-line-soft p-3 text-[13px] leading-[1.7] text-ink-3">
            <span className="font-medium text-ink">{lang === "en" ? track?.labelEn : track?.label}：</span>
            {lang === "en" ? u.noteEn : u.note}
          </li>;
        })}
      </ul>
    </section>}

    <p className="text-[12px] leading-[1.7] text-ink-4">
      {t("时间口径：站点区分「事实发生于」（报道给出的发生/生效时间，未给出则明确标注）与「收录」（本站首次记录该证据）。站点按本站收录时间排列，来源原文的发布时间单独标出，不代表排序顺序。本页是阅读实验，不进入索引。",
        "Time semantics: each station separates \"occurred\" (the occurrence time reported by sources) from \"recorded\" (when this site first logged the evidence). Stations are ordered by recorded time; each source publication date is shown separately and is not the ordering key. This is a reading experiment and is not indexed.")}
    </p>
  </div>;
}
