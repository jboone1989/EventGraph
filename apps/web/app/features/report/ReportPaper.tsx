// One report with a newspaper's structure in the site's own look: a nameplate with its 报眼 (the box
// beside it for the issue and date), a band of the issue's figures, the front page (the lead, today's
// highlights and the page index), then one page per section in two columns, the neighbouring issues
// and a colophon. Colours, type and components are the site's; only the structure is a paper's.
// Rules are hairlines in two weights: line-strong closes the masthead and underlines a page's heading
// and the neighbours; line parts stories, columns and list rows. Nothing is set in solid ink. Stories
// sit in rows of two whose rules run across the page, each story as tall as its neighbour.
// Both editions render this paper. English pages fill each slot with the best English available and
// omit the slot (never showing Chinese text in its place): entries without an English title drop out,
// editor-written Chinese prose (section notes, lead paragraphs) leaves the page empty-handed — except
// a daily's overview, which travels with its own English stand-in (overviewEn) when there is one.
import { IntentLink } from "../../components/ui/IntentLink";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { ReportCitation, ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { REPORTS, SITE, subjectAfter } from "@aihot/site";
import { Badge } from "../../components/ui/Badge";
import { IconArrowLeft, IconArrowRight, IconArrowUpRight } from "../../components/icons";
import { Kicker } from "../../components/ui/Kicker";
import type { OutlineEntry } from "../../components/ui/OutlineSheet";
import { SourceAvatar } from "../../components/ui/SourceAvatar";
import { Halftone } from "./Halftone";
import { Nameplate } from "./Nameplate";
import { IssueDots } from "./IssueDots";
import { localizedMonthDay, localizedMonthDayTime, monthDay, type DisplayLanguage } from "../../lib/format";
import { englishText, localizedSourceName } from "../../lib/english";
import { KIND_LABEL, KIND_LABEL_EN, dateLine, dateMark, edition, entriesUnit, headline, metricItems, motto, neighbourLabel, reportPath, sectionEn, shortDay } from "./format";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (c: ReportCitation) => c.itemId ?? c.title;
const anchorOf = (c: ReportCitation) => (c.itemId ? `r-${c.itemId}` : null);
/** English pages link the English item route; either route serves the same page, the URL follows the reader. */
const itemHref = (id: string, lang: DisplayLanguage) => (lang === "en" ? `/en/items/${id}` : `/items/${id}`);
const LINK = "inline-flex min-h-7 items-center gap-0.5 font-medium transition-colors hover:text-accent";
/** What comes before `noun` at the end of `phrase` ("往期 AI " of "往期 AI 周报"), so the kind's name is its own text. */
const before = (phrase: string, noun: string) => phrase.slice(0, -noun.length);

/** An entry's English display title, when it has one: the written English brief, else its own English headline. */
const enTitle = (c: ReportCitation): string | null => c.english?.title ?? englishText(c.originalTitle) ?? englishText(c.title);
const hasEnglish = (c: ReportCitation): boolean => enTitle(c) !== null;
const withdrawnNote = (lang: DisplayLanguage) => (lang === "en" ? "Withdrawn or adjusted at the source's request." : "该内容已按来源方要求下架或调整展示方式。");

function Masthead({ report, index, quiet, lang }: { report: ReportDetail; index: ReportNavigationEntry[]; quiet: boolean; lang: DisplayLanguage }) {
  const en = lang === "en";
  const mark = dateMark(report.kind, report.key, lang);
  const label = KIND_LABEL[report.kind];
  return (
    <header className="pt-5 lg:pt-0">
      <div className="flex items-center justify-between gap-4 text-[12px] text-ink-4">
        <span className="num">{dateLine(report.kind, report.key, lang)}</span>
        <span className="hidden tracking-[0.3em] @[640px]:inline">{motto(report.kind, lang)}</span>
        <span>{edition(report.kind, lang)}</span>
      </div>

      <div className="flex items-stretch justify-between gap-5 py-6 @[880px]:gap-10 @[880px]:py-8">
        <div className="flex min-w-0 flex-col justify-center">
          <h1 id="report-start" className="scroll-mt-[calc(var(--bar-h)+1.5rem)]">
            <span className="sr-only">
              {en ? `${KIND_LABEL_EN[report.kind]} · ${dateLine(report.kind, report.key, lang)}` : `${label} · ${dateLine(report.kind, report.key)}`}
            </span>
            {en ? (
              <span aria-hidden="true" className="block max-w-full font-serif text-[32px] font-bold leading-[1.05] tracking-[-0.04em] text-ink @[520px]:text-[50px] @[880px]:text-[67px] @[1040px]:text-[76px]">
                {KIND_LABEL_EN[report.kind]}
              </span>
            ) : (
              <Nameplate which={report.kind} className="block h-[44px] w-auto @[520px]:h-[58px] @[880px]:h-[74px] @[1040px]:h-[84px]" />
            )}
          </h1>
          <p className="mt-3 text-[11.5px] tracking-[0.36em] text-ink-4 @[880px]:mt-4 @[880px]:text-[12.5px]">{REPORTS.imprint}</p>
        </div>
        {/* 报眼: the box beside the nameplate, as a Chinese daily sets it: the issue and the date in the
            nameplate's dots, and on wider paper the issue calendar beside them. */}
        <div className="flex shrink-0 items-stretch well rounded-panel">
          <div className="flex w-[112px] flex-col items-center justify-center px-2 py-3 text-center @[880px]:w-[150px] @[880px]:py-4">
            <span className="text-[11px] tracking-[0.2em] text-ink-4">{en ? `Issue ${report.issueNumber}` : `第 ${report.issueNumber} 期`}</span>
            <Halftone seed={`${report.kind}-${report.key}-date`} className="num mt-2 whitespace-nowrap text-[44px] font-black leading-[0.95] tracking-[-0.04em] text-ink @[880px]:text-[64px]">
              {mark.figure}
            </Halftone>
            <span className="mt-2 text-[11.5px] text-ink-2">{mark.top}</span>
            <span className="text-[11.5px] text-ink-4">{mark.bottom}</span>
          </div>
          <IssueDots kind={report.kind} reportKey={report.key} issueNumber={report.issueNumber} index={index} lang={lang} className="hidden w-[176px] border-l border-line px-4 py-4 @[760px]:block @[880px]:w-[196px]" />
        </div>
      </div>

      {/* A quiet day has no figures to set and nothing to read through: the masthead just closes. */}
      {quiet ? (
        <div aria-hidden="true" className="border-t border-line-strong" />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1.5 border-y border-line-strong py-3">
          {metricItems(report.metrics, lang).map((m) => (
            <span key={m.key} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="numeral text-[30px] leading-none text-ink @[880px]:text-[34px]">{m.value}</span>
              <span className="text-[12px] text-ink-4">{m.unit}</span>
            </span>
          ))}
          <span className="ml-auto whitespace-nowrap text-[12px] text-ink-4">{en ? `${report.readingMinutes} min read` : `约 ${report.readingMinutes} 分钟读完`}</span>
        </div>
      )}
    </header>
  );
}

/** Source face and name, and the site's 一手 mark when first-hand. */
function Source({ c, lang, size = 16 }: { c: ReportCitation; lang: DisplayLanguage; size?: number }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <SourceAvatar name={localizedSourceName(c.sourceName, lang, c.sourceUrl)} iconUrl={c.sourceIconUrl} iconSrcSet={c.sourceIconSrcSet} size={size} />
      <span className="truncate">{lang === "en" ? localizedSourceName(c.sourceName, lang, c.sourceUrl) : c.sourceName}</span>
      {c.firstParty && <Badge tone="accent">{lang === "en" ? "First-party" : "一手"}</Badge>}
    </span>
  );
}

/**
 * The way on from a story: its original. Each story is one report (for an event, the one the edition
 * chose: first-hand first, then the best scored), so there is one place to go.
 */
function Original({ c, lang, className = "" }: { c: ReportCitation; lang: DisplayLanguage; className?: string }) {
  return (
    <a
      href={c.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={lang === "en" ? `Read the original at ${localizedSourceName(c.sourceName, lang, c.sourceUrl)}: ${enTitle(c)} (new tab)` : `阅读${c.sourceName}原文：${c.title}（新标签页）`}
      className={`${LINK} text-[12.5px] text-ink-3 ${className}`}
    >
      {lang === "en" ? "Original" : "原文"} <IconArrowUpRight size={12} />
    </a>
  );
}

/**
 * Under a daily entry: the event's other developments, or other reports of the launch it stands for.
 * Titles only, each to its page; a withdrawn one stays, struck through. English keeps only the
 * developments with an English title.
 */
function Related({ items, lang, className = "" }: { items: ReportCitation[]; lang: DisplayLanguage; className?: string }) {
  const shown = lang === "en" ? items.filter(hasEnglish) : items;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {shown.slice(0, 4).map((r) => (
        <li key={keyOf(r)} className="flex gap-2.5 text-[13.5px] leading-[1.65]">
          <span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-4" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {r.available && r.itemId ? (
              <IntentLink viewTransition to={itemHref(r.itemId, lang)} className="text-ink-2 transition-colors hover:text-accent">
                {lang === "en" ? enTitle(r) : r.title}
              </IntentLink>
            ) : (
              <span title={withdrawnNote(lang)} className="text-ink-4 line-through">{lang === "en" ? enTitle(r) : r.title}</span>
            )}
            {r.available && <span className="ml-2 text-[12px] text-ink-4">{lang === "en" ? localizedSourceName(r.sourceName, lang, r.sourceUrl) : r.sourceName}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** How many more sources reported the entry's event, and whether an earlier daily covered it. */
function Coverage({ c, lang }: { c: ReportCitation; lang: DisplayLanguage }) {
  return (
    <>
      {!!c.otherSources && <span className="shrink-0 text-ink-4">{lang === "en" ? `${c.otherSources} more source${c.otherSources === 1 ? "" : "s"} covered this` : `另有 ${c.otherSources} 家信源报道`}</span>}
      {c.followUp && (
        <Badge
          title={lang === "en" ? `The ${localizedMonthDay(c.followUp, "en")} daily covered this; these are the new developments` : `${monthDay(c.followUp)}的日报报道过这件事，这里是新进展`}
        >
          {lang === "en" ? "Follow-up" : "跟进"}
        </Badge>
      )}
    </>
  );
}

/** One story: source, headline, at most four lines of summary, and the original at the foot. */
function Story({ c, dated, lang, className = "" }: { c: ReportCitation; dated: boolean; lang: DisplayLanguage; className?: string }) {
  const title = lang === "en" ? enTitle(c)! : c.title;
  const summary = lang === "en" ? c.english?.summary ?? null : c.summary;
  return (
    <article id={anchorOf(c) ?? undefined} className={`flex min-w-0 scroll-mt-[calc(var(--bar-h)+1.5rem)] flex-col py-6 ${className}`}>
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <Source c={c} lang={lang} />
        {c.available && <Coverage c={c} lang={lang} />}
        {dated && c.publishedAt && <span className="num ml-auto shrink-0 text-ink-4">{shortDay(c.publishedAt)}</span>}
      </div>
      {c.available ? (
        <>
          <h3 className="mt-3 text-[19px] font-bold leading-[1.5] tracking-[-0.01em] text-ink [overflow-wrap:anywhere] [text-wrap:pretty] @[880px]:text-[20px]">
            {c.itemId ? (
              <IntentLink viewTransition to={itemHref(c.itemId, lang)} className="transition-colors hover:text-accent">
                {title}
              </IntentLink>
            ) : (
              title
            )}
          </h3>
          {summary && <p className="mt-2 line-clamp-4 text-[15px] leading-[1.85] text-ink-2 [overflow-wrap:anywhere] @[560px]:text-justify">{summary}</p>}
          {!!c.related?.length && <Related items={c.related} lang={lang} className="mt-3" />}
          <div className="mt-auto pt-3">
            <Original c={c} lang={lang} />
          </div>
        </>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-ink-4">
          <span className="line-through">{title}</span> · {withdrawnNote(lang)}
        </p>
      )}
    </article>
  );
}

/**
 * Rows of two once the page is wide enough: both cells as tall as the taller, a hairline between them
 * and one rule under the row across the whole page, even under a single cell.
 */
export function Rows<T>({ items, children }: { items: T[]; children: (item: T, cell: string) => ReactNode }) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <div>
      {rows.map((row, r) => (
        <div key={r} className="grid border-b border-line @[760px]:grid-cols-2">
          {row.map((item, i) => children(item, i === 0 ? "@[760px]:pr-10 @[1040px]:pr-12" : "border-t border-line @[760px]:border-l @[760px]:border-t-0 @[760px]:pl-10 @[1040px]:pl-12"))}
        </div>
      ))}
    </div>
  );
}

interface Page {
  id: string;
  label: string;
  summary: string | null;
  items: ReportCitation[];
}

/**
 * The story an issue leads with: the item it names.
 * Only a public item leads: a withdrawn one stays in its page, marked.
 */
function leadStoryOf(report: ReportDetail, lang: DisplayLanguage): ReportCitation | null {
  if (!report.leadItemId) return null;
  return (
    report.sections
      .flatMap((s) => s.items)
      .find((c) => c.itemId === report.leadItemId && c.available && (lang === "zh" || hasEnglish(c))) ?? null
  );
}

/**
 * Sections as pages. A story cited twice appears once, and
 * the story leading the front page is not repeated inside.
 * English keeps only the entries with an English title, dropping the pages left empty.
 */
function pagesOf(report: ReportDetail, leadStory: ReportCitation | null, lang: DisplayLanguage): Page[] {
  const seen = new Set<string>(leadStory ? [keyOf(leadStory)] : []);
  return report.sections
    .map((s, i) => ({
      id: `s-${i + 1}`,
      label: s.label,
      summary: s.summary,
      items: s.items
        .filter((c) => {
          if (lang === "en" && !hasEnglish(c)) return false;
          const k = keyOf(c);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
    }))
    .filter((p) => p.items.length > 0);
}

/**
 * The lead's picture; landscape pictures are cropped to between 16:10 and 2:1. A picture that is not
 * the lead's own (a weekly or monthly's, from its first highlight) is captioned with its story.
 */
function LeadPicture({ cover, onError, priority = false, className = "", lang }: { cover: NonNullable<ReportDetail["cover"]>; onError: () => void; priority?: boolean; className?: string; lang: DisplayLanguage }) {
  const ratio = cover.width && cover.height ? cover.width / cover.height : 16 / 9;
  const shown = ratio >= 1.25 ? Math.min(2, Math.max(1.6, ratio)) : Math.max(0.8, ratio);
  return (
    <figure className={className}>
      <div className="overflow-hidden well rounded-panel" style={{ aspectRatio: shown }}>
        <img src={cover.url} srcSet={cover.srcSet}
          sizes={priority ? "(min-width: 1700px) 780px, (min-width: 1580px) calc(100vw - 920px), (min-width: 1420px) calc(100vw - 880px), (min-width: 1024px) calc(100vw - 540px), (min-width: 640px) 608px, calc(100vw - 32px)" : "auto, (min-width: 1180px) 300px, (min-width: 640px) 608px, calc(100vw - 32px)"}
          width={cover.width ?? undefined} height={cover.height ?? undefined}
          alt="" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={onError} className="size-full object-cover" />
      </div>
      {cover.caption && lang === "zh" && <figcaption className="mt-2.5 line-clamp-2 text-[12.5px] leading-[1.6] text-ink-4">图 · {cover.caption}</figcaption>}
    </figure>
  );
}

/**
 * An issue's written overview under its own name: a daily's 今日综述, a weekly's or monthly's 本期导读.
 * Such an issue leading with an event sets the event on its front page as a daily does, so the
 * overview opens the issue above it.
 */
function Overview({ text, title }: { text: string; title: string }) {
  return (
    <section aria-label={title} className="border-b border-line py-7 @[880px]:py-9">
      <Kicker>{title}</Kicker>
      <p className="mt-4 max-w-[46em] text-[16.5px] leading-[1.9] text-ink-2 @[560px]:text-justify @[880px]:text-[17.5px]">{text}</p>
    </section>
  );
}

/** The front page: the lead beside a column of today's highlights and the index of pages. */
function FrontPage({ report, pages, leadStory, count, lang }: { report: ReportDetail; pages: Page[]; leadStory: ReportCitation | null; count: number; lang: DisplayLanguage }) {
  const en = lang === "en";
  const daily = report.kind === "daily";
  // A weekly or monthly leading with an event: the event's own summary; its overview stands above (Overview).
  const byEvent = daily || !!leadStory;
  // A picture that fails to load is dropped, and the lead is set as if it had none.
  const [broken, setBroken] = useState<string | null>(null);
  const cover = report.cover && report.cover.url !== broken ? report.cover : null;
  // A landscape picture opens the lead above its headline; a squarer one sits beside the paragraph.
  const wide = !cover?.width || !cover.height || cover.width / cover.height >= 1.25;
  const title = en
    ? (leadStory ? enTitle(leadStory) : null) ?? headline(report.kind, report.key, count, lang)
    : report.lead?.title ?? leadStory?.title ?? headline(report.kind, report.key, count);
  // The editors' Chinese prose (lead paragraph, overview) has no English to stand in: English omits it.
  const dek = en
    ? leadStory ? leadStory.english?.summary ?? null : null
    : daily || !leadStory
      ? (report.lead?.leadParagraph ?? leadStory?.summary ?? report.overview)
      : leadStory.summary;
  const highlights = report.highlights
    .filter((h) => !leadStory || keyOf(h) !== keyOf(leadStory))
    .filter((h) => !en || hasEnglish(h))
    .slice(0, 3);
  const inPage = new Set(pages.flatMap((p) => p.items.map((c) => c.itemId)).filter(Boolean));
  const period = en
    ? { daily: "Today's picks", weekly: "This week's picks", monthly: "This month's picks" }[report.kind]
    : `${daily ? "今日" : report.kind === "weekly" ? "本周" : "本月"}看点`;
  const unit = (n: number) => (en ? `${n} ${entriesUnit(n, "en")}` : `${n} 件`);
  const briefs = (n: number) => (en ? `${n} ${n === 1 ? "brief" : "briefs"}` : `${n} 条`);
  const lines = (n: number) => (en ? `${n} items` : `${n} 条`);
  const tail = report.tail.filter((f) => !en || hasEnglish(f));
  const index = [
    ...pages.map((p, i) => ({ id: p.id, label: en ? sectionEn(p.label, i + 1) : p.label, n: unit(p.items.length) })),
    ...(report.flashes.filter((f) => !en || hasEnglish(f)).length > 0 ? [{ id: "s-flash", label: en ? "Briefs" : "快讯", n: briefs(report.flashes.filter((f) => !en || hasEnglish(f)).length) }] : []),
    ...(tail.length > 0 ? [{ id: "s-tail", label: en ? "Also today" : "当日动态", n: lines(tail.length) }] : []),
  ];

  return (
    <section aria-label={en ? "Front page" : "头版"} className="grid @[880px]:grid-cols-[minmax(0,1fr)_300px] @[1040px]:grid-cols-[minmax(0,1fr)_340px]">
      {/* On a phone the headline comes before a landscape picture, so the first screen carries the news. */}
      <div id={leadStory ? (anchorOf(leadStory) ?? undefined) : undefined} className="flex min-w-0 scroll-mt-[calc(var(--bar-h)+1.5rem)] flex-col py-7 @[880px]:border-r @[880px]:border-line @[880px]:py-10 @[880px]:pr-10">
        <Kicker>{byEvent ? (en ? "Top story" : "头条") : en ? "In this issue" : "本期导读"}</Kicker>
        {cover && wide && <LeadPicture cover={cover} lang={lang} onError={() => setBroken(cover.url)} priority className="order-2 mt-5 @[560px]:order-1" />}
        <h2 className="order-1 mt-4 text-[32px] font-black leading-[1.28] tracking-[-0.03em] text-ink [text-wrap:balance] @[520px]:text-[40px] @[560px]:order-2 @[1040px]:text-[48px] @[1040px]:leading-[1.22]">
          {leadStory?.itemId ? (
            <IntentLink viewTransition to={itemHref(leadStory.itemId, lang)} className="transition-colors hover:text-accent">
              {title}
            </IntentLink>
          ) : (
            title
          )}
        </h2>
        {dek && (
          <div className={cover && !wide ? "order-3 mt-6 grid gap-6 @[640px]:grid-cols-[minmax(0,1fr)_minmax(0,38%)] @[880px]:mt-7" : "order-3"}>
            <p className={`text-[16.5px] leading-[1.9] text-ink-2 @[880px]:text-[17.5px] ${cover && !wide ? "" : "mt-6 @[560px]:text-justify @[880px]:mt-7"}`}>{dek}</p>
            {cover && !wide && <LeadPicture cover={cover} lang={lang} onError={() => setBroken(cover.url)} />}
          </div>
        )}
        {leadStory && (
          <div className="order-4 mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
            <Source c={leadStory} lang={lang} size={18} />
            <Coverage c={leadStory} lang={lang} />
            <Original c={leadStory} lang={lang} />
          </div>
        )}
        {!!leadStory?.related?.length && <Related items={leadStory.related} lang={lang} className="order-5 mt-5 border-t border-line pt-4" />}
      </div>

      <aside className="min-w-0 border-t border-line py-7 @[880px]:border-t-0 @[880px]:py-10 @[880px]:pl-8">
        {highlights.length > 0 && (
          <>
            <Kicker>{period}</Kicker>
            <ol className="mt-2">
              {highlights.map((h, i) => {
                const anchor = anchorOf(h);
                const to = anchor && inPage.has(h.itemId) ? `#${anchor}` : h.itemId ? itemHref(h.itemId, lang) : h.sourceUrl;
                if (!h.available) {
                  return (
                    <li key={keyOf(h)} className="flex gap-3.5 border-b border-line py-4">
                      <span className="numeral w-6 shrink-0 text-[30px] italic leading-[0.95] text-ink-4">{i + 1}</span>
                      <span className="min-w-0 text-[13.5px] leading-[1.55] text-ink-4">
                        <span className="line-through">{en ? enTitle(h) : h.title}</span>
                        <span className="mt-1 block text-[12px]">{withdrawnNote(lang)}</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={keyOf(h)}>
                    <Link to={to} viewTransition={to.startsWith("/")} className="group flex gap-3.5 border-b border-line py-4">
                      <span className="numeral w-6 shrink-0 text-[30px] italic leading-[0.95] text-accent">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-bold leading-[1.55] text-ink transition-colors group-hover:text-accent">{en ? enTitle(h) : h.title}</span>
                        <span className="mt-1.5 block truncate text-[12px] text-ink-4">{en ? localizedSourceName(h.sourceName, lang, h.sourceUrl) : h.sourceName}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        {index.length > 0 && (
          <nav aria-label={en ? "Sections in this issue" : "本期版面"} className={highlights.length > 0 ? "mt-8" : ""}>
            <Kicker>{en ? "In this issue" : "本期版面"}</Kicker>
            <ol className="mt-3">
              {index.map((p, i) => (
                <li key={p.id}>
                  <a href={`#${p.id}`} className="group flex items-baseline gap-2 py-1.5 text-[13.5px]">
                    <span className="num w-7 shrink-0 text-[14px] font-bold text-ink">{pad(i + 1)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2 transition-colors group-hover:text-accent">{p.label}</span>
                    <span className="num shrink-0 text-[12px] text-ink-4">{p.n}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </aside>
    </section>
  );
}

/**
 * The front page of a day with nothing new: the lead alone across the page, in the lead's own type,
 * saying so and naming the hours it covers. No highlights, pages or index follow. The quiet lead is
 * the editors' Chinese prose, so English keeps only the masthead.
 */
function QuietFront({ lead }: { lead: NonNullable<ReportDetail["lead"]> }) {
  return (
    <section aria-label="头版" className="pt-10 @[880px]:pt-16">
      <Kicker>头版</Kicker>
      <h2 className="mt-4 text-[32px] font-black leading-[1.28] tracking-[-0.03em] text-ink [text-wrap:balance] @[520px]:text-[40px] @[1040px]:text-[48px] @[1040px]:leading-[1.22]">
        {lead.title}
      </h2>
      {lead.leadParagraph && <p className="mt-6 max-w-[46em] text-[16.5px] leading-[1.9] text-ink-2 @[880px]:mt-7 @[880px]:text-[17.5px]">{lead.leadParagraph}</p>}
    </section>
  );
}

/** A page of the report: its number in the accent beside its name. */
export function SectionPage({ id, no, label, children }: { id: string; no?: number; label: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-[calc(var(--bar-h)+1.5rem)] pt-12 @[880px]:pt-16">
      <header className="flex items-baseline gap-3 border-b border-line-strong pb-3 @[880px]:gap-4">
        {no !== undefined && <span className="numeral text-[32px] italic leading-none text-accent @[880px]:text-[36px]">{pad(no)}</span>}
        <h2 id={`${id}-t`} className="min-w-0 text-[24px] font-black leading-[1.25] tracking-[-0.02em] text-ink @[880px]:text-[28px]">
          {label}
        </h2>
      </header>
      {children}
    </section>
  );
}

/** Two columns with a hairline between them, once the page is wide enough (快讯). */
const COLUMNS = "@[760px]:columns-2 @[760px]:gap-x-12 @[760px]:[column-rule:1px_solid_var(--line)]";

function Neighbours({ report, index, lang }: { report: ReportDetail; index: ReportNavigationEntry[]; lang: DisplayLanguage }) {
  const en = lang === "en";
  const titleOf = (key: string) => {
    const found = index.find((e) => e.key === key)?.title;
    if (en) return englishText(found) ?? `${SITE.name} ${KIND_LABEL_EN[report.kind]} · ${key}`;
    return found ?? `${KIND_LABEL[report.kind]} · ${key}`;
  };
  const cell = "group flex min-w-0 flex-col py-6";
  const title = "mt-2.5 line-clamp-2 text-[16px] font-bold leading-[1.5] text-ink transition-colors group-hover:text-accent @[880px]:text-[18px]";
  return (
    <nav aria-label={en ? "Previous and next issues" : report.kind === "daily" ? "前后日报" : "前后各期"} className="mt-16 grid grid-cols-2 border-y border-line-strong">
      {report.prev ? (
        <Link to={reportPath(report.kind, report.prev, lang)} className={`${cell} pr-5 @[880px]:pr-10`}>
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-4">
            <IconArrowLeft size={13} /> {neighbourLabel(report.kind, report.prev, "prev", lang)}
          </span>
          <span className={title}>{titleOf(report.prev)}</span>
        </Link>
      ) : (
        <span />
      )}
      {report.next ? (
        <Link to={reportPath(report.kind, report.next, lang)} className={`${cell} items-end border-l border-line pl-5 text-right @[880px]:pl-10`}>
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-4">
            {neighbourLabel(report.kind, report.next, "next", lang)} <IconArrowRight size={13} />
          </span>
          <span className={title}>{titleOf(report.next)}</span>
        </Link>
      ) : (
        <span className="border-l border-line" />
      )}
    </nav>
  );
}

function History({ report, index, lang }: { report: ReportDetail; index: ReportNavigationEntry[]; lang: DisplayLanguage }) {
  const en = lang === "en";
  const others = index.filter((e) => e.key !== report.key).slice(0, 12);
  if (others.length === 0) return null;
  const label = KIND_LABEL[report.kind];
  const titleOf = (e: ReportNavigationEntry) => (en ? englishText(e.title) ?? `${SITE.name} ${KIND_LABEL_EN[report.kind]} · ${e.key}` : e.title ?? `${SITE.name} ${KIND_LABEL[report.kind]} · ${e.key}`);
  return (
    <section id="report-history" className="scroll-mt-[calc(var(--bar-h)+1.5rem)] pt-12">
      <Kicker>{en ? `Past ${KIND_LABEL_EN[report.kind].toLowerCase()}s` : report.kind === "daily" ? `往期${label}` : `${before(subjectAfter("往期", label), label)}${label}`}</Kicker>
      <ul className="mt-3">
        {others.map((e) => (
          <li key={e.key}>
            <Link to={reportPath(report.kind, e.key, lang)} className="group flex items-baseline gap-4 border-b border-line py-3">
              <span className="num w-[76px] shrink-0 text-[12.5px] text-ink-4">{e.key}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink-2 transition-colors group-hover:text-accent">{titleOf(e)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The issue's pages for the phone outline: the front page, each page under its number, then 快讯, then 当日动态. */
export function reportOutline(report: ReportDetail, lang: DisplayLanguage = "zh"): OutlineEntry[] {
  const en = lang === "en";
  const pages = pagesOf(report, leadStoryOf(report, lang), lang);
  const flashes = report.flashes.filter((f) => !en || hasEnglish(f));
  const tail = report.tail.filter((f) => !en || hasEnglish(f));
  if (pages.length === 0 && flashes.length === 0 && tail.length === 0) return [];
  return [
    { id: "report-start", text: en ? "Front page" : "头版", level: 2, mark: "" },
    ...pages.map((p, i) => ({ id: p.id, text: en ? sectionEn(p.label, i + 1) : p.label, level: 2, mark: pad(i + 1), note: en ? `${p.items.length} ${entriesUnit(p.items.length, "en")}` : `${p.items.length} 件` })),
    ...(flashes.length > 0 ? [{ id: "s-flash", text: en ? "Briefs" : "快讯", level: 2, mark: pad(pages.length + 1), note: en ? `${flashes.length} ${flashes.length === 1 ? "brief" : "briefs"}` : `${flashes.length} 条` }] : []),
    ...(tail.length > 0 ? [{ id: "s-tail", text: en ? "Also today" : "当日动态", level: 2, mark: pad(pages.length + 1 + (flashes.length > 0 ? 1 : 0)), note: en ? `${tail.length} items` : `${tail.length} 条` }] : []),
  ];
}

/**
 * The day's human-written note, above the issue: what to watch today, what still needs checking.
 * It is editorial prose, not model output, so English shows it only when the note itself has English.
 */
function EditorNote({ text, title }: { text: string; title: string }) {
  return (
    <section aria-label={title} className="border-b border-line py-6 @[880px]:py-8">
      <div className="mono text-[10.5px] font-semibold tracking-[0.18em] text-accent">{title}</div>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-[1.9] text-ink-2 @[560px]:text-justify">{text}</p>
    </section>
  );
}

export function ReportPaper({ report, index, lang = "zh", editorNote }: { report: ReportDetail; index: ReportNavigationEntry[]; lang?: DisplayLanguage; editorNote?: { note: string; noteEn?: string } | null }) {
  const en = lang === "en";
  const daily = report.kind === "daily";
  const leadStory = leadStoryOf(report, lang);
  const pages = pagesOf(report, leadStory, lang);
  const count = pages.reduce((sum, p) => sum + p.items.length, 0) + (leadStory ? 1 : 0);
  // Only a daily comes out with nothing in it: a day the editors judged with nothing new (REPORTS.quiet).
  const quiet = count === 0 && (en ? report.flashes.every((f) => !hasEnglish(f)) : report.flashes.length === 0);
  const flashShown = report.flashes.filter((f) => !en || hasEnglish(f)).length > 0;
  const tailShown = report.tail.filter((f) => !en || hasEnglish(f));
  return (
    <article className="@container">
      <Masthead report={report} index={index} quiet={quiet} lang={lang} />
      {daily && !en && editorNote?.note && <EditorNote text={editorNote.note} title="编辑手记" />}
      {daily && en && editorNote?.noteEn && <EditorNote text={editorNote.noteEn} title="Editor's note" />}
      {quiet ? (
        !en && report.lead && <QuietFront lead={report.lead} />
      ) : (
        <>
          {!daily && leadStory && report.overview && !en && <Overview text={report.overview} title="本期导读" />}
          <FrontPage report={report} pages={pages} leadStory={leadStory} count={count} lang={lang} />
          {daily && report.overview && !en && <Overview text={report.overview} title="今日综述" />}
          {daily && report.overviewEn && en && <Overview text={report.overviewEn} title="Today's overview" />}
        </>
      )}

      {pages.map((p, i) => (
        <SectionPage key={p.id} id={p.id} no={i + 1} label={en ? sectionEn(p.label, i + 1) : p.label}>
          {p.summary && !en && (
            <p className="border-b border-line py-5 text-[15.5px] leading-[1.9] text-ink-2 @[560px]:text-justify">
              <span className="mr-2 font-semibold text-accent">本版导读</span>
              {p.summary}
            </p>
          )}
          <Rows items={p.items}>{(c, cell) => <Story key={`${p.id}-${keyOf(c)}`} c={c} dated={!daily} lang={lang} className={cell} />}</Rows>
        </SectionPage>
      ))}

      {report.flashes.filter((f) => !en || hasEnglish(f)).length > 0 && (
        <SectionPage id="s-flash" no={pages.length + 1} label={en ? "Briefs" : "快讯"}>
          <ul className={`${COLUMNS} @[1040px]:columns-3`}>
            {report.flashes
              .filter((f) => !en || hasEnglish(f))
              .map((f, i) => (
                <li key={`${keyOf(f)}-${i}`} className="flex break-inside-avoid gap-2.5 border-b border-line py-3 text-[14.5px] leading-[1.65]">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                  <span className="min-w-0">
                    {!f.available ? (
                      <span className="text-ink-4">
                        <span className="line-through">{en ? enTitle(f) : f.title}</span>
                        <span className="ml-2 text-[12px]">{withdrawnNote(lang)}</span>
                      </span>
                    ) : f.itemId ? (
                      <Link viewTransition to={itemHref(f.itemId, lang)} className="text-ink transition-colors hover:text-accent">
                        {en ? enTitle(f) : f.title}
                      </Link>
                    ) : (
                      <span className="text-ink">{en ? enTitle(f) : f.title}</span>
                    )}
                    {f.available && <span className="ml-2 text-[12px] text-ink-4">{en ? localizedSourceName(f.sourceName, lang, f.sourceUrl) : f.sourceName}</span>}
                    {f.available && f.followUp && (
                      <Badge className="ml-2 align-[1px]" title={en ? `The ${localizedMonthDay(f.followUp, "en")} daily covered this; these are the new developments` : `${monthDay(f.followUp)}的日报报道过这件事，这里是新进展`}>
                        {en ? "Follow-up" : "跟进"}
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </SectionPage>
      )}

      {tailShown.length > 0 && (
        <SectionPage id="s-tail" no={pages.length + (flashShown ? 2 : 1)} label={en ? "Also today" : "当日动态"}>
          <ul className={`${COLUMNS} @[1040px]:columns-3`}>
            {tailShown.map((t, i) => (
              <li key={`${keyOf(t)}-${i}`} className="flex break-inside-avoid gap-2.5 border-b border-line py-3 text-[14.5px] leading-[1.65]">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span className="min-w-0">
                  {!t.available ? (
                    <span className="text-ink-4">
                      <span className="line-through">{en ? enTitle(t) : t.title}</span>
                      <span className="ml-2 text-[12px]">{withdrawnNote(lang)}</span>
                    </span>
                  ) : t.itemId ? (
                    <Link viewTransition to={itemHref(t.itemId, lang)} className="text-ink transition-colors hover:text-accent">
                      {en ? enTitle(t) : t.title}
                    </Link>
                  ) : (
                    <span className="text-ink">{en ? enTitle(t) : t.title}</span>
                  )}
                  {t.available && t.publishedAt && <span className="ml-2 whitespace-nowrap text-[12px] text-ink-4">{localizedMonthDayTime(t.publishedAt, lang)}</span>}
                  {t.available && <span className="ml-2 text-[12px] text-ink-4">{en ? localizedSourceName(t.sourceName, lang, t.sourceUrl) : t.sourceName}</span>}
                </span>
              </li>
            ))}
          </ul>
        </SectionPage>
      )}

      <Neighbours report={report} index={index} lang={lang} />
      {!daily && <History report={report} index={index} lang={lang} />}
      <footer className="py-10 text-center">
        <div className="text-[13px] font-semibold tracking-[0.6em] text-ink-4">{en ? "(END OF ISSUE)" : "（本期完）"}</div>
        <p className="mt-3 text-[12px] text-ink-4">
          {en
            ? `Assembled automatically by the ${SITE.name} editing system from public sources, with the original linked for every entry · `
            : `${SITE.name} ${KIND_LABEL[report.kind]}由编辑系统根据公开来源自动${daily ? "编辑" : "综合"}，每条均附原文 · `}
          <Link to={daily ? "/daily/archive" : "#report-history"} viewTransition={daily} className="font-medium text-ink-3 transition-colors hover:text-accent">
            {en ? (daily ? "Daily archive" : `Past ${KIND_LABEL_EN[report.kind].toLowerCase()}s`) : daily ? "日报合订本" : `往期${KIND_LABEL[report.kind]}`}
          </Link>
        </p>
      </footer>
    </article>
  );
}
