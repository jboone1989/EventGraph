import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { StoryReportView } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText } from "../../components/EnglishStory";
import { buildReplayFrames } from "./replay";

interface Props {
  reports: StoryReportView[];
  totalReports: number;
}

/** Client-only controls over already-public source reports; no generative call on page load. */
export function EventTimeMachine({ reports, totalReports }: Props) {
  const t = useText();
  const lang = useUiLanguage();
  const frames = useMemo(() => buildReplayFrames(reports), [reports]);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = Math.max(0, frames.length - 1);
  const step = Math.min(position, last);
  const frame = frames[step];
  const date = (iso: string) => new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setPosition((p) => Math.min(p + 1, last)), 1700);
    return () => window.clearTimeout(timer);
  }, [playing, step, last]);

  if (!frame) {
    return <p className="text-[13px] text-ink-4">{t("暂无带有效发布时间的报道。", "No reports with valid publication times.")}</p>;
  }
  const titleOf = (r: StoryReportView) => lang === "zh"
    ? r.title
    : r.english?.title ?? englishText(r.originalTitle) ?? englishText(r.title) ?? "Original-language report";
  const summaryOf = (r: StoryReportView) => lang === "zh" ? r.summary : (r.english?.summary ?? englishText(r.summary));

  return (
    <div aria-label={t("事件时间回放", "Event report playback")} className="space-y-4">
      <div className="rounded-panel border border-line-soft bg-bg-sunk/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">EVENT REPLAY</span>
          <span className="num text-[12px] text-ink-4">
            {t("阶段", "Step")} {step + 1} / {frames.length}
          </span>
        </div>
        <time dateTime={frame.publishedAt} className="mt-2 block text-[19px] font-semibold text-ink">{date(frame.publishedAt)}</time>
        <label htmlFor="event-replay-position" className="mt-4 block text-[12px] text-ink-3">
          {t("拖动时间轴，查看当时已发布的报道", "Move through publication history")}
        </label>
        <input id="event-replay-position" type="range" min={0} max={last} step={1} value={step}
          disabled={frames.length < 2} onChange={(e) => { setPlaying(false); setPosition(Number(e.target.value)); }}
          aria-valuetext={date(frame.publishedAt)}
          className="mt-2 w-full cursor-pointer accent-current disabled:opacity-40"/>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={step === 0}
            onClick={() => { setPlaying(false); setPosition((n) => Math.max(0, n - 1)); }}
            className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink disabled:opacity-40">
            ← {t("上一阶段", "Previous")}
          </button>
          <button type="button" disabled={frames.length < 2}
            onClick={() => {
              if (playing) { setPlaying(false); return; }
              if (step === last) setPosition(0);
              setPlaying(true);
            }}
            aria-pressed={playing}
            className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink disabled:opacity-40">
            {playing ? t("暂停", "Pause") : t("播放", "Play")} {playing ? "Ⅱ" : "▶"}
          </button>
          <button type="button" disabled={step === last}
            onClick={() => { setPlaying(false); setPosition((n) => Math.min(last, n + 1)); }}
            className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink disabled:opacity-40">
            {t("下一阶段", "Next")} →
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: t("累计报道", "Reports so far"), value: frame.total },
          { label: t("一手资料", "First-party"), value: frame.firstParty },
          { label: t("报道来源", "Sources"), value: frame.sources },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-line-soft p-2">
            <dt className="text-[11px] text-ink-4">{label}</dt>
            <dd className="num mt-1 text-[19px] font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="text-[14px] font-semibold text-ink">
          {t("本阶段新增报道", "Reports published at this step")} · {frame.reports.length}
        </h3>
        <ul className="mt-2 divide-y divide-line-soft">
          {frame.reports.map((report) => (
            <li key={report.id} className="py-3">
              <div className="text-[12px] text-ink-4">
                {report.source.name} · {report.source.firstParty ? t("一手资料", "First-party") : t("第三方报道", "Third-party")}
              </div>
              <Link viewTransition to={lang === "en" ? `/en/items/${report.id}` : `/items/${report.id}`}
                className="mt-1 block text-[14px] font-semibold leading-relaxed text-ink hover:text-accent">
                {titleOf(report)}
              </Link>
              {summaryOf(report) && <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-ink-3">{summaryOf(report)}</p>}
              {report.originalUrl && /^https?:\/\//i.test(report.originalUrl) && (
                <a href={report.originalUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block text-[12px] text-accent hover:underline">
                  {t("查看原始来源", "Original source")} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11.5px] leading-relaxed text-ink-4">
        {t(
          "按报道的公开发布时间回放，不代表 EventGraph 当时已收录这些报道；旁边的知识图谱展示当前关系，不随此时间轴回溯。",
          "Replay follows publication timestamps, not ingestion times. The knowledge graph on this page remains a current snapshot, not an as-of graph."
        )}
        {totalReports > reports.length && (
          <> {t(`此处仅覆盖时间线返回的 ${reports.length} / ${totalReports} 篇报道。`,
            `This replay covers only ${reports.length} of ${totalReports} reports returned in the timeline.`)}</>
        )}
      </p>
    </div>
  );
}
