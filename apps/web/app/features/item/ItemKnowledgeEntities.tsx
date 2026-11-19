import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { ItemKnowledgeEntitiesResponse } from "@aihot/contracts/site";
import { useText, useUiLanguage } from "../../components/LanguageSwitch";
import { englishPath } from "../../lib/edition";

/**
 * "关联知识实体": the knowledge-graph entities this report's own Graphiti episode mentions, each chip
 * leading to the existing entity profile. Loaded after the page (StoryFollowups' IntersectionObserver
 * pattern), so the article never waits on the knowledge graph. While loading — and when the graph is
 * disabled or the current revision has not been ingested — no heading or placeholder appears.
 */
export function ItemKnowledgeEntities({ itemId }: { itemId: string }) {
  const [result, setResult] = useState<ItemKnowledgeEntitiesResponse | null>(null);
  const [attempt, setAttempt] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const t = useText();
  const en = useUiLanguage() === "en";
  useEffect(() => {
    const controller = new AbortController();
    let started = false;
    setResult(null);
    const load = () => {
      if (started) return;
      started = true;
      fetch(`/api/site/knowledge/items/${encodeURIComponent(itemId)}/entities`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: ItemKnowledgeEntitiesResponse | null) => {
          // A missing answer (404, network) leaves the block away; it never becomes "no entities".
          if (body && !controller.signal.aborted) setResult(body);
        }).catch(() => {});
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: "500px" });
    if (observer && anchor.current) observer.observe(anchor.current);
    else load();
    return () => { observer?.disconnect(); controller.abort(); };
  }, [itemId, attempt]);
  // The anchor div stays mounted; only the response decides whether a block appears inside it.
  return <div ref={anchor}>
    {result && result.status !== "disabled" && result.status !== "not_ingested" && (
      <section className="mt-7 rounded-panel border border-line-soft bg-bg-sunk/40 p-4 xl:mt-8">
        <span className="text-[12px] font-semibold text-accent">{t("关联知识实体", "Related entities")}</span>
        {result.status === "ok" ? (
          <>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {result.entities.map((entity) => (
                <Link
                  viewTransition
                  key={entity.key}
                  to={(en ? englishPath(`/knowledge/entity/${encodeURIComponent(entity.key)}`) : null) ?? `/knowledge/entity/${encodeURIComponent(entity.key)}`}
                  className="chip h-auto max-w-full items-start py-[3px] text-left leading-snug"
                >
                  <span className="min-w-0 break-words">{entity.name}</span>
                </Link>
              ))}
            </div>
            {result.truncated && (
              <p className="mt-2 text-[12px] text-ink-4">
                {t(`另有 ${result.totalCount - result.entities.length} 个实体未展示`,
                  `${result.totalCount - result.entities.length} more ${result.totalCount - result.entities.length === 1 ? "entity" : "entities"} not shown`)}
              </p>
            )}
          </>
        ) : result.status === "unavailable" ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span>{t("知识图谱暂不可用", "Knowledge graph temporarily unavailable")}</span>
            <button type="button" onClick={() => setAttempt(attempt + 1)} className="font-medium text-accent hover:underline">
              {t("重试", "Retry")}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            {t("暂无关联知识实体", "No related knowledge entities")}
          </p>
        )}
      </section>
    )}
  </div>;
}
