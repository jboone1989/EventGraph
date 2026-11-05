// Shared schema for single-pass editorial analysis and manual evaluation.
import { z } from "zod";

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

