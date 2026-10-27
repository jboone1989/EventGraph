// 跨事件过程实验（specs/event-evolution-experiment）：把人工策展的案例按当前公开条件组装成并排的
// 只读轨道。轨道站点复用 publicStoryRoute 的全部公开过滤（撤稿、合并别名、非编辑信源同样处理），
// 因此案例配置只引用 publicId，不复制任何事实内容；联系与不画线说明原样来自编辑标注。
import type { CaseStudyResponse, CaseStudyTrack } from "@aihot/contracts/site";
import type { CaseStudyDef } from "@aihot/site/case-studies";
import { publicStoryRoute } from "./story-route.ts";

export async function publicCaseStudy(def: CaseStudyDef, now = new Date()): Promise<CaseStudyResponse> {
  const tracks: CaseStudyTrack[] = [];
  for (const track of def.tracks) {
    const route = await publicStoryRoute(track.storyPublicId, now);
    tracks.push({
      key: track.key,
      label: track.label,
      labelEn: track.labelEn,
      story: route?.story ?? { publicId: track.storyPublicId, title: "" },
      status: route?.status ?? "insufficient",
      stations: route?.stations ?? [],
      coverage: route?.coverage ?? { stations: 0, reports: 0, sources: 0 },
    });
  }
  // A link whose endpoint lost its public evidence is dropped with the evidence, not shown from config.
  const publicKeys = new Set(tracks.filter((t) => t.status === "ok").map((t) => t.key));
  return {
    schemaVersion: 1,
    id: def.id,
    title: def.title,
    titleEn: def.titleEn,
    summary: def.summary,
    summaryEn: def.summaryEn,
    updated: def.updated,
    generatedAt: now.toISOString(),
    tracks,
    links: def.links.filter((l) => publicKeys.has(l.from) && publicKeys.has(l.to)),
    unlinked: def.unlinked.filter((u) => publicKeys.has(u.track)).map(({ track, note, noteEn }) => ({ track, note, noteEn })),
  };
}
