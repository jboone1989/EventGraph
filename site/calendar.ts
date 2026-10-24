// 政策与数据日历（specs/004-editorial-ops FR-002）：人工维护的官方发布日程，页面 /calendar 与
// 订阅 /calendar.ics 都从这里读。数据由编辑核对官方页面后录入——这里只录已核对的日期，
// 宁缺毋滥；节奏说明（如 EIA 每周三）放在 CALENDAR_NOTES，不进日历条目。
export interface CalendarEntry {
  /** 发布日（当地时间），YYYY-MM-DD。 */
  date: string;
  source: "fed" | "ecb" | "bls" | "eia" | "cny" | "other";
  title: string;
  titleEn: string;
  /** 官方页面（选填）。 */
  url?: string;
  /** 当地时间的具体时刻（选填，只用于页面展示；订阅导出按全天事件处理）。 */
  time?: string;
}

/** Fed 公布的 2026 年余下 FOMC 会期（声明日为会期次日，美东 14:00）。 */
export const CALENDAR: CalendarEntry[] = [
  {
    date: "2026-10-28",
    source: "fed",
    title: "FOMC 会议第二日，公布利率决议与声明",
    titleEn: "FOMC day 2: rate decision and statement",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    time: "14:00 ET",
  },
  {
    date: "2026-12-09",
    source: "fed",
    title: "FOMC 会议第二日，公布利率决议、声明与经济预测",
    titleEn: "FOMC day 2: rate decision, statement and projections",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    time: "14:00 ET",
  },
];

export const CALENDAR_NOTES = {
  updated: "2026-10-24",
  /** 有固定节奏、但没有单条日期的发布：写在页面说明区，不进日历与订阅。 */
  rhythms: [
    {
      source: "eia" as const,
      text: "EIA 周度报告：石油状况报告通常在周三、天然气库存通常在周四发布（均为美东 10:30，节假日顺延）。",
      textEn: "EIA weekly reports: petroleum status usually Wednesday, natural gas storage usually Thursday (10:30 AM ET; holidays shift a day).",
    },
  ],
  /** 常见机构发布日历的官方入口，方便编辑核对与读者自查。 */
  references: [
    { name: "Federal Reserve — FOMC calendar", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
    { name: "BLS — release schedule", url: "https://www.bls.gov/schedule/news_release/2026_sched.htm" },
    { name: "ECB — monetary policy meetings", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" },
    { name: "EIA — weekly releases", url: "https://www.eia.gov/outlooks/steo/" },
  ],
};

/** ICS 订阅：全天事件，UID 稳定（同一日期与来源重发不产生重复）。 */
export function calendarIcs(): string {
  // Only text values escape commas and semicolons (RFC 5545 §3.3.11); property names keep theirs.
  const text = (v: string) => v.replace(/([,;\\])/g, "\\$1");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//livingruntime//calendar//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of CALENDAR) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:calendar-${e.date}-${e.source}@livingruntime.com`,
      `DTSTAMP:${CALENDAR_NOTES.updated.replace(/-/g, "")}T000000Z`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`,
      `SUMMARY:${text(e.title)}`,
      ...(e.url ? [`URL:${text(e.url)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
