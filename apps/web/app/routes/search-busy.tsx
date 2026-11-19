import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { RingMark } from "@aihot/site/brand/Logo.tsx";
import { PhoneBar } from "../components/shell/PhoneBar";
import { useText } from "../components/LanguageSwitch";
import type { Screen } from "../components/shell/screens";
import { titled } from "../lib/seo";

export const handle: Screen = { tab: "featured" };

export function meta() {
  return [{ title: titled("搜索繁忙") }];
}
export function headers() {
  return { "Cache-Control": "no-store" };
}

const RETRY_AFTER_SECONDS = 5;
const SEARCH_PARAMS = ["q", "tag", "channel", "category", "page", "tab"];

/** The busy page after an overloaded search: the same search can be tried again after a few seconds. */
export default function SearchBusy() {
  const t=useText();
  const { pathname, search } = useLocation();
  const [wait, setWait] = useState(RETRY_AFTER_SECONDS);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const kept = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(search)) if (SEARCH_PARAMS.includes(k)) kept.append(k, v);
  const base = pathname.startsWith("/all") ? "/all" : "/";
  const retry = kept.toString() ? `${base}?${kept}` : base;
  const hasSearch = kept.has("q");
  const button = "inline-flex h-9 items-center rounded-full px-4 text-[13.5px]";
  return (
    <>
    <PhoneBar back={{ to: base, label: base === "/all" ? t("全部","All news") : t("精选","News") }} />
    <div className="mx-auto max-w-sm py-24 text-center" aria-live="polite">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink">{t("搜索有点忙","Search is busy")}</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{t("现在搜索的人比较多，请 ","There is high search traffic. Try again in ")}{RETRY_AFTER_SECONDS}{t(" 秒以后重试。列表浏览不受影响。"," seconds. You can still browse news.")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        {hasSearch &&
          (wait > 0 ? (
            <span aria-disabled="true" className={`${button} num cursor-default bg-bg-sunk font-medium text-ink-4`}>{wait} {t("秒后可重试","seconds remaining")}</span>
          ) : (
            <Link to={retry} className={`${button} bg-accent font-medium text-accent-contrast hover:bg-accent-ink`}>{t("重试这次搜索","Retry search")}</Link>
          ))}
        <Link to="/all" className={`${button} ${hasSearch ? "border border-line-strong bg-surface text-ink-2 hover:border-ink-4" : "bg-accent font-medium text-accent-contrast hover:bg-accent-ink"}`}>{t("浏览全部动态","All news")}</Link>
        <Link to="/" className={`${button} border border-line-strong bg-surface text-ink-2 hover:border-ink-4`}>{t("回到精选","Home")}</Link>
      </div>
    </div>
    </>
  );
}
