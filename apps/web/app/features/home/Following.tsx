import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { useFollows, type LocalFollow } from "../../lib/local-state";
import { DayList } from "../feed/DayList";
import { EmptyState } from "../../components/ui/Page";
import { enTopic } from "../../lib/english";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";

interface FollowingResponse {
  items: Array<FeedItemSummary & { via: string[] }>;
  follows: { topics: Array<{ slug: string; name: string }>; entities: Array<{ key: string; name: string }> };
}

const hasHan = (s: string) => /[㐀-鿿]/u.test(s);
const href = (f: LocalFollow) => (f.kind === "topic" ? `/topics/${f.key}` : `/knowledge/entity/${encodeURIComponent(f.key)}`);

/** The home feed narrowed to the topics and entities this browser follows. */
export function FollowingFeed() {
  const follows = useFollows();
  const t = useText();
  const lang = useUiLanguage();
  const [data, setData] = useState<FollowingResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const query = new URLSearchParams({
    topics: follows.filter((f) => f.kind === "topic").map((f) => f.key).join(","),
    entities: follows.filter((f) => f.kind === "entity").map((f) => f.key).join(","),
  }).toString();
  useEffect(() => {
    if (follows.length === 0) return;
    const controller = new AbortController();
    setFailed(false);
    fetch(`/api/site/following?${query}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<FollowingResponse>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [query]);

  // Current names from the site; the stored name until it answers.
  const nameOf = (f: LocalFollow) => {
    const name = (f.kind === "topic" ? data?.follows.topics.find((x) => x.slug === f.key)?.name : data?.follows.entities.find((x) => x.key === f.key)?.name) ?? f.name;
    if (lang !== "en") return name;
    return f.kind === "topic" ? enTopic({ slug: f.key, name }) : hasHan(name) ? `Entity ${f.key.slice(0, 8)}` : name;
  };
  const count = (name: string) => data?.items.filter((i) => i.via.includes(name)).length ?? 0;

  if (follows.length === 0) {
    return (
      <div className="lg:card">
        <EmptyState title={t("还没有关注任何主题或实体", "You aren’t following anything yet")}
          action={<div className="flex flex-wrap justify-center gap-4"><Link to="/topics" className="lr-inline-link">{t("浏览主题", "Browse topics")}</Link><Link to="/knowledge" className="lr-inline-link">{t("打开知识网络", "Open the knowledge graph")}</Link></div>}>
          {t("在主题页或实体档案页点“关注”，这里就只显示它们的报道。关注列表只存在这台设备上，不需要注册。", "Tap Follow on a topic or entity profile and this view shows only their reports. Your list stays on this device; no account needed.")}
        </EmptyState>
      </div>
    );
  }
  return (
    <div>
      <div className="lr-follow-chips">
        {follows.map((f) => {
          const name = nameOf(f);
          const stored = f.kind === "topic" ? data?.follows.topics.find((x) => x.slug === f.key)?.name : data?.follows.entities.find((x) => x.key === f.key)?.name;
          return <Link key={`${f.kind}:${f.key}`} to={href(f)}>{name}{data && <small>{count(stored ?? f.name)}</small>}</Link>;
        })}
      </div>
      {failed ? (
        <div className="lg:card"><EmptyState title={t("暂时读不到关注的内容", "Couldn’t load your follows")}>{t("稍后再试。", "Please try again shortly.")}</EmptyState></div>
      ) : !data ? (
        <p className="py-10 text-center text-[13px] text-ink-4">{t("正在读取关注的内容…", "Loading your follows…")}</p>
      ) : data.items.length === 0 ? (
        <div className="lg:card"><EmptyState title={t("关注的主题和实体最近没有新报道", "Nothing new from what you follow")} /></div>
      ) : (
        <DayList items={data.items} />
      )}
    </div>
  );
}
