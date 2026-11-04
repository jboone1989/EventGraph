import { SITE } from "@aihot/site";
import { useEffect } from "react";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/index";
import type { AdminRuns, AdminSources } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Card, Dot, Stat, Time } from "../../features/admin/ui";

type Result<T> = { data: T | null; error: string | null };

async function load<T>(request: Request, endpoint: string): Promise<Result<T>> {
  try {
    return { data: await adminGet<T>(request, endpoint), error: null };
  } catch (error) {
    if (error instanceof Response && error.status >= 300 && error.status < 400) throw error;
    return { data: null, error: "接口暂时不可用" };
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const [runs, sources] = await Promise.all([
    load<AdminRuns>(request, "/api/admin/runs"),
    load<AdminSources>(request, "/api/admin/sources"),
  ]);
  return { runs, sources: { data: sources.data?.totals ?? null, error: sources.error } };
}

export const meta: Route.MetaFunction = () => [{ title: `运营总览 · ${SITE.name} 后台` }];

function Unavailable() {
  return <span className="text-[18px] font-semibold text-amber">未获取</span>;
}

const actionLinks = [
  { to: "/admin/runs", label: "运行与积压", description: "队列、定时任务、回执和错误记录" },
  { to: "/admin/sources?health=failing", label: "异常信源", description: "查看失败的采集源和最近结果" },
  { to: "/admin/models", label: "Provider 与模型", description: "连接状态、能力测试和路由" },
  { to: "/admin/content", label: "内容诊断", description: "按 ID、URL 或标题追踪处理链路" },
];

export default function AdminOverview({ loaderData }: Route.ComponentProps) {
  const refresh = useFetcher<typeof loader>();
  const view = refresh.data ?? loaderData;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && refresh.state === "idle") refresh.load("/admin");
    }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const runs = view.runs.data;
  const sources = view.sources.data;
  const worker = runs?.processes.find(p => p.role === "worker");
  const queued = runs ? runs.queues.filter(q => q.state !== "active").reduce((sum, q) => sum + q.n, 0) : null;
  const failedSchedules = runs?.jobs.filter(j => j.status === "failed");
  const failures: { label: string; to: string }[] = [];
  if (!runs) failures.push({ label: "运行状态未获取，无法判断 Worker 和处理队列是否正常", to: "/admin/runs" });
  else {
    if (!worker || !worker.alive) failures.push({ label: "Worker 心跳缺失或中断", to: "/admin/runs" });
    if (runs.live24h.stalled > 0) failures.push({ label: `${num(runs.live24h.stalled)} 条新新闻等待超过 15 分钟`, to: "/admin/runs" });
    if (runs.live24h.failed > 0) failures.push({ label: `${num(runs.live24h.failed)} 条新新闻处理失败`, to: "/admin/runs" });
    if (runs.articleProcessing.unavailableModel > 0) failures.push({ label: `${num(runs.articleProcessing.unavailableModel)} 条处理受模型不可用影响`, to: "/admin/models" });
    if ((failedSchedules?.length ?? 0) > 0) failures.push({ label: `${num(failedSchedules!.length)} 个定时任务最近一次运行失败`, to: "/admin/runs" });
    if (runs.lagging.length > 0) failures.push({ label: `${num(runs.lagging.length)} 个信源采集异常或延迟`, to: "/admin/sources" });
  }
  if (!sources) failures.push({ label: "信源统计未获取，无法确认采集健康度", to: "/admin/sources" });
  else if (sources.failing > 0) failures.push({ label: `${num(sources.failing)} 个信源持续采集失败`, to: "/admin/sources?health=failing" });

  const hasAll = !!runs && !!sources;
  return (
    <AdminPage title="运营总览" subtitle="EventGraph 无人运营控制台 · 真实运行数据，每 20 秒自动刷新"
      actions={<Link to="/admin/runs" className="rounded-control bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90">查看完整运行记录</Link>}>
      <section className={`mb-5 rounded-panel border px-5 py-5 sm:px-6 ${failures.length ? "border-hot/25 bg-surface" : "border-ok/20 bg-surface"}`} aria-label="运行状态">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`mt-1 rounded-full p-2 ${failures.length ? "bg-hot-soft" : "bg-ok-soft"}`}><Dot tone={failures.length ? "bad" : "ok"} /></div>
            <div>
              <p className="text-[11px] font-semibold tracking-[.12em] text-ink-4">OPERATIONS / STATUS</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-ink sm:text-[25px]">
                {failures.length ? `有 ${failures.length} 类状态需要关注` : "当前已检查的指标未发现异常"}
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-3">
                {runs ? <>更新于 <time dateTime={runs.checkedAt}>{bj(runs.checkedAt, true)}</time> · {worker?.host ?? "Worker 未上报"} · {worker?.alive ? "心跳正常" : "心跳未确认"}</> : "运行数据未获取 · 不能判定系统健康"}
              </p>
            </div>
          </div>
          <Badge tone={hasAll ? "info" : "warn"}>{hasAll ? "实时运行快照" : "部分数据未获取"}</Badge>
        </div>
        {failures.length > 0 && (
          <ul className="mt-4 grid gap-2 border-t border-line pt-4 md:grid-cols-2">
            {failures.map(f => (
              <li key={f.label}>
                <Link to={f.to} className="flex items-start gap-2 rounded-control px-2 py-2 text-[13px] text-ink-2 hover:bg-hot-soft hover:text-hot">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-hot" />{f.label}<span className="ml-auto shrink-0 text-ink-4">查看 ›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-5" aria-labelledby="pipeline-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pipeline-title" className="text-[16px] font-semibold text-ink">最近 24 小时 · 新新闻处理链路</h2>
          <span className="text-[12px] text-ink-4">仅新发现的编辑信源新闻，不含历史回填</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {([
            ["新发现", runs?.live24h.discovered, ""],
            ["已分析", runs?.live24h.analyzed, ""],
            ["已归组", runs?.live24h.grouped, ""],
            ["等待处理", runs?.live24h.waiting, ""],
            ["等待超时", runs?.live24h.stalled, "bad"],
            ["处理失败", runs?.live24h.failed, "bad"],
          ] as const).map(([label, value, kind]) => (
            <Stat key={label} label={label} value={value === undefined ? <Unavailable /> : num(value)}
              tone={value && kind === "bad" ? "bad" : undefined}
              hint={label === "等待超时" ? "超过 15 分钟" : label === "处理失败" ? "最近发现的新闻" : undefined} />
          ))}
        </div>
        <p className="mt-2 text-[12px] text-ink-4">不同处理阶段可能重叠，数值不能相加；正常预筛过滤不计为故障。</p>
      </section>

      <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]" aria-label="系统详情">
        <Card title="系统与积压" right={<Link className="text-accent hover:underline" to="/admin/runs">运行详情</Link>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Worker" value={runs ? <span className="inline-flex items-center gap-2 text-[16px]"><Dot tone={worker?.alive ? "ok" : "bad"} />{worker?.alive ? "运行中" : "未确认"}</span> : <Unavailable />}
              hint={worker ? <>最近心跳 <Time at={worker.at} /></> : "没有心跳数据"} />
            <Stat label="队列积压" value={queued === null ? <Unavailable /> : num(queued)} hint="排队及等待重试" tone={queued !== null && queued > 500 ? "warn" : undefined} />
            <Stat label="失败定时任务" value={failedSchedules ? num(failedSchedules.length) : <Unavailable />}
              tone={failedSchedules?.length ? "bad" : undefined} hint="最近一次运行失败" />
            <Stat label="信源总数" value={sources ? num(sources.total) : <Unavailable />} hint={sources ? `启用 ${num(sources.enabled)}` : "采集统计未获取"} />
            <Stat label="失败信源" value={sources ? num(sources.failing) : <Unavailable />}
              tone={sources?.failing ? "bad" : undefined} hint={sources ? `不稳定 ${num(sources.degraded)}` : "采集统计未获取"} />
            <Stat label="模型不可用阻塞" value={runs ? num(runs.articleProcessing.unavailableModel) : <Unavailable />}
              tone={runs?.articleProcessing.unavailableModel ? "bad" : undefined} hint="累计等待或失败" />
          </div>
          {worker?.release && <p className="mt-4 break-all border-t border-line pt-3 font-mono text-[11px] text-ink-4">Worker 版本：{worker.release}</p>}
        </Card>
        <Card title="最近失败的作业" right={runs && <span className="text-[12px] text-ink-4">最近 24 小时</span>}>
          {!runs ? <p className="text-[13px] text-amber">未获取运行数据</p> :
            runs.failedJobs.length === 0 ? <p className="text-[13px] text-ink-3">未记录最近 24 小时的失败作业。</p> :
            <ul className="divide-y divide-line">
              {runs.failedJobs.slice(0,6).map(j => (
                <li key={j.name} className="py-2.5 first:pt-0">
                  <Link to="/admin/runs" className="flex items-center justify-between gap-3 text-[13px] hover:text-accent">
                    <span className="truncate font-mono text-ink-2">{j.name}</span>
                    <Badge tone="bad">{num(j.failed)} 次</Badge>
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-4">{j.last_output || "未提供错误描述"} · <Time at={j.last} /></p>
                </li>
              ))}
            </ul>}
        </Card>
      </section>

      <section aria-label="诊断入口">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-ink">快速诊断</h2>
          <span className="text-[12px] text-ink-4">问题可追溯到现有明细，不需要人工逐条审批新闻</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionLinks.map(link => (
            <Link key={link.to} to={link.to} className="group rounded-panel bg-surface p-4 ring-1 ring-line transition-colors hover:ring-accent/35">
              <span className="flex items-center justify-between text-[13.5px] font-semibold text-ink group-hover:text-accent">{link.label}<span>↗</span></span>
              <span className="mt-2 block text-[12px] text-ink-3">{link.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </AdminPage>
  );
}
