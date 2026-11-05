import { useState } from "react";
import { SITE } from "@aihot/site";
import { Link, useFetcher } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/runs";
import type { AdminDeliveryIssue, AdminReceiptIssue, AdminRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, duration, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Empty, Field, Json, ReasonDialog, Select, Stat, Time } from "../../features/admin/ui";
import { loadParts } from "../../site-modules";


export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminRuns>(request, "/api/admin/runs");
}

export const meta: Route.MetaFunction = () => [{ title: `运行 · ${SITE.name} 后台` }];

const STATE_LABEL: Record<string, string> = { created: "排队", retry: "等待重试", active: "执行中" };

const rate = (success: number, attempts: number) =>
  attempts ? (success * 100 / attempts).toFixed(1) + "%" : "暂无数据";

const PARTS = await loadParts((m) => m.admin?.runs);

export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const refresh = useFetcher<typeof loader>();
  const r = refresh.data ?? loaderData;
  const { run, pending } = useAdminAction();
  const [receipt, setReceipt] = useState<AdminReceiptIssue | null>(null);
  const [billed, setBilled] = useState("false");
  const [delivery, setDelivery] = useState<AdminDeliveryIssue | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "drop" | "resend">("sent");
  // Failure group to put back into processing ("" = failures within the last 24 hours).
  const [requeue, setRequeue] = useState<string | null>(null);
  const [requeueLimit, setRequeueLimit] = useState("5");
  // Keep expanded diagnostics stable while the page auto-refreshes.
  const [expanded, setExpanded] = useState<string[]>([]);
  const showSection = (id: string) => setExpanded(current => current.includes(id) ? current : [...current, id]);
  const toggleSection = (id: string) => setExpanded(current => current.includes(id)
    ? current.filter(item => item !== id) : [...current, id]);

  // Live view: refresh every 20 s while visible.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh.state === "idle" && refresh.load("/admin/runs"), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const backlog = new Map<string, Record<string, { n: number; oldest: string }>>();
  for (const q of r.queues) backlog.set(q.name, { ...(backlog.get(q.name) ?? {}), [q.state]: { n: q.n, oldest: q.oldest } });
  const queued = r.queues.filter((q) => q.state !== "active").reduce((a, q) => a + q.n, 0);
  const active = r.queues.filter((q) => q.state === "active").reduce((a, q) => a + q.n, 0);
  const worker = r.processes.find((p) => p.role === "worker");
  const failing = r.jobs.filter((j) => j.status === "failed");
  const unknownReceipts = r.receipts.unknownTotal;
  const failedQueueJobs = r.failedJobs.reduce((sum, j) => sum + j.failed, 0);
  const legacyUnresolved = r.legacyUnresolved ?? 0;
  // Current article problems are unique by article ID; task history is diagnostics only.
  const attentionCount = Number(!worker?.alive) + Number(r.live24h.stalled > 0) +
    Number(r.live24h.failed > 0) + Number(r.lagging.length > 0) + Number(failing.length > 0) +
    Number(legacyUnresolved > 0);
  const sectionClass = "mb-4 rounded-panel border border-line bg-surface px-4 py-3";
  const summaryClass = "cursor-pointer text-[14px] font-medium text-ink hover:text-accent";

  return (
    <AdminPage title="运行与积压" subtitle={<>先看系统状态与需要处理的问题，展开下方区域查看明细。每 20 秒自动刷新 · 更新于 {bj(r.checkedAt)}</>}>
      <Card className="mb-5" title="新闻处理概览 · 最近 24 小时"
        right={<span className="text-[12px] text-ink-4">按唯一新闻 ID 统计，重试和任务记录不重复计数</span>}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="新发现新闻" value={num(r.live24h.discovered)} hint="按首次发现时间，排除历史回填和信号源" />
          <Stat label="等待处理" value={num(r.live24h.waiting)} hint="包含超时及等待重试的新闻" />
          <Stat label="超时未完成" value={num(r.live24h.stalled)} tone={r.live24h.stalled ? "bad" : "ok"}
            hint="发现已超过 15 分钟，仍未完成分析；包含在等待处理中" />
          <Stat label="处理失败" value={num(r.live24h.failed)} tone={r.live24h.failed ? "bad" : "ok"}
            hint="不同新闻的最终失败状态，不是失败任务次数" />
          <Stat label="执行中任务" value={num(active)} hint="所有队列正在执行的任务数，非新闻篇数" />
        </div>
      </Card>
      <Card className="mb-5" title={attentionCount ? "需要关注 · " + attentionCount + " 类问题" : "需要关注"}>
        {attentionCount === 0
          ? <p className="text-[13px] text-ink-3">最近 24 小时新闻未出现本页跟踪的处理异常；队列历史和模型请求可在下方诊断查看。</p>
          : <div className="space-y-2 text-[13px]">
            {!worker?.alive && <p><Badge tone="bad">Worker 未在线</Badge> 检查服务与心跳。<a href="#runs-diagnostics" onClick={() => showSection("runs-diagnostics")} className="ml-2 text-accent">进程明细</a></p>}
            {r.live24h.stalled > 0 && <p><Badge tone="bad">超时新闻 {num(r.live24h.stalled)}</Badge> 与等待处理重叠，不应相加。<a href="#runs-news" onClick={() => showSection("runs-news")} className="ml-2 text-accent">查看新闻</a></p>}
            {r.live24h.failed > 0 && <p><Badge tone="bad">失败新闻 {num(r.live24h.failed)}</Badge> 按文章去重，失败任务另列。<a href="#runs-issues" onClick={() => showSection("runs-issues")} className="ml-2 text-accent">查看原因</a></p>}
            {r.lagging.length > 0 && <p><Badge tone="warn">信源异常 {num(r.lagging.length)}</Badge> 采集延迟或失败。<a href="#runs-issues" onClick={() => showSection("runs-issues")} className="ml-2 text-accent">信源明细</a></p>}
            {failing.length > 0 && <p><Badge tone="warn">定时任务最近失败 {num(failing.length)}</Badge> 按失败任务类型统计，不等于新闻失败篇数。<a href="#runs-queues" onClick={() => showSection("runs-queues")} className="ml-2 text-accent">查看任务</a></p>}
            {legacyUnresolved > 0 && <p><Badge tone="warn">遗留未完成新闻 {num(legacyUnresolved)}</Badge> 首次发现于 24 小时之前，当前仍等待处理或失败，不计入新新闻。<Link className="ml-2 text-accent" to="/admin/content">查看新闻</Link></p>}
          </div>}
        <p className="mt-3 text-[12px] text-ink-3">侧栏红色数字只统计最近 24 小时超时或失败的独立新闻；更早发现但仍未完成的新闻，以及 Worker、信源和定时任务异常单独提示，不累加到新新闻数。历史重试与失败任务记录只用于诊断。</p>
        <div className="mt-3 flex flex-wrap gap-4 text-[12px]">
          <a className="text-accent hover:underline" href="#runs-news" onClick={() => showSection("runs-news")}>新闻处理</a>
          <a className="text-accent hover:underline" href="#runs-issues" onClick={() => showSection("runs-issues")}>异常与恢复</a>
          <a className="text-accent hover:underline" href="#runs-models" onClick={() => showSection("runs-models")}>模型调用</a>
          <a className="text-accent hover:underline" href="#runs-queues" onClick={() => showSection("runs-queues")}>队列诊断</a>
          <a className="text-accent hover:underline" href="#runs-diagnostics" onClick={() => showSection("runs-diagnostics")}>运行记录</a>
        </div>
      </Card>
      <details id="runs-news" open={expanded.includes("runs-news")} className={sectionClass}>
        <summary className={summaryClass} onClick={event => { event.preventDefault(); toggleSection("runs-news"); }}>
          新闻处理状态 · 最近 24 小时 <span className="ml-2 text-[12px] font-normal text-ink-4">{num(r.live24h.discovered)} 篇新发现</span>
        </summary>
        <div className="mt-4">
          <Card title="单次新闻分析 · 按文章统计"
            right={<span className="text-[11px]">排除回填与信号源 · 最近发现 <Time at={r.live24h.newestAt} /></span>}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <Stat label="新发现" value={num(r.live24h.discovered)} />
              <Stat label="分析完成" value={num(r.live24h.analyzed)} tone="ok" />
              <Stat label="正常过滤" value={num(r.live24h.filtered)} hint="不符合内容标准，并非故障" />
              <Stat label="等待处理" value={num(r.live24h.waiting)} hint="含等待重试及超时新闻" />
              <Stat label="最终失败" value={num(r.live24h.failed)} tone={r.live24h.failed ? "bad" : "ok"} />
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              处理状态互斥；超时 {num(r.live24h.stalled)} 篇是等待处理的子集，已归组 {num(r.live24h.grouped)} 篇是分析完成后的事件状态。
              一次新闻分析的模型请求、重试次数、归组任务都不增加新闻篇数。
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-[12px]">
              <Link className="text-accent" to="/admin/content">查看新闻</Link>
              <Link className="text-accent" to="/admin/models">检查模型</Link>
              <Link className="text-accent" to="/admin/sources">检查信源</Link>
            </div>
          </Card>
        </div>
      </details>
      <details id="runs-issues" open={expanded.includes("runs-issues")} className={sectionClass}>
        <summary className={summaryClass} onClick={event => { event.preventDefault(); toggleSection("runs-issues"); }}>异常与恢复<span className="ml-2 text-[12px] font-normal text-ink-4">{num(r.live24h.failed)} 篇失败新闻 · {num(failedQueueJobs)} 条历史失败任务记录（非新闻数）</span></summary>
        <div className="mt-4">      {r.grouping.waiting > 0 && (
        <Card className="mb-5" title="等待去重确认的精选" right={<span>{num(r.grouping.waiting)} 条等待 · {num(r.grouping.needsAttention)} 条超过 10 分钟</span>} pad={false} scrollable>
          <p className="px-4 py-3 text-[13px] text-ink-3">这些新闻已达到精选条件，确认是否重复后才会进入精选。最多展示等待最久的 30 条。</p>
          <DataTable scrollable dense rows={r.grouping.items} rowKey={(item) => item.articleId} columns={[
            { key: "title", label: "新闻", render: (item) => <Link className="text-accent" to={`/admin/content/${item.articleId}`}>{item.title}</Link> },
            { key: "since", label: "开始等待", render: (item) => <Time at={item.since} /> },
            { key: "recovery", label: "下一步", render: (item) => <Badge tone={item.recovery === "manual" ? "bad" : "warn"}>{item.recovery === "manual" ? "需处理后恢复" : item.recovery === "receipt" ? "等待付费结果自动恢复" : "自动处理中"}</Badge> },
            { key: "error", label: "原因", render: (item) => <span className="line-clamp-2 text-[12px] text-ink-3">{item.receiptId ? `回执 #${item.receiptId} · ` : ""}{item.error ?? "等待身份确认"}</span> },
          ]} />
        </Card>
      )}

      {r.failedJobs.length > 0 && (
        <Card className="mt-5" title="24 小时内失败的任务记录（每次重试可能留记录）" pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={r.failedJobs}
            rowKey={(j) => j.name}
            columns={[
              { key: "n", label: "队列", render: (j) => <span className="font-mono text-[12.5px]">{j.name}</span> },
              { key: "c", label: "失败", align: "right", render: (j) => num(j.failed) },
              { key: "l", label: "最近", render: (j) => <Time at={j.last} /> },
              { key: "o", label: "最近错误", render: (j) => <span className="line-clamp-2 font-mono text-[11.5px] text-ink-3">{j.last_output}</span> },
            ]}
          />
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="模型回执诊断" right={<span>当前未知结果 {num(unknownReceipts)} 条 · 仅显示最近 40 条</span>} pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={r.receipts.issues}
            rowKey={(x) => x.id}
            empty="没有待处理的回执"
            columns={[
              { key: "id", label: "回执", render: (x) => <span className="num">#{x.id}</span> },
              { key: "s", label: "状态", render: (x) => <Badge tone={x.status === "unknown" ? "bad" : "warn"}>{x.status}</Badge> },
              { key: "w", label: "服务", render: (x) => <span className="whitespace-nowrap">{x.service}{x.model ? ` · ${x.model}` : ""}</span> },
              { key: "p", label: "用途", render: (x) => (x.subject && /^[\w-]{10,}$/.test(x.subject) && x.purpose.includes("analy") ? <Link className="text-accent" to={`/admin/content/${x.subject}`}>{x.purpose}</Link> : x.purpose) },
              { key: "e", label: "错误", render: (x) => <span className="line-clamp-2 text-[12px] text-ink-3" title={x.error ?? ""}>{x.error}</span> },
              { key: "a", label: "", render: (x) => (x.status === "unknown" ? <Button size="sm" onClick={() => setReceipt(x)}>核对</Button> : null) },
            ]}
          />
        </Card>
        <Card title="需要核实的投递" pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={r.deliveries}
            rowKey={(d) => d.id}
            empty="没有待核实的投递"
            columns={[
              { key: "t", label: "目标", render: (d) => d.target_key },
              { key: "s", label: "状态", render: (d) => <Badge tone={d.status === "unknown" ? "bad" : "warn"}>{d.status}</Badge> },
              { key: "sub", label: "内容", render: (d) => (d.subject_kind === "selected" ? <Link className="text-accent" to={`/admin/content/${d.subject_id}`}>{d.subject_id}</Link> : `${d.subject_kind} ${d.subject_id}`) },
              { key: "at", label: "时间", render: (d) => <Time at={d.updated_at} /> },
              { key: "a", label: "", render: (d) => <Button size="sm" onClick={() => setDelivery(d)}>处理</Button> },
            ]}
          />
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="延迟或失败的信源" right={<Link className="text-accent" to="/admin/sources?health=failing">全部失败信源</Link>} pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={r.lagging}
            rowKey={(s) => s.id}
            empty="信源都按时采集"
            columns={[
              { key: "n", label: "信源", render: (s) => <Link className="text-ink hover:text-accent" to={`/admin/sources/${encodeURIComponent(s.id)}`}>{s.name}</Link> },
              { key: "h", label: "健康", render: (s) => <Badge tone={s.health === "failing" ? "bad" : s.health === "degraded" ? "warn" : "muted"}>{s.health}</Badge> },
              { key: "ok", label: "上次成功", render: (s) => <Time at={s.last_ok_at} /> },
              { key: "nx", label: "应抓", render: (s) => <Time at={s.next_fetch_at} /> },
              { key: "e", label: "错误", render: (s) => <span className="line-clamp-1 text-[12px] text-ink-3" title={s.last_error ?? ""}>{s.last_error}</span> },
            ]}
          />
        </Card>
        <Card
          title="处理失败（最近 24 小时，按错误归类）"
          right={
            <span className="flex items-center gap-3">
              {r.retrying.count > 0 && <span>等待重试 {num(r.retrying.count)} 条 · 下一次 <Time at={r.retrying.next} /></span>}
              {r.errors.length > 0 && <Button size="sm" onClick={() => setRequeue("")}>分批重新处理</Button>}
            </span>
          }
          pad={false} scrollable
        >
          <DataTable scrollable
            dense
            rows={r.errors}
            rowKey={(e) => e.error}
            empty="没有处理失败"
            columns={[
              { key: "e", label: "错误", render: (e) => <span className="font-mono text-[11.5px] text-ink-2">{e.error}</span> },
              { key: "n", label: "条数", align: "right", render: (e) => num(e.n) },
              { key: "x", label: "示例", render: (e) => <Link className="text-accent" to={`/admin/content/${e.example}`}>查看</Link> },
              { key: "l", label: "最近", render: (e) => <Time at={e.last} /> },
              { key: "a", label: "", align: "right", render: (e) => <Button size="sm" onClick={() => setRequeue(e.error)}>重新处理</Button> },
            ]}
          />
        </Card>
      </div>

</div>
      </details>
      <details id="runs-models" open={expanded.includes("runs-models")} className={sectionClass}>
        <summary className={summaryClass} onClick={event => { event.preventDefault(); toggleSection("runs-models"); }}>模型请求诊断<span className="ml-2 text-[12px] font-normal text-ink-4">{r.routingEffect ? rate(r.routingEffect.successful,r.routingEffect.attempts) : "暂无自动路由数据"} · {num(r.articleProcessing.unavailableModel)} 条模型不可路由</span></summary>
        <div className="mt-4">      {r.routingEffect && (
        <Card className="mb-5" title="智能模型路由效果 · 最近 24 小时"
          right={<Link className="text-[12px] text-accent hover:underline" to="/admin/model-bindings">调整工作流模型</Link>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="自动路由调用" value={num(r.routingEffect.attempts)} hint="真实 live 请求尝试数" />
            <Stat label="模型响应成功率" value={rate(r.routingEffect.successful,r.routingEffect.attempts)}
              tone={r.routingEffect.attempts && r.routingEffect.successful / r.routingEffect.attempts < 0.95 ? "warn" : undefined}
              hint={num(r.routingEffect.successful)+" 次已收到有效 HTTP 响应"} />
            <Stat label="切换后成功" value={num(r.routingEffect.fallbackSuccess)} tone="ok"
              hint="明确拒绝后改用其他模型，并成功返回" />
            <Stat label="明确失败" value={num(r.routingEffect.failed)}
              tone={r.routingEffect.failed ? "warn" : undefined} hint="服务端拒绝或已判定失败" />
            <Stat label="结果未知" value={num(r.routingEffect.unknown)}
              tone={r.routingEffect.unknown ? "bad" : undefined} hint="不自动重发，以免重复调用" />
            <Stat label="模型响应 P95" value={r.routingEffect.p95Ms == null ? "暂无数据" : num(r.routingEffect.p95Ms) + " ms"}
              hint="成功请求的响应耗时" />
          </div>
          <p className="mt-3 text-[12px] text-ink-4">
            只统计最近 24 小时带自动路由标记的请求尝试，不等于新闻篇数；失败后切换模型会产生额外请求。成功率分母包含失败、未知和执行中的请求；
            尚有 {num(r.routingEffect.pending)} 次处理中。模型响应成功不等于新闻内容正确或新闻处理完成。
          </p>
          {r.routingEffect.attempts === 0
            ? <p className="mt-3 text-[13px] text-ink-3">最近 24 小时暂无带自动路由标记的调用。启用自动工作流并实际处理新闻后，这里才会出现数据。</p>
            : <details className="mt-4">
              <summary className="cursor-pointer text-[13px] font-medium">查看厂商与工作流明细</summary>
              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-[12px] font-medium">厂商请求分布</p>
                  <DataTable dense rows={r.routingEffect.providers} rowKey={p=>p.provider} columns={[
                    {key:"provider",label:"厂商",render:p=>p.provider},
                    {key:"attempts",label:"请求",align:"right",render:p=>num(p.attempts)},
                    {key:"success",label:"成功率",align:"right",render:p=>rate(p.successful,p.attempts)},
                    {key:"failed",label:"失败/未知",align:"right",render:p=>num(p.failed+p.unknown)},
                  ]}/>
                </div>
                <div>
                  <p className="mb-2 text-[12px] font-medium">请求路由标记（非独立新闻流程）</p>
                  <DataTable dense rows={r.routingEffect.stages} rowKey={p=>p.stage} columns={[
                    {key:"stage",label:"工作流",render:p=>p.stage},
                    {key:"attempts",label:"请求",align:"right",render:p=>num(p.attempts)},
                    {key:"success",label:"成功率",align:"right",render:p=>rate(p.successful,p.attempts)},
                    {key:"fallback",label:"切换后成功",align:"right",render:p=>num(p.fallbackSuccess)},
                  ]}/>
                </div>
              </div>
            </details>}
        </Card>
      )}

      <p className="text-[12px] text-ink-3">
        最近 24 小时有 {num(r.articleProcessing.unavailableModel)} 篇新闻受模型不可路由影响；已包含在上方等待或失败的新闻中，不额外累加。
      </p>

</div>
      </details>
      <details id="runs-queues" open={expanded.includes("runs-queues")} className={sectionClass}>
        <summary className={summaryClass} onClick={event => { event.preventDefault(); toggleSection("runs-queues"); }}>队列与定时任务 · 技术诊断<span className="ml-2 text-[12px] font-normal text-ink-4">{num(queued)} 条待执行 · {num(failing.length)} 项定时任务最近失败</span></summary>
        <div className="mt-4">      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="队列" pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={[...backlog.entries()]}
            rowKey={([name]) => name}
            empty="队列是空的"
            columns={[
              { key: "n", label: "队列", render: ([name]) => <span className="font-mono text-[12.5px]">{name}</span> },
              ...(["created", "retry", "active"] as const).map((st) => ({
                key: st,
                label: STATE_LABEL[st],
                align: "right" as const,
                render: ([, v]: [string, Record<string, { n: number; oldest: string }>]) => (v[st] ? <span title={`最早 ${bj(v[st]!.oldest, true)}`}>{num(v[st]!.n)}</span> : <span className="text-ink-4">0</span>),
              })),
              { key: "old", label: "最早排队", render: ([, v]) => <Time at={v.created?.oldest ?? v.retry?.oldest ?? null} /> },
            ]}
          />
        </Card>
        <Card title="定时任务" pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={r.jobs}
            rowKey={(j) => j.job}
            columns={[
              { key: "j", label: "任务", render: (j) => <span className="font-mono text-[12.5px]">{j.job}</span> },
              { key: "s", label: "上次", render: (j) => <Badge tone={j.status === "ok" ? "ok" : j.status === "failed" ? "bad" : "muted"} title={j.error ?? undefined}>{j.status ?? "运行中"}</Badge> },
              { key: "at", label: "时间", render: (j) => <Time at={j.started_at} /> },
              { key: "d", label: "耗时", align: "right", render: (j) => duration(j.started_at, j.finished_at) },
              { key: "f", label: "24h 失败", align: "right", render: (j) => (j.failed_24h ? <span className="text-hot">{j.failed_24h}/{j.runs_24h}</span> : `0/${j.runs_24h}`) },
            ]}
          />
        </Card>
      </div>

</div>
      </details>
      <details id="runs-diagnostics" open={expanded.includes("runs-diagnostics")} className={sectionClass}>
        <summary className={summaryClass} onClick={event => { event.preventDefault(); toggleSection("runs-diagnostics"); }}>历史记录与诊断<span className="ml-2 text-[12px] font-normal text-ink-4">{num(r.timeline.length)} 条近期任务 · {num(r.processes.length)} 个进程</span></summary>
        <div className="mt-4">      {PARTS.map(({ name, part: Part }) => (r.modules[name] != null ? <Part key={name} data={r.modules[name]} /> : null))}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="任务时间线" pad={false} scrollable>
          <DataTable scrollable
            dense
            rows={r.timeline}
            rowKey={(t) => t.id}
            columns={[
              { key: "at", label: "开始", render: (t) => <span className="num whitespace-nowrap">{bj(t.started_at)}</span> },
              { key: "j", label: "任务", render: (t) => <span className="font-mono text-[12px]">{t.job}</span> },
              { key: "s", label: "结果", render: (t) => <Badge tone={t.status === "ok" ? "ok" : t.status === "failed" ? "bad" : "muted"} title={t.error ?? undefined}>{t.status ?? "运行中"}</Badge> },
              { key: "d", label: "耗时", align: "right", render: (t) => duration(t.started_at, t.finished_at) },
            ]}
          />
        </Card>
        <Card title="外部上报" pad={false} scrollable>
          {r.ingest.length ? (
            <DataTable scrollable
              dense
              rows={r.ingest}
              rowKey={(e) => `${e.client}-${e.created_at}`}
              columns={[
                { key: "at", label: "时间", render: (e) => <Time at={e.created_at} /> },
                { key: "c", label: "客户端", render: (e) => e.client },
                { key: "k", label: "类型", render: (e) => e.kind },
                { key: "s", label: "结果", render: (e) => <Badge tone={e.status === "ok" ? "ok" : e.status === "error" ? "bad" : "muted"} title={e.error ?? undefined}>{e.status}</Badge> },
                { key: "x", label: "摘要", render: (e) => <Json value={e.summary} label="摘要" /> },
              ]}
            />
          ) : (
            <Empty>还没有外部上报（采集脚本）</Empty>
          )}
        </Card>
      </div>

      {r.processes.length > 0 && (
        <Card className="mt-5" title="进程">
          <ul className="grid gap-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {r.processes.map((p) => (
              <li key={p.role} className="flex items-center gap-2">
                <Dot tone={p.alive ? "ok" : "bad"} />
                <span className="font-medium">{p.role}</span>
                <span className="text-ink-3">{p.host} · pid {p.pid} · {p.release} · 启动于 {bj(p.startedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

</div>
      </details>
      <ReasonDialog
        open={!!receipt}
        title={`核对回执 #${receipt?.id ?? ""}`}
        description="结果未知的请求不会自动重发。先到供应商控制台确认这次请求有没有计费，再放行：放行后下一次处理会重新发起调用。"
        confirmLabel="记录并放行"
        busy={pending === "release"}
        onClose={() => setReceipt(null)}
        onSubmit={async (note) => (await run("POST", `/api/admin/receipts/${receipt!.id}/release`, { billed: billed === "true", note }, { label: "release", success: "已放行" })) !== null}
      >
        <Field label="供应商是否计费">
          <Select value={billed} onChange={(e) => setBilled(e.target.value)}>
            <option value="false">未计费（请求没有被接受）</option>
            <option value="true">已计费（结果没有取回）</option>
          </Select>
        </Field>
      </ReasonDialog>
      <ReasonDialog
        open={requeue !== null}
        title={requeue ? "分批恢复这一类失败" : "分批恢复失败文章"}
        description="默认每次只恢复 5 条，避免在模型能力恢复后一次性重新发出几百次付费调用。需要时可明确选择全部。" 
        confirmLabel="重新处理"
        busy={pending === "requeue"}
        onClose={() => setRequeue(null)}
        onSubmit={async (reason) => (await run("POST", "/api/admin/processing/requeue", { group: requeue || null, reason, ...(requeueLimit === "all" ? {} : { limit: Number(requeueLimit) }) }, { label: "requeue", success: "已重新排队" })) !== null}
      >
        <Field label="本批恢复数量">
          <Select value={requeueLimit} onChange={(e) => setRequeueLimit(e.target.value)}>
            <option value="2">2 条（先验证）</option>
            <option value="5">5 条（默认）</option>
            <option value="20">20 条</option>
            <option value="all">全部（可能产生较多模型费用）</option>
          </Select>
        </Field>
      </ReasonDialog>
      <ReasonDialog
        open={!!delivery}
        title="处理投递"
        description="先到对应飞书群确认有没有收到。确认没收到再重发；开发环境不会真的发出。"
        confirmLabel="确认"
        danger={outcome === "resend"}
        busy={pending === "delivery"}
        onClose={() => setDelivery(null)}
        onSubmit={async (note) => (await run("POST", `/api/admin/deliveries/${delivery!.id}/resolve`, { outcome, note }, { label: "delivery", success: "已处理" })) !== null}
      >
        <Field label="结果">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <option value="sent">群里已收到，标记为已送达</option>
            <option value="drop">不再发送</option>
            <option value="resend">群里没有，重新发送</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
