import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/hot";
import { IntentLink } from "../components/ui/IntentLink";
import type { HotEntryView, HotResponse } from "@aihot/contracts/site";
import { subjectAfter, withSubject } from "@aihot/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta } from "../lib/seo";
import { monthDayTime, localizedMonthDayTime } from "../lib/format";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/Page";
import { IconArrowRight, IconNetwork, IconChevronDown, IconInfo } from "../components/icons";
import { Sparkline } from "../features/hot/Sparkline";
import { Faces } from "../features/hot/Faces";
import { Delta } from "../features/hot/Delta";
import { PhoneBar } from "../components/shell/PhoneBar";
import { inNav } from "../components/shell/nav";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import { localizedSourceName } from "../lib/english";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: inNav("/hot") ? "hot" : "featured", name: "事件树" };
export { pageHeaders as headers } from "../lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ request }: { request: Request }) {
  return cachedPage(120, { hot: await loadOr404<HotResponse>("/api/site/hot", { signal: request.signal }) });
}

export function meta({ location }: Route.MetaArgs) {
  return localized(pageMeta({
    title: withSubject("热点榜"),
    description: `${subjectAfter("过去 48 小时", "圈")}讨论最多的 10 个事件：热度指数、趋势与组成热度的公开来源。`,
    path: "/hot",
    image: "/og/pages/hot.png",
  }), location.pathname, {
    title: "Trending events",
    description: "The 10 most-discussed events of the past 48 hours, with their trend and the public sources behind each one.",
  });
}

const BADGES: Record<HotEntryView["badges"][number], { label: string; tone: "hot" | "accent" | "amber"; hint: string }> = {
  surge: { label: "爆", tone: "hot", hint: "讨论快速增加" },
  new: { label: "新", tone: "accent", hint: "首报 6 小时内" },
  rising: { label: "发酵中", tone: "amber", hint: "讨论仍在增加" },
};

const RANK_COLOR = ["text-rank-1", "text-rank-2", "text-rank-3"];
const rankColor = (rank: number) => RANK_COLOR[rank - 1] ?? "text-rank-rest";
const pad = (rank: number) => String(rank).padStart(2, "0");

/** "某媒体、某账号 等 4 个来源 · 7 位参与者". */
function Voices({ e }: { e: HotEntryView }) {
  const lang=useUiLanguage();
  const names = e.sourceNames.slice(0, 2).map(name=>localizedSourceName(name, lang));
  return (
    <span className="min-w-0 text-[12.5px] leading-snug text-ink-4">
      {/* Lines break between the phrases, never inside one. */}
      <span className="whitespace-nowrap">
        {names.length > 0 && <span className="text-ink-3">{names.join(lang==="en"?", ":"、")}</span>}
        {e.sourceCount > names.length ? lang==="en"?` and ${e.sourceCount-names.length} more sources`:` 等 ${e.sourceCount} 个来源` : names.length ? (lang==="en"?" reporting":" 报道") : (lang==="en"?`${e.sourceCount} sources`:`${e.sourceCount} 个来源`)}
      </span>
      <span className="mx-1.5 text-line-strong">·</span>
      <span className="whitespace-nowrap">
        <span className="num">{e.participantCount}</span> {lang==="en"?"participants":"位参与者"}
      </span>
    </span>
  );
}

function Badges({ e }: { e: HotEntryView }) {
  const lang=useUiLanguage();
  const en:Record<HotEntryView["badges"][number],string>={surge:"SURGE",new:"NEW",rising:"RISING"};
  return e.badges.map((b) => (
    <Badge key={b} tone={BADGES[b].tone} title={lang==="en"?en[b]:BADGES[b].hint}>
      {lang==="en"?en[b]:BADGES[b].label}
    </Badge>
  ));
}

/** The whole card opens the event; the title carries the link and stretches over the card. */
function StoryLink({ e, className }: { e: HotEntryView; className: string }) {
  const lang=useUiLanguage();
  return (
    <IntentLink viewTransition to={`${lang==="en"?"/en":""}/story/${e.story.publicId}`} className={`transition-colors after:absolute after:inset-0 after:content-[''] ${className}`}>
      {lang==="en" ? (e.english?.title ?? e.englishTitle ?? `Event #${e.rank} · See source reports`) : e.story.title}
    </IntentLink>
  );
}

/**
 * The lead card's picture slot when the story has no picture of its own: its day of heat, drawn large
 * on a faint wash, with where it peaked. Without enough comparable hours the text takes the width.
 */
function HeatPanel({ e }: { e: HotEntryView }) {
  const t=useText();
  const seen = e.spark.filter((v): v is number => v !== null);
  const peak = Math.max(...seen);
  const peakAt = e.spark.findIndex((v) => v === peak);
  return (
    <div className="order-first flex aspect-[2/1] flex-col rounded-panel bg-accent-softer p-4 ring-1 ring-inset ring-line-soft xl:order-none xl:aspect-[16/10] dark:bg-accent-soft">
      <div className="flex items-baseline justify-between text-[11.5px] text-ink-4">
        <span className="font-semibold text-ink-3">{t("24 小时热度","24-hour activity")}</span>
        <span>
          {t("峰值","Peak")} <span className="mono text-ink-2">{Math.round(peak)}</span>
          {peakAt >= 0 && <span> · {peakAt === e.spark.length - 1 ? t("当前","now") : t(`${e.spark.length - 1 - peakAt} 小时前`,`${e.spark.length - 1 - peakAt}h ago`)}</span>}
        </span>
      </div>
      <Sparkline values={e.spark} className="mt-3 min-h-0 w-full flex-1" />
      <div className="mt-2 flex justify-between text-[11px] text-ink-4">
        <span>{t("24 小时前","24h ago")}</span>
        <span>{t("现在","Now")}</span>
      </div>
    </div>
  );
}

/** No. 1: the event people are talking about most, with its picture, digest, latest turn and day of heat. */
function Lead({ e }: { e: HotEntryView }) {
  const lang=useUiLanguage(); const t=useText();
  const panel = !e.cover && e.spark.filter((v) => v !== null).length >= 3;
  return (
    <article className="card card-hover group relative flex flex-col overflow-hidden p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className={`numeral text-[38px] italic leading-[0.8] ${rankColor(e.rank)}`}>{e.rank}</span>
        <Badges e={e} />
        <Delta trend={e.trend} pct={e.trendPct} className="ml-auto" />
      </div>
      <div className={`mt-4 grid gap-5 ${e.cover || panel ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)] xl:gap-7" : ""}`}>
        <div className="min-w-0">
          <h2 className="text-[21px] font-bold leading-[1.4] tracking-[-0.01em] text-ink sm:text-[23px] lg:text-[25px] lg:leading-[1.38]">
            <StoryLink e={e} className="group-hover:text-accent" />
          </h2>
          {(lang==="zh" ? e.summary : e.english?.summary) && <p className="mt-3 line-clamp-3 text-[14px] leading-[1.75] text-ink-3">{lang==="zh" ? e.summary : e.english?.summary}</p>}
        </div>
        {e.cover ? (
          <div className="order-first overflow-hidden well rounded-panel xl:order-none">
            <img src={e.cover.url} srcSet={e.cover.srcSet} sizes="(min-width: 1280px) calc(28vw - 96px), (min-width: 1024px) calc(58vw - 180px), (min-width: 640px) 568px, calc(100vw - 74px)" width={e.cover.width ?? undefined} height={e.cover.height ?? undefined} alt="" loading="eager" fetchPriority="high" decoding="async" className="aspect-[16/9] size-full object-cover transition-transform duration-500 group-hover:scale-[1.02] xl:aspect-[16/10]" />
          </div>
        ) : (
          panel && <HeatPanel e={e} />
        )}
      </div>
      {/* Side by side while the card is wide enough; on a narrow card the day of heat and the index
          move under the voices, to the right, instead of squeezing them into a column. */}
      <div className="mt-auto flex flex-wrap items-end gap-x-6 gap-y-4 pt-5">
        <div className="min-w-0 flex-[1_1_18rem] space-y-2.5">
          {lang==="zh" && e.latest && (
            <p className="line-clamp-2 text-[13px] leading-[1.7] text-ink-2">
              <span className="mr-2 text-[12px] font-semibold text-accent">最新进展</span>
              {e.latest}
            </p>
          )}
          {/* The voices drop under the faces when the card is too narrow for both (small phones). */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Faces participants={e.participants} total={e.participantCount} size={24} />
            <Voices e={e} />
          </div>
        </div>
        <div className="flex w-full shrink-0 items-end justify-between gap-5 sm:ml-auto sm:w-auto sm:justify-end">
          {!panel && <Sparkline values={e.spark} className="h-10 w-[140px]" />}
          <div className="text-right">
            <div className="numeral text-[48px] leading-none text-ink">{Math.round(e.heat)}</div>
            <div className="mt-1 text-[11.5px] text-ink-4">{t("热度指数","Activity index")}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** No. 2 and 3: the same card, smaller, without the picture. */
function Runner({ e }: { e: HotEntryView }) {
  const lang=useUiLanguage();
  return (
    <article className="card card-hover group relative flex flex-col px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className={`numeral text-[38px] italic leading-[0.8] ${rankColor(e.rank)}`}>{e.rank}</span>
        <Badges e={e} />
        <Delta trend={e.trend} pct={e.trendPct} className="ml-auto" />
      </div>
      <h2 className="mt-2.5 line-clamp-2 text-[16px] font-[650] leading-[1.5] text-ink">
        <StoryLink e={e} className="group-hover:text-accent" />
      </h2>
      {(lang==="zh" ? e.summary : e.english?.summary) && <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.7] text-ink-3 lg:line-clamp-1">{lang==="zh" ? e.summary : e.english?.summary}</p>}
      <div className="mt-auto flex items-end justify-between gap-4 pt-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Faces participants={e.participants} total={e.participantCount} size={20} />
          <span className="text-[12px] text-ink-4">
            <span className="whitespace-nowrap"><span className="num">{e.sourceCount}</span> {lang==="en"?"sources":"个来源"}</span> ·{" "}
            <span className="whitespace-nowrap"><span className="num">{e.participantCount}</span> {lang==="en"?"participants":"位参与者"}</span>
          </span>
        </div>
        <div className="flex items-end gap-3">
          <Sparkline values={e.spark} className="h-7 w-[92px]" />
          <span className="numeral text-[34px] leading-none text-ink">{Math.round(e.heat)}</span>
        </div>
      </div>
    </article>
  );
}

/** No. 4–10: a row each, with a line of the digest, faces, the day of heat and the index. */
function Row({ e }: { e: HotEntryView }) {
  const lang=useUiLanguage();
  return (
    <li className="group relative grid grid-cols-[30px_minmax(0,1fr)] items-start gap-x-3 px-4 py-3 transition-colors hover:bg-bg-sunk/70 sm:px-5 lg:grid-cols-[44px_minmax(0,1fr)_auto_104px_76px] lg:items-center lg:gap-x-6 lg:px-6 lg:py-3.5 dark:hover:bg-bg-muted/40">
      <span className={`numeral text-[26px] italic leading-[24px] ${rankColor(e.rank)}`} aria-label={lang==="en"?`Rank ${e.rank}`:`热度排名第 ${e.rank} 位`}>
        {e.rank}
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-[650] leading-[1.55] text-ink">
          <StoryLink e={e} className="group-hover:text-accent" />
          {e.badges.length > 0 && (
            <span className="ml-2 inline-flex translate-y-[-2px] gap-1 align-middle">
              <Badges e={e} />
            </span>
          )}
        </h3>
        {(lang==="zh" ? e.summary : e.english?.summary) && <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.65] text-ink-4 lg:line-clamp-1">{lang==="zh" ? e.summary : e.english?.summary}</p>}
        <div className="mt-2 flex items-center gap-2.5 lg:hidden">
          <Faces participants={e.participants} total={e.participantCount} size={20} />
          <span className="text-[12px] text-ink-4">
            <span className="num">{e.sourceCount}</span> {lang==="en"?"sources":"个来源"}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="numeral text-[24px] leading-none text-ink">{Math.round(e.heat)}</span>
            <Delta trend={e.trend} pct={e.trendPct} />
          </span>
        </div>
      </div>
      <div className="hidden items-center gap-2.5 lg:flex">
        <Faces participants={e.participants} total={e.participantCount} size={20} />
      </div>
      <Sparkline values={e.spark} className="hidden h-7 w-[104px] lg:block" />
      <div className="hidden flex-col items-end gap-1 lg:flex">
        <span className="numeral text-[28px] leading-none text-ink">{Math.round(e.heat)}</span>
        <Delta trend={e.trend} pct={e.trendPct} />
      </div>
    </li>
  );
}

/** Opens "热度是怎么算的" at the foot of the page and brings it into view. */
function showMethod() {
  const method = document.getElementById("hot-method") as HTMLDetailsElement | null;
  if (!method) return;
  method.open = true;
  method.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
}

export default function HotPage() {
  const { hot } = useLoaderData<typeof loader>();
  const t=useText();
  const language=useUiLanguage();
  const [lead, ...rest] = hot.entries;
  const runners = rest.slice(0, 2);
  const others = rest.slice(2);
  return (
    <div className="pb-10">
      <PhoneBar
        title={t("事件树","Event Tree")}
        large
        sub={
          <>
            {language==="en"?`Top ${hot.entries.length || 10} events in the past ${hot.windowHours} hours`:`过去 ${hot.windowHours}${subjectAfter(" 小时", "圈")}讨论最多的 ${hot.entries.length || 10} 件事`}
            {hot.computedAt && (
              <>
                {" · "}
                <span className="num">{localizedMonthDayTime(hot.computedAt, language)}</span> {t("更新","updated")}
              </>
            )}
          </>
        }
        actions={
          <button type="button" onClick={showMethod} className="flex h-11 items-center gap-1 px-3 text-[14px] text-accent active:opacity-50">
            <IconInfo size={17} /> {t("怎么算","Method")}
          </button>
        }
      />
      <header className="hidden flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5 pt-1 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.08em] text-hot">
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-hot opacity-30" />
              <span className="relative inline-flex size-2 rounded-full bg-hot" />
            </span>
            {t("实时热度","LIVE EVENT SIGNALS")}
          </div>
          <h1 className="mt-1.5 text-[24px] font-bold leading-[1.3] tracking-[-0.01em] text-ink lg:text-[26px]">{t("事件脉络 · 热点追踪","Event Timeline & Trending Stories")}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">{language==="en"?`Top ${hot.entries.length || 10} topics from the last ${hot.windowHours} hours`:`过去 ${hot.windowHours} 小时，${withSubject("圈")}讨论最多的 ${hot.entries.length || 10} 件事`}</p>
        </div>
        {hot.computedAt && (
          <p className="text-[12px] text-ink-4">
            <span className="num">{localizedMonthDayTime(hot.computedAt,language)}</span> {t("更新 · 按讨论热度排序","updated · ranked by activity")}
          </p>
        )}
      </header>

      <section className="lr-event-summary" aria-label={t("事件树与长期知识库的关系","How events connect to knowledge")}>
        <span className="lr-layers"><b>{t("事件","EVENT")}</b><i>→</i>{t("关系","RELATIONS")}<i>→</i>{t("证据","EVIDENCE")}</span>
        <p>{t("点开一个事件，看它的进展、在知识图谱里连出的关系和原始来源。","Open an event for its developments, the relations it adds to the knowledge graph and the original sources.")}</p>
        <Link to="/knowledge" className="lr-inline-link"><IconNetwork size={16} /> {t("知识网络","Knowledge graph")} <IconArrowRight size={14}/></Link>
      </section>

      {!lead ? (
        <div className="card rounded-sheet">
          <EmptyState title={t("暂时没有热点","No trending events")}>{t("还没有足够多来源共同讨论的事件。","Not enough independent sources have covered an event yet.")}</EmptyState>
        </div>
      ) : (
        <>
          <section aria-label={t("热度前三","Top three events")} className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
            <div className="grid grid-cols-1 lg:col-span-7 lg:row-span-2 xl:col-span-8">
              <Lead e={lead} />
            </div>
            {runners.map((e) => (
              <div key={e.story.publicId} className="grid grid-cols-1 lg:col-span-5 xl:col-span-4">
                <Runner e={e} />
              </div>
            ))}
          </section>

          {others.length > 0 && (
            <section aria-label={t("其余热点","Other trending events")} className="mt-6 lg:mt-7">
              <div className="mb-3 flex items-baseline justify-between px-1">
                <h2 className="text-[15px] font-semibold text-ink">
                  {t("继续看","Continue")} <span className="num font-normal text-ink-4">No.{pad(others[0]!.rank)}–{pad(others[others.length - 1]!.rank)}</span>
                </h2>
                <span className="hidden text-[12px] text-ink-4 lg:block">{t("参与者 · 24 小时走势 · 热度指数","Participants · 24-hour trend · activity")}</span>
              </div>
              <ol className="card divide-y divide-line-soft overflow-hidden">
                {others.map((e) => (
                  <Row key={e.story.publicId} e={e} />
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <details id="hot-method" className="disclosure group/method mt-8 scroll-mt-[calc(var(--bar-h)+16px)] text-[12px] text-ink-4">
        <summary className="flex items-center gap-1.5 py-1 transition-colors hover:text-ink-2">
          <IconInfo size={15} />
          {t("热度是怎么算的？","How is activity measured?")}
          <span className="ml-auto inline-flex items-center gap-0.5">
            <span className="group-open/method:hidden">{t("了解榜单","About rankings")}</span>
            <span className="hidden group-open/method:inline">{t("收起","Collapse")}</span>
            <IconChevronDown size={13} className="transition-transform duration-200 group-open/method:rotate-180" />
          </span>
        </summary>
        {language==="en" ? <div className="max-w-[760px] space-y-2 pb-2 pl-[21px] pt-2 leading-[1.75] text-ink-3"><p>Activity reflects independent accounts and organizations contributing to the same event. Duplicate captures are counted once. The measure decays with a 24-hour half-life; it is not a score of reporting quality.</p><p>The ranking covers 48 hours. Trends compare consistent sources only and do not represent every social account on the internet. Open an event to review original coverage.</p></div> : <div className="max-w-[760px] space-y-2 pb-2 pl-[21px] pt-2 leading-[1.75] text-ink-3">
          <p>热度来自参与同一事件的独立账号与机构，重复采集只算一次，并按 24 小时半衰期衰减。它衡量讨论活跃程度，不是报道质量评分。</p>
          <p>榜单统计过去 48 小时。趋势只比较持续覆盖的同一组信源；它反映我们的监测范围，不代表全网人数。缺少可比历史时，不展示趋势线。</p>
          <p>
            信源名单只展示可公开阅读的报道来源；讨论参与者还包括只计入热度的账号与机构。同一机构的多个渠道可能合并计数，因此参与者不一定多于信源数。点击事件可查看各方报道与观点。
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
            {Object.values(BADGES).map((b) => (
              <div key={b.label} className="flex items-center gap-1.5">
                <dt>
                  <Badge tone={b.tone}>{b.label}</Badge>
                </dt>
                <dd>{b.hint}</dd>
              </div>
            ))}
          </dl>
        </div>}
      </details>
    </div>
  );
}
