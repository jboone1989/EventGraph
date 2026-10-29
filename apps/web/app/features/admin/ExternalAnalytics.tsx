import { Card, Stat } from "./ui";

export type Report<T> = { state: "unconfigured" | "ready" | "empty" | "error"; data: T | null; refreshedAt: string | null; message?: string };
type SearchRow = { clicks: number; impressions: number; ctr: number; position: number };
type LandingKind = "news" | "story" | "topic" | "daily" | "other";
const kindLabels: Record<LandingKind, string> = { news: "新闻详情", story: "事件详情", topic: "主题页", daily: "日报/周报/月报", other: "其他页面" };
export type ExternalAnalyticsData = {
  posthog: Report<{
    pageViews: number; sessions: number; events: number;
    daily: Array<{ day: string; pageViews: number; sessions: number }>;
    behaviors: Array<{ name: string; count: number; sessions: number }>;
  }>;
  searchConsole: Report<{
    property: string; startDate: string; endDate: string;
    clicks: number; impressions: number; ctr: number; position: number | null;
    daily: Array<SearchRow & { day: string }>;
    queries: Array<SearchRow & { query: string }>;
    pages: Array<SearchRow & { page: string }>;
    pageTypes: Array<{ kind: LandingKind; pages: number; clicks: number; impressions: number; ctr: number; position: number | null }>;
    opportunities: Array<SearchRow & { page: string }>;
    pageRows: number;
    pagesTruncated: boolean;
  }>;
};
const n = (v: number) => v.toLocaleString("zh-CN");
function ReportStatus({ report }: { report: Report<unknown> }) {
  return <p role="status" className="mb-3 text-[12px] text-ink-3">
    {report.state === "unconfigured" || report.state === "error" ? report.message :
      report.state === "empty" ? "API 已连通，所选时间范围暂未返回数据。" : "已读取平台真实数据。"}
    {report.refreshedAt && ` 更新 ${report.refreshedAt.slice(0, 16).replace("T", " ")} UTC`}
  </p>;
}
export function ExternalAnalytics({ posthog: ph, searchConsole: sc }: ExternalAnalyticsData) {
  return <div className="mb-5 grid gap-5 xl:grid-cols-2">
    <Card title="Google Search Console · 最近 30 个完整日期">
      <ReportStatus report={sc}/>
      {sc.data && <>
        <p className="mb-3 text-[12px] text-ink-3">{sc.data.property} · {sc.data.startDate} — {sc.data.endDate}（太平洋时间，最终数据）</p>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="搜索点击" value={n(sc.data.clicks)}/><Stat label="搜索曝光" value={n(sc.data.impressions)}/>
          <Stat label="点击率 CTR" value={(sc.data.ctr * 100).toFixed(2) + "%"}/>
          <Stat label="平均排名" value={sc.data.position === null ? "—" : sc.data.position.toFixed(1)}/>
        </div>
        <div className="mt-3 space-y-1 text-[12px]">{sc.data.daily.map(r => <div key={r.day} className="flex justify-between"><span>{r.day}</span><span>{n(r.clicks)} 点击 / {n(r.impressions)} 曝光</span></div>)}</div>
        <h3 className="mt-4 text-[13px] font-medium">搜索词 Top 10</h3>
        <div className="space-y-1 text-[12px]">{sc.data.queries.map(r => <div key={r.query} className="flex justify-between gap-3"><span className="min-w-0 truncate">{r.query}</span><span className="shrink-0">{n(r.clicks)} 点击 / {n(r.impressions)} 曝光</span></div>)}</div>
        <h3 className="mt-4 text-[13px] font-medium">搜索落地页 · 按页面类型</h3>
        <p className="mb-2 text-[12px] text-ink-4">下表仅汇总 Google 返回的 {n(sc.data.pageRows)} 条页面记录{sc.data.pagesTruncated ? "（达到 1000 行上限，可能不完整）" : ""}；不是独立查询的全站总量。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-line text-ink-4"><th className="py-2">页面类型</th><th className="py-2 text-right">URL</th><th className="py-2 text-right">曝光</th><th className="py-2 text-right">点击</th><th className="py-2 text-right">CTR</th></tr></thead>
            <tbody>{sc.data.pageTypes.map(r => <tr key={r.kind} className="border-b border-line-soft last:border-0">
              <td className="py-2">{kindLabels[r.kind]}</td><td className="py-2 text-right num">{n(r.pages)}</td>
              <td className="py-2 text-right num">{n(r.impressions)}</td><td className="py-2 text-right num">{n(r.clicks)}</td>
              <td className="py-2 text-right num">{r.impressions ? (r.ctr * 100).toFixed(2) + "%" : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <h3 className="mt-4 text-[13px] font-medium">已有搜索曝光的新闻页（优先检查）</h3>
        <p className="mb-2 text-[12px] text-ink-4">按返回样本中的曝光降序，不代表排名下降或需要自动改标题。</p>
        <div className="space-y-1 text-[12px]">{sc.data.opportunities.length
          ? sc.data.opportunities.map(r => <div key={r.page} className="flex justify-between gap-3">
            <a className="min-w-0 truncate text-accent hover:underline" title={r.page} href={r.page} target="_blank" rel="noopener noreferrer">{r.page}</a>
            <span className="shrink-0 num">{n(r.impressions)} 曝光 / {n(r.clicks)} 点击</span>
          </div>)
          : <p className="text-ink-4">本窗口暂无有曝光的新闻页。</p>}</div>
        <h3 className="mt-4 text-[13px] font-medium">搜索落地页 Top 10（按 Google 返回顺序）</h3>
        <div className="space-y-1 text-[12px]">{sc.data.pages.map(r => <div key={r.page} className="flex justify-between gap-3"><span className="min-w-0 truncate" title={r.page}>{r.page}</span><span className="shrink-0">{n(r.clicks)} 点击 / {n(r.impressions)} 曝光</span></div>)}</div>
        <p className="mt-3 text-[12px] text-ink-4">搜索词受匿名化和排名截断影响，其合计不代表全站总量。新资源首批数据可能仍在处理。</p>
      </>}
      <a className="mt-3 inline-block text-[12px] text-accent" href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer">打开 Search Console ↗</a>
    </Card>
    <Card title="PostHog · 最近 30 天">
      <ReportStatus report={ph}/>
      {ph.data && <>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="页面浏览 PV" value={n(ph.data.pageViews)}/><Stat label="匿名会话" value={n(ph.data.sessions)} hint="按标签页会话 ID 去重，非 UV"/>
          <Stat label="采集事件" value={n(ph.data.events)}/>
        </div>
        <div className="mt-3 space-y-1 text-[12px]">{ph.data.daily.map(r => <div key={r.day} className="flex justify-between"><span>{r.day}</span><span>{n(r.pageViews)} PV / {n(r.sessions)} 会话</span></div>)}</div>
        <h3 className="mt-4 text-[13px] font-medium">关键行为</h3>
        <div className="space-y-1 text-[12px]">{ph.data.behaviors.map(r => <div key={r.name} className="flex justify-between"><span>{r.name}</span><span>{n(r.count)} 次 / {n(r.sessions)} 会话</span></div>)}</div>
      </>}
      <p className="mt-3 text-[12px] text-ink-4">仅当前域名的 EventGraph 事件，开发与生产分开；独立平台口径，不与站内或 Cloudflare PV 相加。</p>
      <a className="mt-3 inline-block text-[12px] text-accent" href="https://us.posthog.com/" target="_blank" rel="noopener noreferrer">打开 PostHog ↗</a>
    </Card>
  </div>;
}
