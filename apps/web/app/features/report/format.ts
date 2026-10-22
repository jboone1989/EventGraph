// Names, dates and grouping for daily, weekly and monthly reports. Display helpers take the display
// language explicitly (server and client never share language state); Chinese keeps the paper's idioms.
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { beijingDate, beijingWeekday, isoWeekLabel, isoWeekRange } from "@aihot/contracts/time";
import { EDITION_TIMES, EDITION_WHEN, REPORTS, REPORTS_EN, SITE, subjectAfter } from "@aihot/site";
import { RELEASE, SECTION_EN } from "@aihot/industry/taxonomy";
import { monthDay, weekdayShort, localizedMonthDay, type DisplayLanguage } from "../../lib/format.ts";
import { hasHan } from "../../lib/english.ts";
import { chinesePath } from "../../lib/edition.ts";

export const KINDS: ReportKind[] = ["daily", "weekly", "monthly"];
export const KIND_PATH: Record<ReportKind, string> = { daily: "/daily", weekly: "/weekly", monthly: "/monthly" };
export const KIND_LABEL: Record<ReportKind, string> = { daily: "日报", weekly: "周报", monthly: "月报" };
export const KIND_LABEL_EN: Record<ReportKind, string> = { daily: "Daily brief", weekly: "Weekly brief", monthly: "Monthly brief" };
export const kindLabel = (kind: ReportKind, lang: DisplayLanguage = "zh") => (lang === "en" ? KIND_LABEL_EN[kind] : KIND_LABEL[kind]);

export function kindFromPath(pathname: string): ReportKind {
  const p = chinesePath(pathname);
  if (p.startsWith("/weekly")) return "weekly";
  if (p.startsWith("/monthly")) return "monthly";
  return "daily";
}

/** The kind's RSS feed, announced in the page head so a reader given the page finds it. The feed is Chinese content, so its title stays Chinese. */
export const feedLink = (kind: ReportKind) => ({ tagName: "link", rel: "alternate", type: "application/rss+xml", title: `${SITE.name} ${KIND_LABEL[kind]}`, href: `/feed/${kind}.xml` }) as const;

export function reportPath(kind: ReportKind, key: string, lang: DisplayLanguage = "zh"): string {
  return `${lang === "en" ? "/en" : ""}${KIND_PATH[kind]}/${key}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const { measure, noun } = REPORTS.entry;
/** "件大事": what an issue counts its entries in, in the site's words (REPORTS.entry). */
export const ENTRIES_UNIT = `${measure}${noun}`;
/** The unit after a count: English picks its singular for one entry. */
export const entriesUnit = (count: number, lang: DisplayLanguage = "zh") => (lang === "en" ? (count === 1 ? REPORTS_EN.entry.measure : REPORTS_EN.entry.noun) : ENTRIES_UNIT);

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const enMonth = (yearMonth: string) => EN_MONTHS[Number(yearMonth.slice(5, 7)) - 1]!;

/** "这一天的 4 件 AI 大事" / "This week's 12 stories" / "August's 20 stories" (the site's words, REPORTS). */
export function headline(kind: ReportKind, key: string, count: number, lang: DisplayLanguage = "zh"): string {
  if (lang === "en") {
    const unit = entriesUnit(count, "en");
    if (kind === "daily") return `The day's ${count} ${unit}`;
    if (kind === "weekly") return `This week's ${count} ${unit}`;
    return `${enMonth(key)}'s ${count} ${unit}`;
  }
  if (kind === "daily") return subjectAfter(`这一天的 ${count} ${measure}`, noun);
  if (kind === "weekly") return subjectAfter(`本周的 ${count} ${measure}`, noun);
  return subjectAfter(`${Number(key.slice(5, 7))} 月的 ${count} ${measure}`, noun);
}

/** "09.16" for a story inside a week or month. */
export function shortDay(iso: string): string {
  return beijingDate(iso).slice(5).replace("-", ".");
}

export interface ArchiveGroup {
  id: string;
  label: string;
  entries: Array<ReportNavigationEntry & { short: string }>;
}

/**
 * The archive column: days grouped by month, weeks by the month their Monday falls in ("第2周"),
 * months by year. Newest first, as the index comes.
 */
export function archiveGroups(kind: ReportKind, index: ReportNavigationEntry[], lang: DisplayLanguage = "zh"): ArchiveGroup[] {
  const groups: ArchiveGroup[] = [];
  const push = (id: string, label: string, e: ReportNavigationEntry & { short: string }) => {
    const g = groups[groups.length - 1];
    if (g && g.id === id) g.entries.push(e);
    else groups.push({ id, label, entries: [e] });
  };
  if (kind === "weekly") {
    const byMonth = new Map<string, string[]>();
    for (const e of index) {
      const m = isoWeekRange(e.key)!.start.slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), e.key]);
    }
    for (const e of index) {
      const m = isoWeekRange(e.key)!.start.slice(0, 7);
      const weeks = [...byMonth.get(m)!].sort();
      const nth = weeks.indexOf(e.key) + 1;
      push(m, lang === "en" ? `${enMonth(m)} ${m.slice(0, 4)}` : `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`, { ...e, short: lang === "en" ? `Week ${nth}` : `第${nth}周` });
    }
    return groups;
  }
  for (const e of index) {
    if (kind === "daily") {
      const label = lang === "en" ? `${enMonth(e.key)} ${e.key.slice(0, 4)}` : `${e.key.slice(0, 4)} 年 ${Number(e.key.slice(5, 7))} 月`;
      push(e.key.slice(0, 7), label, { ...e, short: lang === "en" ? String(Number(e.key.slice(8, 10))) : `${Number(e.key.slice(8, 10))} 日` });
    } else {
      const label = lang === "en" ? e.key.slice(0, 4) : `${e.key.slice(0, 4)} 年`;
      push(e.key.slice(0, 4), label, { ...e, short: lang === "en" ? enMonth(e.key) : `${Number(e.key.slice(5, 7))} 月` });
    }
  }
  return groups;
}

/** An issue's mark in the archive column: a large number over a small word (a month's number stands alone). */
export function archiveMark(kind: ReportKind, key: string, lang: DisplayLanguage = "zh"): { big: string; small: string | null } {
  if (kind === "daily") return { big: key.slice(8, 10), small: lang === "en" ? weekdayShortEn(key) : weekdayShort(key) };
  if (kind === "weekly") {
    const { start } = isoWeekRange(key)!;
    return { big: key.slice(6), small: lang === "en" ? `from ${start.slice(5).replace("-", ".")}` : `${start.slice(5).replace("-", ".")} 起` };
  }
  return { big: key.slice(5, 7), small: null };
}

const weekdayShortEn = (date: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(date + "T12:00:00+08:00"));

/** Short chip label for the phone switcher: "今天", "9月26日", "9月第2周", "8 月" / "Today", "Sep 26", "W38", "Aug". */
export function chipLabel(kind: ReportKind, key: string, index: ReportNavigationEntry[], today: string, lang: DisplayLanguage = "zh"): string {
  if (kind === "daily") return lang === "en" ? (key === today ? "Today" : localizedMonthDay(key, "en")) : key === today ? "今天" : monthDay(key);
  if (kind === "monthly") return lang === "en" ? enMonth(key).slice(0, 3) : `${Number(key.slice(5, 7))} 月`;
  const group = archiveGroups("weekly", index, lang).find((g) => g.entries.some((e) => e.key === key));
  const entry = group?.entries.find((e) => e.key === key);
  if (lang === "en") return entry ? `W${Number(key.slice(6))}` : key;
  return group && entry ? `${Number(group.id.slice(5))}月${entry.short}` : key;
}

/**
 * "第 N 期": the issue's place in its series as the server counts it over every issue. The navigation
 * index holds only the newest issues, so its length cannot tell.
 */
export function issueNumber(index: ReportNavigationEntry[], key: string): number | null {
  return index.find((e) => e.key === key)?.issueNumber ?? null;
}

/** The masthead's date block: a large figure and two small lines beside it. */
export function dateMark(kind: ReportKind, key: string, lang: DisplayLanguage = "zh"): { figure: string; top: string; bottom: string } {
  if (lang === "en") {
    if (kind === "daily") return { figure: key.slice(8, 10), top: `${enMonth(key)} ${key.slice(0, 4)}`, bottom: weekdayShortEn(key) };
    if (kind === "weekly") {
      const { start, end } = isoWeekRange(key)!;
      return { figure: key.slice(6), top: `Week ${Number(key.slice(6))}, ${key.slice(0, 4)}`, bottom: `${start.slice(5).replace("-", ".")} — ${end.slice(5).replace("-", ".")}` };
    }
    return { figure: key.slice(5, 7), top: key.slice(0, 4), bottom: enMonth(key) };
  }
  if (kind === "daily") return { figure: key.slice(8, 10), top: `${key.slice(0, 4)} 年 ${Number(key.slice(5, 7))} 月`, bottom: beijingWeekday(key) };
  if (kind === "weekly") {
    const { start, end } = isoWeekRange(key)!;
    return { figure: key.slice(6), top: `${key.slice(0, 4)} 年第 ${Number(key.slice(6))} 周`, bottom: `${start.slice(5).replace("-", ".")} — ${end.slice(5).replace("-", ".")}` };
  }
  return { figure: key.slice(5, 7), top: `${key.slice(0, 4)} 年`, bottom: `${Number(key.slice(5, 7))} 月` };
}

/** When each kind comes out, for the masthead (the times are the site's, EDITION_TIMES). */
export const EDITION: Record<ReportKind, string> = { daily: `${EDITION_WHEN.daily} 出刊`, weekly: "每周一出刊", monthly: "每月 1 日出刊" };
export const edition = (kind: ReportKind, lang: DisplayLanguage = "zh") =>
  lang === "en"
    ? { daily: `Published daily at ${EDITION_TIMES.daily}`, weekly: "Published Mondays", monthly: "Published on the 1st" }[kind]
    : EDITION[kind];

/**
 * The masthead's figures, in the order a reader wants them, in the site's words (REPORTS). Releases of the
 * pack's headline launch kind (RELEASE, "个新模型" for AI) count only where the pack has one, and its unit
 * shows on English pages only when the pack wrote one without Han characters; zero is left out.
 */
const METRICS: Array<[key: string, zh: string, en: string | null]> = [
  ["totalEvents", ENTRIES_UNIT, REPORTS_EN.entry.noun],
  ["totalStories", ENTRIES_UNIT, REPORTS_EN.entry.noun],
  ["sourcesCount", REPORTS.metricUnits.sourcesCount, REPORTS_EN.metricUnits.sourcesCount],
  ["firstPartyEvents", REPORTS.metricUnits.firstPartyEvents, REPORTS_EN.metricUnits.firstPartyEvents],
  ...(RELEASE ? [["modelsReleased", RELEASE.unit, hasHan(RELEASE.unit) ? null : RELEASE.unit] as [string, string, string | null]] : []),
  ["selectedCount", REPORTS.metricUnits.selectedCount, REPORTS_EN.metricUnits.selectedCount],
  ["reportsCovered", REPORTS.metricUnits.reportsCovered, REPORTS_EN.metricUnits.reportsCovered],
];
export function metricItems(metrics: Record<string, number>, lang: DisplayLanguage = "zh"): Array<{ value: number; unit: string }> {
  return METRICS.filter(([k]) => typeof metrics[k] === "number" && (k !== "modelsReleased" || metrics[k]! > 0))
    .flatMap(([k, zh, en]) => {
      const unit = lang === "en" ? en : zh;
      return unit ? [{ value: metrics[k]!, unit }] : [];
    });
}

/** "前一日 · 9月25日", "Previous day · Sep 25", "Next issue · Week 39", "Next issue · September". */
export function neighbourLabel(kind: ReportKind, key: string, direction: "prev" | "next", lang: DisplayLanguage = "zh"): string {
  if (lang === "en") {
    const which = direction === "prev" ? "Previous" : "Next";
    if (kind === "daily") return `${which} day · ${localizedMonthDay(key, "en")}`;
    return kind === "weekly" ? `${which} issue · Week ${Number(key.slice(6))}` : `${which} issue · ${enMonth(key)}`;
  }
  if (kind === "daily") return `${direction === "prev" ? "前一日" : "后一日"} · ${monthDay(key)}`;
  const which = direction === "prev" ? "上一期" : "下一期";
  return kind === "weekly" ? `${which} · 第 ${Number(key.slice(6))} 周` : `${which} · ${Number(key.slice(5, 7))} 月`;
}

const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
/** Page numbers as a Chinese paper prints them: 1 → 一, 12 → 十二, 20 → 二十. */
function cnNumber(n: number): string {
  if (n <= 10) return CN[n]!;
  if (n < 20) return `十${CN[n - 10]}`;
  return `${CN[Math.floor(n / 10)]}十${n % 10 ? CN[n % 10] : ""}`;
}

/** The line above the nameplate: "2026 年 9 月 26 日 · 星期六", "Week 38, 2026 · 09.14 — 09.20", "August 2026". */
export function dateLine(kind: ReportKind, key: string, lang: DisplayLanguage = "zh"): string {
  const m = dateMark(kind, key, lang);
  if (lang === "en") {
    if (kind === "daily") return `${enMonth(key)} ${Number(key.slice(8, 10))}, ${key.slice(0, 4)} · ${m.bottom}`;
    return kind === "weekly" ? `${m.top} · ${m.bottom}` : `${m.bottom} ${m.top}`;
  }
  if (kind === "daily") return `${m.top} ${Number(key.slice(8, 10))} 日 · ${m.bottom}`;
  return kind === "weekly" ? `${m.top} · ${m.bottom}` : `${m.top} ${m.bottom}`;
}

/** What each kind is, under its nameplate. */
export const MOTTO: Record<ReportKind, string> = { daily: `${REPORTS.motto} · 每日要闻`, weekly: `${REPORTS.motto} · 每周综述`, monthly: `${REPORTS.motto} · 每月盘点` };
export const motto = (kind: ReportKind, lang: DisplayLanguage = "zh") =>
  lang === "en"
    ? { daily: `${REPORTS_EN.motto} · The day in brief`, weekly: `${REPORTS_EN.motto} · The week in review`, monthly: `${REPORTS_EN.motto} · The month in review` }[kind]
    : MOTTO[kind];

export interface PeriodCell {
  key: string | null;
  /** Hover text: "9月26日 · 第 158 期" / "Sep 26 · Issue 158". */
  label: string;
  state: "current" | "issue" | "none" | "pad";
}

/**
 * The dot grid beside the date in the masthead: the days of this issue's month (dailies, Monday first),
 * the weeks of its year (weeklies) or the months of its year (monthlies), each marked as this issue,
 * an issue that exists, or none. This issue's own number (`current`) labels it, also when it is older
 * than the navigation.
 */
export function periodGrid(kind: ReportKind, key: string, index: ReportNavigationEntry[], current: number, lang: DisplayLanguage = "zh"): { title: string; note: string; columns: number; heads: string[] | null; cells: PeriodCell[] } {
  const exists = new Set(index.map((e) => e.key));
  const cell = (k: string, name: string): PeriodCell => {
    const n = k === key ? current : issueNumber(index, k);
    const issue = lang === "en" ? `Issue ${n}` : `第 ${n} 期`;
    return { key: k, label: n ? `${name} · ${issue}` : `${name} · ${lang === "en" ? "Not published" : "未出刊"}`, state: k === key ? "current" : exists.has(k) ? "issue" : "none" };
  };
  const count = (cells: PeriodCell[]) => cells.filter((c) => c.state === "issue" || c.state === "current").length;
  const year = key.slice(0, 4);
  if (kind === "daily") {
    const m = Number(key.slice(5, 7));
    const days = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(Number(year), m - 1, 1)).getUTCDay() + 6) % 7;
    const cells: PeriodCell[] = [
      ...Array.from({ length: lead }, (): PeriodCell => ({ key: null, label: "", state: "pad" })),
      ...Array.from({ length: days }, (_, i) => {
        const day = `${key.slice(0, 7)}-${pad(i + 1)}`;
        return cell(day, lang === "en" ? localizedMonthDay(day, "en") : monthDay(day));
      }),
    ];
    return {
      title: lang === "en" ? `${enMonth(key)} ${year}` : `${cnNumber(m)}月`,
      note: lang === "en" ? `${count(cells)} issues this month` : `本月 ${count(cells)} 期`,
      columns: 7,
      heads: lang === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["一", "二", "三", "四", "五", "六", "日"],
      cells,
    };
  }
  if (kind === "weekly") {
    // 28 December always falls in its year's last ISO week.
    const weeks = Number(isoWeekLabel(`${year}-12-28`).slice(6));
    const cells = Array.from({ length: weeks }, (_, i) => {
      const k = `${year}-W${pad(i + 1)}`;
      const { start, end } = isoWeekRange(k)!;
      const range = `${start.slice(5).replace("-", ".")}—${end.slice(5).replace("-", ".")}`;
      return cell(k, lang === "en" ? `Week ${i + 1} (${range})` : `第 ${i + 1} 周（${range}）`);
    });
    return { title: lang === "en" ? year : `${year} 年`, note: lang === "en" ? `${count(cells)} issues in ${year}` : `全年 ${count(cells)} 期`, columns: 13, heads: null, cells };
  }
  const cells = Array.from({ length: 12 }, (_, i) => cell(`${year}-${pad(i + 1)}`, lang === "en" ? EN_MONTHS[i]! : `${i + 1} 月`));
  return { title: lang === "en" ? year : `${year} 年`, note: lang === "en" ? `${count(cells)} issues in ${year}` : `全年 ${count(cells)} 期`, columns: 6, heads: null, cells };
}

/** A section's name in English, from the industry pack's own translation; "Section N" when it has none. */
export const sectionEn = (label: string, no: number) => SECTION_EN[label] ?? `Section ${no}`;
