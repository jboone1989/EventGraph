import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import type { StoryReportView } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText } from "../../components/EnglishStory";
import { buildReplayFrames } from "./replay";

interface Props {
  reports: StoryReportView[];
  totalReports: number;
  clock?: "known" | "published";
  position?: number;
  onPosition?: (position: number) => void;
}

/** Client-only controls over already-public source reports; no generative call on page load. */
export function EventTimeMachine({ reports, totalReports, clock = "published", position: controlledPosition, onPosition }: Props) {
  const t = useText();
  const lang = useUiLanguage();
  const frames = useMemo(() => buildReplayFrames(reports, clock), [reports, clock]);
  const [localPosition, setLocalPosition] = useState(0);
  const position = controlledPosition ?? localPosition;
  const setPosition = (next: number | ((previous: number) => number)) => {
    const value = typeof next === "function" ? next(position) : next;
    if (onPosition) onPosition(value); else setLocalPosition(value);
  };
  const [playing, setPlaying] = useState(false);
  const trackId = useId();
  const last = Math.max(0, frames.length - 1);
  const step = Math.min(position, last);
  const frame = frames[step];
  const covered = frames[last]?.total ?? 0;
  const partial = covered < totalReports || covered < reports.length;
  const formatter = useMemo(() => new Intl.DateTimeFormat(lang === "en" ? "en-US" : "zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }), [lang]);
  const date = (iso: string) => `${formatter.format(new Date(iso))} UTC+8`;

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setPosition((p) => Math.min(p + 1, last)), 1700);
    return () => window.clearTimeout(timer);
  }, [playing, step, last, onPosition]);

  if (!frame) {
    return <p className="text-[13px] text-ink-4">{t("暂无带有效发布时间的报道。", "No reports with valid publication times.")}</p>;
  }
  const titleOf = (r: StoryReportView) => lang === "zh"
    ? r.title
    : englishText(r.english?.title) ?? englishText(r.originalTitle) ?? englishText(r.title) ?? "Original-language report";

  return (
    <section aria-label={t("事件时间回放", "Event report playback")} className="space-y-4">
      <div className="rounded-panel border border-line-soft bg-bg-sunk/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">EVENT REPLAY</span>
          <span className="num text-[12px] text-ink-4">
            {t("阶段", "Step")} {step + 1} / {frames.length}
          </span>
        </div>
        <time dateTime={frame.publishedAt} aria-live={playing ? "off" : "polite"} className="mt-2 block text-[19px] font-semibold text-ink">{date(frame.publishedAt)}</time>
        {partial && <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-[12px] leading-relaxed text-ink-3" role="status">
          {t(`仅回放已加载的 ${covered} / ${totalReports} 篇报道；最早一步不一定是事件真正起点。`,
            `Replay covers only ${covered} of ${totalReports} reports; the first step may not be the event’s beginning.`)}
        </p>}
        <label htmlFor={trackId} className="mt-4 block text-[12px] text-ink-3">
          {clock === "known" ? t("按首次收录时间回放：后发现的旧报道不会提前出现", "Replay discovery times; later-discovered reports stay hidden") : t("按来源发布时间回放（事后追溯）", "Replay publication times (retrospective)")}
        </label>
        <input id={trackId} type="range" min={0} max={last} step={1} value={step}
          disabled={frames.length < 2} onChange={(e) => { setPlaying(false); setPosition(Number(e.target.value)); }}
          aria-valuetext={date(frame.publishedAt)}
          className="mt-2 w-full cursor-pointer accent-current disabled:opacity-40"/>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={step === 0}
            onClick={() => { setPlaying(false); setPosition(Math.max(0, step - 1)); }}
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
            onClick={() => { setPlaying(false); setPosition(Math.min(last, step + 1)); }}
            className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink disabled:opacity-40">
            {t("下一阶段", "Next")} →
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: t("本次回放累计", "Reports in replay"), value: frame.total },
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
          clock === "known" ? "按本站首次发现时间回放。历史图谱与证据使用同一时点；完整综述与热度仍是当前视角。" : "按来源发布日期回放。事实有效时间并不代表当时已经知道，属于事后视角。",
          clock === "known" ? "Discovery-time replay; the linked graph and evidence share this cutoff. The full overview and activity remain current." : "Publication-time replay is retrospective; effective dates do not establish when facts were known."
        )}
      </p>
    </section>
  );
}
