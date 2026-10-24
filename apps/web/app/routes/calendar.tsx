import { CALENDAR, CALENDAR_NOTES } from "@aihot/site/calendar";
import { edgeTtl, cachedPage } from "../lib/api.server";
import { pageReuse } from "../lib/page-reuse";
import { localized, pageMeta } from "../lib/seo";
import { beijingDate } from "@aihot/contracts/time";
import { PhoneBar } from "../components/shell/PhoneBar";
import { useText, useUiLanguage } from "../components/LanguageSwitch";
import type { Screen } from "../components/shell/screens";
import type { Route } from "./+types/calendar";

// /calendar（specs/004-editorial-ops FR-002）：人工维护的官方发布日程——接下来会发生什么，
// 读者可以订阅（/calendar.ics）。数据在 site/calendar.ts，由编辑核对官方页面后录入。
export const handle: Screen = { tab: "me" };
export function headers() {
  return edgeTtl(300);
}
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader() {
  return cachedPage(3600, { today: beijingDate(Date.now()) });
}

export function meta({ location }: Route.MetaArgs) {
  return localized(
    pageMeta({
      title: "政策与数据日历",
      description: "Fed、BLS、ECB、EIA 等官方发布的时间表：接下来会发生什么，订阅后自动进你的日历。",
      path: "/calendar",
    }),
    location.pathname,
    { title: "Policy & data calendar", description: "The schedule of official releases — Fed, BLS, ECB, EIA — with an iCal subscription for your own calendar." },
  );
}

const SOURCE_LABEL: Record<string, [string, string]> = {
  fed: ["美联储", "Fed"],
  ecb: ["欧洲央行", "ECB"],
  bls: ["美国劳工统计局", "BLS"],
  eia: ["美国能源信息署", "EIA"],
  cny: ["中国官方", "China official"],
  other: ["其他", "Other"],
};

const monthTitle = (day: string, en: boolean) => {
  const [, m] = day.split("-");
  const names = en ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] : ["1 月", "2 月", "3 月", "4 月", "5 月", "6 月", "7 月", "8 月", "9 月", "10 月", "11 月", "12 月"];
  return names[Number(m) - 1]!;
};

export default function CalendarPage({ loaderData }: Route.ComponentProps) {
  const { today } = loaderData;
  const language = useUiLanguage();
  const t = useText();
  const en = language === "en";
  const sorted = [...CALENDAR].sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = sorted.filter((e) => e.date >= today);
  const byMonth = new Map<string, typeof upcoming>();
  for (const e of upcoming) {
    const key = e.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }
  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-12">
      <PhoneBar title={t("政策与数据日历", "Policy & data calendar")} />
      <header className="pt-3 lg:pt-5">
        <p className="mono text-[10.5px] font-semibold tracking-[0.18em] text-accent">{t("接下来会发生什么", "WHAT'S AHEAD")}</p>
        <h1 data-page-title className="mt-2 text-[27px] font-bold leading-[1.4] tracking-[-0.01em] text-ink lg:text-[32px]">{t("政策与数据日历", "Policy & data calendar")}</h1>
        <p className="mt-3 max-w-[640px] text-[14px] leading-[1.9] text-ink-3">
          {t(
            "官方发布是这条信息河的节拍器。这里列出手动核对过的发布日程；订阅后新条目会自动进你的日历。日期由编辑维护，以官方页面为准。",
            "Official releases set the rhythm of this newsroom. This page lists dates an editor has checked against the official calendars; subscribe and new entries land in your own calendar. Curated by the editor — the official pages remain the source of truth.",
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <a href="/calendar.ics" className="text-accent hover:underline">{t("订阅（iCal / .ics）", "Subscribe (iCal / .ics)")}</a>
          <span className="text-ink-4">{t("更新", "updated")} {CALENDAR_NOTES.updated}</span>
        </div>
      </header>

      {upcoming.length === 0 ? (
        <p className="mt-10 text-[14px] text-ink-3">{t("近期没有已核对的条目；编辑核对官方日程后会补上。", "No verified entries near term; the editor adds them after checking the official schedules.")}</p>
      ) : (
        [...byMonth.entries()].map(([month, entries]) => (
          <section key={month} className="mt-8">
            <h2 className="border-b border-line pb-2 text-[16px] font-semibold text-ink">{monthTitle(entries[0]!.date, en)}</h2>
            <ul>
              {entries.map((e) => (
                <li key={`${e.date}-${e.source}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line-soft py-3.5">
                  <time dateTime={e.date} className="num w-[64px] shrink-0 text-[13.5px] font-semibold text-ink-2">{e.date.slice(5).replace("-", " / ")}</time>
                  <span className="w-[88px] shrink-0 text-[12px] text-ink-4">{(SOURCE_LABEL[e.source] ?? SOURCE_LABEL.other)![en ? 1 : 0]}</span>
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="min-w-0 text-[14.5px] font-[650] leading-[1.7] text-ink transition-colors hover:text-accent">
                      {en ? e.titleEn : e.title}
                    </a>
                  ) : (
                    <span className="min-w-0 text-[14.5px] font-[650] leading-[1.7] text-ink">{en ? e.titleEn : e.title}</span>
                  )}
                  {e.time && <span className="num text-[12px] text-ink-4">{e.time}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {CALENDAR_NOTES.rhythms.length > 0 && (
        <section className="mt-8">
          <h2 className="border-b border-line pb-2 text-[16px] font-semibold text-ink">{t("固定节奏", "Standing rhythm")}</h2>
          <ul className="mt-1">
            {CALENDAR_NOTES.rhythms.map((r) => (
              <li key={r.source} className="border-b border-line-soft py-3 text-[14px] leading-[1.8] text-ink-2">
                <span className="mr-2 text-[12px] text-ink-4">{(SOURCE_LABEL[r.source] ?? SOURCE_LABEL.other)![en ? 1 : 0]}</span>
                {en ? r.textEn : r.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="border-b border-line pb-2 text-[16px] font-semibold text-ink">{t("官方日历入口", "Official calendars")}</h2>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
          {CALENDAR_NOTES.references.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer" className="text-[13.5px] text-accent hover:underline">{r.name}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
