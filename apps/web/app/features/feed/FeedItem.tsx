// One report in a feed. Desktop (≥ 961px): a white card beside the time rail. Phones: a compact row with
// the time in the source line, the bookmark at hand, the reason in one line and duplicate reports
// behind one button that opens a sheet. One markup, two presentations.
import { memo } from "react";
import { Link } from "react-router";
import { IntentLink } from "../../components/ui/IntentLink";
import type { GroupInfo, FeedItemSummary, TimelineFilters } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { ITEM_COPY } from "@aihot/site";
import { SameEventBadge, SelectedBadge } from "../../components/ui/Badge";
import { ScoreLabel } from "../../components/ui/Score";
import { beijingTime } from "@aihot/contracts/time";
import { MediaThumbs, SourceLine, StarButton, TierBadge } from "./parts";
import { GroupButton, GroupSources } from "./ReadingGroup";
import { IconExternal } from "../../components/icons";
import { QuotedLine } from "../item/QuotedPost";
import { rememberPreview } from "../item/preview";
import { useUiLanguage } from "../../components/LanguageSwitch";
import { categoryName } from "./Filters";

const hasHan = (s: string) => /[\u3400-\u9fff]/u.test(s);
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } };

export interface FeedItemProps {
  item: FeedItemSummary;
  group?: GroupInfo | null;
  filters?: TimelineFilters;
  read?: boolean;
  newSinceVisit?: boolean;
  onOpen?: (id: string) => void;
  /** Show category and tags under the text (全部动态, topics, search). */
  showTags?: boolean;
  /** The time the item sits at in its list; phones show it in the source line (desktop: on the rail). */
  at?: string;
}

export const FeedItem = memo(function FeedItem({ item, group, filters, read = false, newSinceVisit = false, onOpen, showTags = false, at }: FeedItemProps) {
  const language=useUiLanguage();
  const isX = item.channel === "x" && !!item.x;
  // Only genuine source URLs, not the AIHot detail URL or untrusted schemes.
  const originalUrl = item.links?.original && /^https?:\/\//i.test(item.links.original) ? item.links.original : null;
  const host = originalUrl ? hostOf(originalUrl) : null;
  // English reading: the site's English copy when written, else the publisher's own headline, else where the report lives.
  const english = language==="en" ? item.english ?? null : null;
  const title = english ? english.title : language==="en" ? (item.originalTitle && !hasHan(item.originalTitle) ? item.originalTitle : !hasHan(item.title) ? item.title : host ? `Original report on ${host}` : "Original report from publisher") : item.title;
  const link = language==="en" ? `/en/items/${item.id}` : `/items/${item.id}`;
  const open = () => {
    rememberPreview(item);
    onOpen?.(item.id);
  };
  const showSources = !!group && (group.additionalSourceCount > 0 || group.reportCount > 1);
  const tags = showTags ? item.tags.slice(0, 3) : [];

  return (
    <article className="relative min-w-0 lg:card lg:card-hover lg:px-[18px] lg:pb-[14px] lg:pt-[15px]" data-item-id={item.id}>
      <header className="flex min-h-[22px] items-center gap-1.5 text-[12.5px] leading-[18px] text-ink-4 lg:min-h-[18px] lg:gap-2">
        {item.category && !showTags && (
          <span className="lr-cat hidden shrink-0 sm:inline-flex" style={{ "--cc": `var(--c-${item.category}, var(--ink-4))` } as React.CSSProperties}>
            {categoryName(item.category, language)}
          </span>
        )}
        <SourceLine item={item} className="text-ink-4" />
        {newSinceVisit && <span data-testid="new-since-visit" className="shrink-0 rounded border border-line-soft px-1.5 text-[11px] font-medium text-accent">
          {language === "zh" ? "上次访问后新增" : "New since last visit"}
        </span>}
        <TierBadge tier={item.source.tier} />
        {at && (
          <time dateTime={at} className="mono shrink-0 text-[12px] lg:hidden">
            · {beijingTime(at)}
          </time>
        )}
        {language==="zh" && item.selected && (
          <span className="hidden lg:inline-flex">
            {item.sameEvent ? <SameEventBadge /> : <SelectedBadge />}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 pl-2 lg:gap-1.5">
          <span className="hidden lg:inline-flex">
            {language==="zh"&&<ScoreLabel score={item.score} />}
          </span>
          <span className="lg:hidden">
            {language==="zh"&&<ScoreLabel score={item.score} compact />}
          </span>
          <span className="-my-[11px] -mr-3 inline-flex lg:-my-1 lg:mr-0">
            <StarButton item={item} className="size-11 lg:size-[26px]" />
          </span>
        </span>
      </header>

      {isX ? (
        language==="zh" && item.summary ? <p className={`mt-1.5 whitespace-pre-line text-[15px] leading-[1.75] line-clamp-5 lg:mt-2 lg:line-clamp-4 ${read ? "text-ink-4" : "text-ink"}`}>
          <IntentLink viewTransition to={link} onClick={open} className="after:absolute after:inset-0 after:content-['']">
            {item.summary}
          </IntentLink>
        </p> : <p className="mt-2 line-clamp-5 whitespace-pre-line text-[14px] leading-[1.7] text-ink-2">
          <IntentLink viewTransition to={link} onClick={open} className="block hover:text-accent">
            {language==="en" && item.x!.text && !/[\u3400-\u9fff]/u.test(item.x!.text) ? item.x!.text : language==="en" ? "Open this post on X" : "查看原帖"}
          </IntentLink>
        </p>
      ) : (
        <>
          <h3 className={`mt-1.5 line-clamp-2 text-[17px] font-[650] leading-[1.5] lg:mt-2 lg:line-clamp-none lg:leading-[1.55] ${read ? "text-ink-4" : "text-ink"}`}>
            <IntentLink viewTransition to={link} onClick={open} className="after:absolute after:inset-0 after:content-['']">
              {title}
            </IntentLink>
          </h3>
          {english && <p className="mt-1 line-clamp-4 text-[14.5px] leading-[1.7] text-ink-3 lg:mt-2 lg:line-clamp-5 lg:text-[15px] lg:leading-[1.75]">{english.summary}</p>}
          {item.summary && language==="zh" && <p className="mt-1 line-clamp-4 text-[14.5px] leading-[1.7] text-ink-3 lg:mt-2 lg:line-clamp-5 lg:text-[15px] lg:leading-[1.75]">{item.summary}</p>}
        </>
      )}

      {originalUrl && (
        <div className="relative z-10 mt-2 flex items-center gap-2 text-[12.5px] leading-relaxed">
          <a href={originalUrl} target="_blank" rel="noopener noreferrer" data-analytics-event="source_open"
            aria-label={language==="en"? "Read original publisher report":`阅读${item.source.name}原始报道（新标签页）`}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 font-medium text-accent transition-colors hover:border-accent hover:bg-bg-sunk">
            {language==="en"?(isX?"View original post":"Read source"):(isX ? "查看原帖" : "阅读原文")} <IconExternal size={13} />
          </a>
          {!isX && <span className="truncate text-ink-4">{language==="en" ? (host ?? "Publisher") : `来源：${item.source.name}`}</span>}
          {language==="en" && group && group.additionalSourceCount > 0 && (
            <span className="lr-group-pill">+{group.additionalSourceCount} {group.additionalSourceCount === 1 ? "more outlet" : "more outlets"}</span>
          )}
        </div>
      )}

      {isX && item.x!.media.length > 0 && <MediaThumbs media={item.x!.media} className="mt-2.5" />}
      {isX && language==="zh" && item.x!.quoted?.text && <QuotedLine quoted={item.x!.quoted} />}

      {language==="zh" && (tags.length > 0 || (showTags && item.category)) && (
        <div className="relative z-10 mt-2 hidden flex-wrap gap-x-2.5 gap-y-1 text-[12px] text-ink-4 lg:flex">
          {showTags && item.category && (
            <Link to={`/all?category=${item.category}`} className="hover:text-accent">
              {CATEGORY_LABELS[item.category]}
            </Link>
          )}
          {tags.map((t) => (
            <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="hover:text-accent">
              #{t}
            </Link>
          ))}
        </div>
      )}

      {language==="zh" && item.sameEvent && (
        <p className="relative z-10 mt-2 line-clamp-1 text-[12.5px] text-ink-4">
          同一新闻，精选展示
          <Link viewTransition to={`/items/${item.sameEvent.id}`} className="text-ink-3 transition-colors hover:text-accent">
            《{item.sameEvent.title}》
          </Link>
        </p>
      )}
      {language==="zh" && group && showSources && (
        <div className="mt-2 hidden lg:block">
          <GroupSources group={group} filters={filters} parentId={item.id} />
        </div>
      )}

      {item.reason && language==="zh" && (
        <div className="lr-reason mt-1.5 lg:mt-3">
          <p className="line-clamp-2 lg:line-clamp-none"><b>{ITEM_COPY.reasonLabel}</b>{item.reason}</p>
        </div>
      )}

      {/* Phones: duplicate reports open in a sheet. */}
      {language==="zh" && group && showSources && <GroupButton group={group} filters={filters} parentId={item.id} />}
    </article>
  );
});
