// The English edition: stable /en addresses for the pages that read fully in English, so search engines
// can index them (with hreflang to the Chinese page). Elsewhere English stays the reader's preference.
const COUNTERPARTS = [
  /^\/$/, /^\/hot$/, /^\/knowledge$/, /^\/knowledge\/entity\/[^/]+$/, /^\/explore$/, /^\/story\/[^/]+$/,
  /^\/daily$/, /^\/daily\/\d{4}-\d{2}-\d{2}$/, /^\/weekly$/, /^\/weekly\/[^/]+$/, /^\/monthly$/, /^\/monthly\/[^/]+$/,
  /^\/topics$/, /^\/topics\/[^/]+$/, /^\/items\/[^/]+$/,
];

export const isEnglishPath = (pathname: string) => pathname === "/en" || pathname.startsWith("/en/");

/** The Chinese page an /en address stands for (the path itself when it is not one). */
export function chinesePath(pathname: string): string {
  if (!isEnglishPath(pathname)) return pathname;
  return pathname.slice(3) || "/";
}

/** The /en address of a Chinese page, or null when the page has no English edition. */
export function englishPath(pathname: string): string | null {
  const zh = chinesePath(pathname);
  if (!COUNTERPARTS.some((re) => re.test(zh))) return null;
  return zh === "/" ? "/en" : `/en${zh}`;
}
