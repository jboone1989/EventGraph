// The post an X item quotes, as X shows it under the post: who wrote it, what they said and a way to
// it. The item's own text and translation often only make sense next to it.
import type { XPostView } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishText, hasHan } from "../../lib/english";
import { IconArrowUpRight } from "../../components/icons";

type Quoted = NonNullable<XPostView["quoted"]>;

function Author({ quoted }: { quoted: Pick<Quoted, "authorName" | "handle"> }) {
  const t = useText();
  const en = useUiLanguage() === "en";
  return (
    <>
      <span className="text-ink-4">{t("引用", "Quoted")}</span>
      <span className="font-semibold text-ink-2">{en && hasHan(quoted.authorName ?? "") ? `@${quoted.handle}` : quoted.authorName || `@${quoted.handle}`}</span>
      {quoted.authorName && quoted.handle && !(en && hasHan(quoted.authorName)) && <span className="text-ink-4">@{quoted.handle}</span>}
    </>
  );
}

/** Item page: the whole quoted post, in Chinese with the original a tap away (the original view shows the original). */
export function QuotedPost({ quoted, original = false }: { quoted: Quoted; original?: boolean }) {
  const t = useText();
  const en = useUiLanguage() === "en";
  const zh = original ? null : quoted.translation;
  const text = en ? englishText(quoted.text) : zh ?? quoted.text;
  return (
    <figure className="mt-6 rounded-tile border border-line px-4 py-3.5">
      <figcaption className="flex flex-wrap items-baseline gap-x-1.5 text-[13px]">
        <Author quoted={quoted} />
      </figcaption>
      {text && <blockquote className="mt-2 whitespace-pre-line text-[15px] leading-[1.75] text-ink-2">{text}</blockquote>}
      {en && !text && <p className="mt-2 text-[13px] text-ink-4">This quoted post is available in its original language.</p>}
      {!en && zh && (
        <details className="mt-2 text-[13px] text-ink-4">
          <summary className="cursor-pointer select-none hover:text-ink-3">{t("原文", "Original")}</summary>
          <p className="mt-1.5 whitespace-pre-line text-[14px] leading-[1.7] text-ink-3">{quoted.text}</p>
        </details>
      )}
      {en && !text && <details className="mt-2 text-[13px] text-ink-4"><summary className="cursor-pointer">Show original quoted text</summary><p className="mt-1.5 whitespace-pre-line">{quoted.text}</p></details>}
      {quoted.url && (
        <a href={quoted.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-0.5 text-[13px] text-accent hover:text-accent-ink">
          {t("在 X 查看被引用的帖子", "View the quoted post on X")} <IconArrowUpRight size={13} />
        </a>
      )}
    </figure>
  );
}

/** Feed card: who is quoted and the start of what they said (the card itself opens the item). */
export function QuotedLine({ quoted }: { quoted: Omit<Quoted, "url"> }) {
  return (
    <div className="mt-2.5 rounded-tile border border-line-soft px-3 py-2 text-[13px] leading-[1.6]">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <Author quoted={quoted} />
      </div>
      <p className="mt-0.5 line-clamp-2 text-ink-3">{quoted.translation ?? quoted.text}</p>
    </div>
  );
}
