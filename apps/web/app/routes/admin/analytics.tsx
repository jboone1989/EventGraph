import { Link } from "react-router";
import { SITE } from "@aihot/site";
import type { Route } from "./+types/analytics";
import { adminGet } from "../../lib/admin.server";
import { AdminPage, Card, Stat } from "../../features/admin/ui";

type Report<T> = {
  state: "unconfigured" | "ready" | "empty" | "error";
  data: T | null; refreshedAt: string | null; message?: string;
};
type Overview = {
  periodDays: number; asOf: string;
  ingestion: { total_events: number; last_event_at: string | null };
  summary: { today: number; yesterday: number; seven_days: number; thirty_days: number };
  daily: Array<{ day: string; page_views: number }>;
  pageTypes: Array<{ page_type: string; page_views: number }>;
  content: Array<{ page_type: string; content_id: string; count: number }>;
  referrers: Array<{ host: string; page_views: number }>;
  cloudflare: Report<{ pageViews: number; daily: Array<{ day: string; pageViews: number }> }>;
  searchConsole: Report<{
    clicks: number; impressions: number; ctr: number; position: number | null;
    startDate: string; endDate: string;
    pageRows: number; pagesTruncated: boolean;
    pageTypes: Array<{ kind: string; pages: number; clicks: number; impressions: number; ctr: number }>;
  }>;
};

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Overview>(request, "/api/admin/analytics");
}
export const meta: Route.MetaFunction = () => [
  { title: "流量与广告 · " + SITE.name + " 后台" }, { name: "robots", content: "noindex" },
];
export const headers: Route.HeadersFunction = () => ({ "Cache-Control": "private, no-store" });

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("zh-CN");
const pageNames: Record<string, string> = {
  home: "首页", all: "全部新闻", item: "新闻详情", story: "事件详情",
  hot: "热门", knowledge: "知识图谱", entity: "实体详情", search: "搜索",
  daily: "日报", weekly: "周报", monthly: "月报", topics: "主题", agent: "Agent", other: "其他",
};
const searchPageNames: Record<string, string> = {
  news: "新闻详情", story: "事件详情", topic: "主题", daily: "日报", other: "其他",
};

export default function AnalyticsAdmin({ loaderData: a }: Route.ComponentProps) {
  const hasData = a.ingestion.total_events > 0;
  const pv = (v: number) => hasData ? n(v) : "—";
  const max = Math.max(1, ...a.daily.map(d => d.page_views));
  const cf = a.cloudflare;
  const sc = a.searchConsole;
  return (
    <AdminPage title="流量与广告" subtitle={"站内页面浏览 · 最近 30 天 · UTC 日期 · 更新于 " + a.asOf.slice(0, 16).replace("T", " ") + " UTC"}>
      <p className="mb-4 text-[13px] text-ink-3">PV 是一次页面打开，不是独立访客，也不是一次广告展示。下方站内 PV 统一来自同一套匿名页面浏览记录，不叠加其他平台数据。</p>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="今日 PV" value={pv(a.summary.today)} hint="UTC 今天 00:00 起"/>
        <Stat label="昨日 PV" value={pv(a.summary.yesterday)} hint="UTC 昨天全天"/>
        <Stat label="近 7 天 PV" value={pv(a.summary.seven_days)} hint="滚动 7 天"/>
        <Stat label="近 30 天 PV" value={pv(a.summary.thirty_days)} hint="滚动 30 天"/>
      </div>
      {!hasData && <p role="status" className="mb-5 text-[13px] text-ink-3">尚未收到站内统计事件，不能把未采集的数据当成 0 PV。</p>}
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card title="每日页面浏览 · 最近 30 天（UTC）">
          {a.daily.length ? <div className="space-y-2" role="list" aria-label="每日页面浏览量">
            {a.daily.map(day => <div key={day.day} role="listitem" className="grid grid-cols-[72px_minmax(0,1fr)_66px] items-center gap-2 text-[12px]">
              <time dateTime={day.day} className="text-ink-3">{day.day.slice(5)}</time>
              <div className="h-3 rounded-full bg-bg-sunk"><div className="h-3 rounded-full bg-accent" style={{width: 100 * day.page_views / max + "%"}}/></div>
              <span className="num text-right text-ink-2">{n(day.page_views)}</span>
            </div>)}
          </div> : <p className="text-[13px] text-ink-4">最近 30 天没有站内页面浏览记录。</p>}
        </Card>
        <Card title="哪些页面类型被打开得最多 · 30 天">
          {a.pageTypes.length ? <div className="space-y-2 text-[13px]">
            {a.pageTypes.map(p => <div key={p.page_type} className="flex justify-between gap-3 border-b border-line-soft pb-2 last:border-0">
              <span className="text-ink-3">{pageNames[p.page_type] ?? p.page_type}</span>
              <span className="num">{n(p.page_views)} PV</span>
            </div>)}
          </div> : <p className="text-[13px] text-ink-4">暂无页面类型数据。</p>}
        </Card>
        <Card title="新闻与事件打开排行 · 30 天">
          <p className="mb-3 text-[12px] text-ink-4">逐个内容的打开次数，来自现有新闻/事件打开事件，不再额外累加到全站 PV。</p>
          {a.content.length ? <div className="space-y-2 text-[13px]">
            {a.content.map(c => <div key={c.page_type + c.content_id} className="flex items-center justify-between gap-3 border-b border-line-soft pb-2 last:border-0">
              <Link className="min-w-0 truncate text-accent hover:underline" to={(c.page_type === "story" ? "/story/" : "/items/") + encodeURIComponent(c.content_id)}>
                {c.page_type === "story" ? "事件" : "新闻"} · {c.content_id}
              </Link>
              <span className="num shrink-0">{n(c.count)} 次</span>
            </div>)}
          </div> : <p className="text-[13px] text-ink-4">暂无新闻或事件打开记录。</p>}
        </Card>
        <Card title="外部访问来源 · 30 天">
          {a.referrers.length ? <div className="space-y-2 text-[13px]">
            {a.referrers.map(r => <div key={r.host} className="flex justify-between gap-3 border-b border-line-soft pb-2 last:border-0">
              <span className="truncate text-ink-3">{r.host}</span>
              <span className="num shrink-0">{n(r.page_views)} PV</span>
            </div>)}
          </div> : <p className="text-[13px] text-ink-4">暂无可识别的外部来源。直接访问或浏览器隐藏来源时不会出现在这里。</p>}
        </Card>
      </div>
      <Card className="mb-5" title="Google AdSense · 广告变现">
        <p className="text-[13px] text-ink-3">尚未接入 AdSense 报表。广告展示次数、预估收入和 Page RPM 暂无真实数据；审核和广告投放启用后应以 Google 官方报表为准。</p>
        <p className="mt-2 text-[12px] text-ink-4">Page RPM = 预估收入 ÷ 页面浏览量 × 1,000。PV 不是广告展示次数，不能据此推算实际收入。</p>
      </Card>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card title="Cloudflare · 近 7 天流量核对">
          {cf.data ? <>
            <Stat label="Cloudflare 页面浏览" value={n(cf.data.pageViews)} hint="独立采集口径 · 不与站内 PV 相加"/>
            <p className="mt-2 text-[12px] text-ink-4">Cloudflare 与站内采集覆盖范围可能不同；此数据仅供核对。</p>
          </> : <p className="text-[13px] text-ink-3">{cf.message ?? "Cloudflare 报表不可用；不显示虚假的 0 PV。"}</p>}
        </Card>
        <Card title="Google 搜索 · 最近 30 个完整日期">
          {sc.data ? <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="搜索点击" value={n(sc.data.clicks)}/>
              <Stat label="搜索曝光" value={n(sc.data.impressions)}/>
              <Stat label="点击率" value={(100 * sc.data.ctr).toFixed(2) + "%"}/>
              <Stat label="平均排名" value={sc.data.position == null ? "—" : sc.data.position.toFixed(1)}/>
            </div>
            <p className="mt-2 text-[12px] text-ink-4">{sc.data.startDate} 至 {sc.data.endDate}（太平洋日期）；搜索点击不是全站 PV。</p>
          </> : <p className="text-[13px] text-ink-3">{sc.message ?? "Search Console 报表不可用；不显示虚假的 0 点击。"}</p>}
          <a className="mt-3 inline-block text-[12px] text-accent" href="https://search.google.com/search-console/" target="_blank" rel="noopener noreferrer">打开 Search Console ↗</a>
        </Card>
      </div>
      {sc.data && <Card title="Google 搜索落地页 · 按类型">
        <p className="mb-3 text-[12px] text-ink-4">仅汇总 Search Console 返回的 {n(sc.data.pageRows)} 条页面记录{sc.data.pagesTruncated ? "（达到行数上限，可能不完整）" : ""}，不等于全站搜索总量。</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-line text-ink-4">
              <th className="py-2">页面类型</th><th className="text-right">页面数</th>
              <th className="text-right">曝光</th><th className="text-right">点击</th>
            </tr></thead>
            <tbody>{sc.data.pageTypes.map(p => <tr key={p.kind} className="border-b border-line-soft last:border-0">
              <td className="py-2">{searchPageNames[p.kind] ?? p.kind}</td>
              <td className="text-right num">{n(p.pages)}</td>
              <td className="text-right num">{n(p.impressions)}</td>
              <td className="text-right num">{n(p.clicks)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>}
      <p className="mt-5 text-[12px] text-ink-4">站内统计不记录管理页面；DNT/GPC、浏览器阻止脚本或网络失败时可能漏计。Cloudflare、站内 PV 与 Google 搜索点击的统计范围和时间窗口不同，不能相加。</p>
    </AdminPage>
  );
}
