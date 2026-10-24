import { useEffect, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router";
import { chinesePath, englishPath, isEnglishPath } from "../lib/edition";

/** The reading preference is client-only, and the unprefixed server-rendered site stays Chinese, which
 * avoids shared-cache language leaks. The /en addresses (lib/edition.ts) are English for everyone,
 * server-rendered too, with hreflang to their Chinese pages.
 */
export type UiLanguage = "zh" | "en";
const KEY = "livingruntime-language";
const listeners = new Set<() => void>();
let selected: UiLanguage = "zh";
let initialized = false;
function read(): UiLanguage {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    try { selected = window.localStorage.getItem(KEY) === "en" ? "en" : "zh"; } catch {}
  }
  return selected;
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      selected = e.newValue === "en" ? "en" : "zh";
      listeners.forEach(f => f());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}
export function useUiLanguage(): UiLanguage {
  const stored = useSyncExternalStore<UiLanguage>(subscribe, read, () => "zh");
  const lang = isEnglishPath(useLocation().pathname) ? "en" : stored;
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.language = lang;
  }, [lang]);
  return lang;
}
export function setUiLanguage(lang: UiLanguage) {
  selected = lang;
  initialized = true;
  try { window.localStorage.setItem(KEY, lang); } catch {}
  listeners.forEach(f => f());
}
export function useText() {
  const lang = useUiLanguage();
  return (zh: string, en: string) => lang === "en" ? en : zh;
}

/** Shared browser preference. Article pages move between /items/:id and its English page /en/items/:id.
 * A Chinese-original article remains Chinese; it must never be mislabeled as translated English.
 */
export function LanguageSwitch() {
  const lang = useUiLanguage();
  const {pathname, search} = useLocation();
  const navigate=useNavigate();
  const choose=(next: UiLanguage) => {
    if(next===lang) return;
    setUiLanguage(next);
    // An article's English page is its /en address, which reads the original-language text.
    const match=/^(?:\/en)?\/items\/([a-zA-Z0-9_-]{1,80})(?:\/original)?$/.exec(pathname);
    if(match) { void navigate(`${next==="en"?"/en":""}/items/${match[1]}`,{replace:true}); return; }
    // A page with an English edition moves to the address of the language chosen.
    const en=englishPath(pathname);
    if(en) void navigate((next==="en"?en:chinesePath(pathname))+search,{replace:true});
  };
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 text-[11px]" role="group" aria-label="Language / 语言">
      <button type="button" onClick={()=>choose("en")} aria-pressed={lang==="en"}
        className={`rounded-md px-2 py-1.5 font-semibold transition-colors ${lang==="en"?"bg-accent text-white":"text-ink-3 hover:bg-bg-sunk"}`}>EN</button>
      <button type="button" onClick={()=>choose("zh")} aria-pressed={lang==="zh"}
        className={`rounded-md px-2 py-1.5 font-semibold transition-colors ${lang==="zh"?"bg-accent text-white":"text-ink-3 hover:bg-bg-sunk"}`}>中文</button>
    </div>
  );
}
