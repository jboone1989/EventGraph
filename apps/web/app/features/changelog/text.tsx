import { weekdayShort, type DisplayLanguage } from "../../lib/format";

/** Release notes carry a little Markdown: **bold** runs. */
export function Inline({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-ink-2">{part}</b> : part))}</>;
}

export function dateHeading(date: string, language: DisplayLanguage): { label: string; weekday: string } {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (language === "en") {
    return {
      label: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(date + "T12:00:00+08:00")),
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Shanghai" }).format(new Date(date + "T12:00:00+08:00")),
    };
  }
  return { label: `${y} 年 ${m} 月 ${d} 日`, weekday: weekdayShort(date) };
}
