// Shared schema for single-pass editorial analysis and manual evaluation.
import { z } from "zod";

// A watchpoint date must be a full calendar date that exists (D-04: 2026-02-30 is not a date); one the
// source does not state in full becomes null (the wording keeps its own date expression in text).
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** Every full calendar date the source text itself states, as ISO dates: numeric (2026-11-05, 2026/11/05,
 *  2026年11月5日) and English month forms (November 5, 2026 / 5 November 2026 / Nov 5, 2026). Month-only,
 *  quarter or relative dates are deliberately absent. */
export function fullDatesIn(text: string): Set<string> {
  const dates = new Set<string>();
  const add = (y: number, m: number, d: number) => { if (y >= 1000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) dates.add(`${y}-${pad(m)}-${pad(d)}`); };
  for (const m of text.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of text.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  for (const m of text.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi)) {
    const month = MONTHS[m[1]!.toLowerCase().slice(0, 3)]; if (month) add(Number(m[3]), month, Number(m[2]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/gi)) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, 3)]; if (month) add(Number(m[3]), month, Number(m[1]));
  }
  return dates;
}

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => { const [y, m, day] = d.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, day)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day; })
  .nullish().catch(null);
const noChinese = (value: string) => !/[㐀-鿿]/u.test(value);
const line = (max: number, english = false) => {
  const value = z.string().trim().max(max);
  return (english ? value.refine(noChinese, "contains Chinese characters") : value)
    .transform((s) => s || null).nullish();
};
// Reject Chinese characters in EVERY English field, including watchpoint text; prompt language
// alone is not a guarantee. Invalid model answers follow the existing shape-retry receipt path.
const explainSchema = (english: boolean) => z.object({
  who: line(240, english),
  what: line(500, english),
  when: line(160, english),
  where: line(200, english),
  why: line(500, english),
  how: line(500, english),
  soWhat: line(900, english),
  watchpoints: z.array(z.object({
    text: english ? z.string().trim().min(4).max(240).refine(noChinese, "contains Chinese characters")
      : z.string().trim().min(4).max(240),
    date: calendarDate,
  })).max(3).default([]),
});
export const ExplainSchema = explainSchema(false);
export const EnglishExplainSchema = explainSchema(true);

