import { useEffect, useState } from "react";
import { SITE } from "@aihot/site";
import { Link, useRevalidator } from "react-router";
import type { Route } from "./+types/runs";
import type { AdminFlowItem, AdminRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { toast } from "../../features/admin/toast";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Field, ReasonDialog, Select, Time } from "../../features/admin/ui";

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminRuns>(request, "/api/admin/runs");
}
export const meta: Route.MetaFunction = () => [{ title: "运行 · " + SITE.name + " 后台" }];

type QueueState = AdminFlowItem["status"];
const statuses: Array<{ key: QueueState; label: string }> = [
  { key: "pending", label: "待处理" },
  { key: "processing", label: "正在处理" },
  { key: "failed", label: "处理失败" },
];
const names: Record<string, string> = {
  "content.analyze": "新闻统一分析",
  "content.extract-body": "正文提取",
  "events.group": "事件归组",
  "events.digest": "事件综述",
  "sources.fetch": "信源采集",
  "sources.fetch-x": "X 信源采集",
  "sources.mp": "公众号采集",
  "media.prepare": "图片准备",
  "notify.selected": "精选内容通知",
  "publication.republish-source": "来源重新发布",
  "cron.content.sweep": "新闻补入队列",
  "cron.content.english": "英文内容补写",
  "cron.knowledge.graphiti.ingest": "Graphiti 知识入库",
  "cron.reports.compose": "日报与报告生成",
  "cron.hot.rank": "热点排行",
  "cron.hot.snapshot": "热点快照",
  "cron.stories.links": "关联事件",
  "cron.ops.recover": "任务恢复",
  "cron.sources.schedule": "信源调度",
  "english_copy": "新闻英文标题与摘要",
  "english_digest": "事件英文综述",
  "group_article": "事件归组 · 模型请求",
  "group_review": "事件归组复核 · 模型请求",
  "analyze_article": "新闻统一分析 · 模型请求",
  "understand_article": "新闻分析 · 模型请求",
  "story_digest": "事件综述 · 模型请求",
  "graphiti_chat": "Graphiti 知识抽取 · 模型请求",
  "graphiti_embedding": "Graphiti 向量生成 · 模型请求",
  "report_daily": "日报生成 · 模型请求",
  "report_weekly": "周报生成 · 模型请求",
  "report_monthly": "月报生成 · 模型请求",
};
const labelOf = (process: string) => names[process] ?? process;
const kindNames: Record<AdminFlowItem["kind"], string> = {
  article: "新闻", job: "Worker", schedule: "定时任务",
  model: "模型调用", source: "采集信源", delivery: "消息投递",
};


const concise = (value: string, limit = 78) => value.length > limit ? value.slice(0, limit - 1) + "…" : value;
const originalState = (item: AdminFlowItem) => {
  const raw = item.originState ?? (item.kind === "model" ? null : item.status);
  if (raw === null) return "原任务未关联";
  return ({
    new: "待处理", pending: "待处理", created: "待处理", retry: "等待重试",
    active: "处理中", processing: "处理中", failed: "失败",
    analyzed: "新闻分析已完成", complete: "已完成", completed: "已完成", written: "已完成",
    unknown: "失败（结果未知）", blocked: "预筛已拦截", failing: "失败",
  } as Record<string, string>)[raw] ?? raw;
};
const replayIdentity = (item: AdminFlowItem): string | null => {
  if (["completed", "complete", "written", "analyzed", "active", "processing"].includes(item.originState ?? "")) return null;
  if ((item.kind === "article" || item.kind === "model") && item.replayStep && item.replayTargetId)
    return item.replayStep + ":" + item.replayTargetId;
  if (item.kind === "job" && item.jobId) return "job:" + item.jobId;
  if (item.kind === "schedule") return "schedule:" + item.process;
  if (item.kind === "source") return "source:" + item.key;
  return null;
};

export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const r = loaderData;
  const { run, pending } = useAdminAction();
  const [state, setState] = useState<QueueState>("failed");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [deliveryId, setDeliveryId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "drop" | "resend">("sent");


  // One revalidation refreshes this page and the navigation badges together, so the 处理失败
  // total and the 运行与积压 badge never drift apart after a refresh.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") revalidator.revalidate();
    }, 20_000);
    return () => clearInterval(interval);
  }, [revalidator]);

  const allItems = r.flowItems;
  const scoped = (allItems ?? []).filter(item => kind === "all" || item.kind === kind);
  const counts = Object.fromEntries(statuses.map(status => [
    status.key, scoped.filter(item => item.status === status.key).length,
  ])) as Record<QueueState, number>;
  const items = scoped.filter(item => item.status === state);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const activePage = Math.min(page, pageCount - 1);
  const shown = items.slice(activePage * pageSize, (activePage + 1) * pageSize);
  const worker = r.processes.find(p => p.role === "worker");
  const replayableShown = state === "failed" ? shown.filter(item => replayIdentity(item) !== null) : [];
  const selectedVisible = items.filter(item => selected.has(item.key) && replayIdentity(item) !== null);
  const pageAllSelected = replayableShown.length > 0 && replayableShown.every(item => selected.has(item.key));

  function selectPage() {
    setSelected(current => {
      const next = new Set(current);
      replayableShown.forEach(item => pageAllSelected ? next.delete(item.key) : next.add(item.key));
      return next;
    });
  }

  function toggleSelected(key: string, checked: boolean) {
    setSelected(current => {
      const next = new Set(current);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  }

  async function replay(item: AdminFlowItem, quiet = false): Promise<boolean> {
    let path: string;
    let body: unknown = {};
    if ((item.kind === "article" || item.kind === "model") && item.replayStep && item.replayTargetId) {
      path = item.replayStep === "storyEnglish"
        ? "/api/admin/stories/" + encodeURIComponent(item.replayTargetId) + "/rerun-english"
        : "/api/admin/content/" + encodeURIComponent(item.replayTargetId) + "/rerun";
      if (item.replayStep !== "storyEnglish") body = { step: item.replayStep };
    } else if (item.kind === "job" && item.jobId) {
      path = "/api/admin/jobs/" + encodeURIComponent(item.jobId) + "/retry";
    } else if (item.kind === "schedule") {
      path = "/api/admin/schedules/" + encodeURIComponent(item.process.replace(/^cron\./, "")) + "/retry";
    } else if (item.kind === "source") {
      path = "/api/admin/sources/" + encodeURIComponent(item.key.slice("source:".length)) + "/fetch";
    } else return false;
    const result = await run<{ requeued?: number; jobId?: string | null }>("POST", path, body,
      { label: "replay:" + (replayIdentity(item) ?? item.key), revalidate: !quiet, quietError: quiet });
    if (result !== null && !quiet) toast("已提交原流程任务", "ok");
    return result !== null;
  }

  async function replaySelected() {
    if (bulkRunning || pending !== null) return;
    setBulkRunning(true);
    const targets = new Set<string>();
    let succeeded = 0, failed = 0;
    try {
      for (const item of items.filter(item => selected.has(item.key))) {
        const identity = replayIdentity(item);
        if (!identity || targets.has(identity)) continue;
        targets.add(identity);
        if (await replay(item, true)) succeeded++;
        else failed++;
      }
      toast("恢复完成：成功 " + succeeded + "，失败 " + failed, failed ? "error" : "ok");
      setSelected(new Set());
      revalidator.revalidate();
    } finally { setBulkRunning(false); }
  }

  const action = (item: AdminFlowItem) => {
    if (item.status !== "failed") {
      return item.articleId ? <Link className="text-accent" to={"/admin/content/" + encodeURIComponent(item.articleId)}>查看新闻</Link> : null;
    }
    if (replayIdentity(item)) {
      return <Button size="sm" disabled={pending !== null || bulkRunning}
        onClick={() => void replay(item)}>重新执行该流程</Button>;
    }
    if (item.kind === "model")
      return <span className="text-[12px] text-ink-3" title={item.rawSubject ?? item.subject}>原任务无法定位，不能安全重放</span>;
    if (item.kind === "delivery") {
      const id = Number(item.key.slice("delivery:".length));
      return Number.isSafeInteger(id) && id > 0
        ? <Button size="sm" disabled={pending !== null} onClick={() => setDeliveryId(id)}>处理投递</Button>
        : <span className="text-[12px] text-ink-3">投递 ID 无效</span>;
    }
    return <span className="text-[12px] text-ink-3">无可重放任务</span>;
  };

  return (
    <AdminPage title="运行与积压" subtitle={<>UTC 今日实时执行记录 · 每 20 秒刷新 · {bj(r.checkedAt)} · <Badge tone={worker?.alive ? "ok" : "bad"}>{worker?.alive ? "Worker 在线" : "Worker 未确认在线"}</Badge></>}>
      {r.previewRuntime && <p role="status" className="mb-3 rounded-control border border-line bg-bg-sunk p-3 text-xs leading-relaxed text-ink-3">
        开发预览仅更新 Web/API（{concise(r.previewRuntime.apiRelease, 12)}），任务由共享数据库上的 Worker
        （{r.previewRuntime.workerRelease ? concise(r.previewRuntime.workerRelease, 12) : "版本未知"}）执行。
        {r.previewRuntime.workerRelease !== r.previewRuntime.apiRelease
          ? " 当前版本不一致：点击重试只会入队，不能保证执行端使用新版自动路由与定向英文重试。"
          : " 任务能否恢复以实际 Worker 回执为准。"}
        <Link className="ml-2 text-accent" to="/admin/model-bindings">查看工作流模型绑定</Link>
      </p>}
      <Card title="所有流程 · 三个实时状态" right={<Button size="sm" onClick={() => revalidator.revalidate()}>刷新</Button>}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-ink-3">按原执行流程计数，与新闻篇数不同；同一任务的模型失败只展示一次</span>
          <Select value={kind} aria-label="流程类型" onChange={e => { setKind(e.target.value); setPage(0); setSelected(new Set()); }}>
            <option value="all">全部流程</option>
            <option value="article">新闻处理</option>
            <option value="model">模型调用</option>
            <option value="job">Worker 任务</option>
            <option value="schedule">定时任务</option>
            <option value="source">采集信源</option>
            <option value="delivery">消息投递</option>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {statuses.map(item => <button key={item.key} type="button" aria-pressed={state === item.key}
            onClick={() => { setState(item.key); setPage(0); setSelected(new Set()); }}
            className={"rounded-control border p-3 text-left transition-colors " + (state === item.key ? "border-accent bg-accent-soft" : "border-line bg-bg-sunk")}>
            <span className="block text-[12px] text-ink-3">{item.label}</span>
            <strong className="mt-1 block text-2xl tabular-nums text-ink">{allItems ? num(counts[item.key]) : "—"}</strong>
          </button>)}
        </div>
      </Card>

      <Card title={statuses.find(item => item.key === state)?.label + " · 全流程明细"}
        right={<span className="text-[12px] text-ink-3">{num(items.length)} 项 · 第 {activePage + 1}/{pageCount} 页</span>}
        pad={false} scrollable>
        {allItems === undefined
          ? <p className="p-4 text-sm text-ink-3">当前 API 未提供全流程数据，请确认 API 与 Web 已部署同一版本。</p>
          : <>
            {state === "failed" && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <Button size="sm" disabled={replayableShown.length === 0 || bulkRunning || pending !== null}
                onClick={selectPage}>{pageAllSelected ? "取消本页选择" : "选择本页可重试项"}</Button>
              <Button size="sm" tone="primary" disabled={selectedVisible.length === 0 || bulkRunning || pending !== null}
                busy={bulkRunning} onClick={() => void replaySelected()}>
                重新执行选中流程（{selectedVisible.length}）
              </Button>
              <span className="text-[11px] text-ink-4">每页最多 20 项；按原任务去重，逐条反馈结果</span>
            </div>}
            <DataTable dense scrollable rows={shown} rowKey={item => item.key} empty="当前没有对应执行项" columns={[
              { key: "select", label: "选择", className: "w-10", render: item =>
                item.status === "failed" && replayIdentity(item)
                  ? <input type="checkbox" className="size-4 accent-accent" aria-label={"选择 " + labelOf(item.process) + " " + item.subject}
                      checked={selected.has(item.key)} disabled={bulkRunning || pending !== null}
                      onChange={e => toggleSelected(item.key, e.target.checked)} />
                  : null },
              { key: "action", label: "操作", className: "min-w-[125px]", render: action },
              { key: "subject", label: "新闻 / 任务", render: item =>
                <div>
                  {item.articleId
                    ? <Link className="text-accent" to={"/admin/content/" + encodeURIComponent(item.articleId)}>{concise(item.subject, 70)}</Link>
                    : item.kind === "source" ? <Link className="text-accent" to={"/admin/sources/" + encodeURIComponent(item.key.slice(7))}>{item.subject}</Link>
                      : <span className="text-ink" title={item.subject}>{concise(item.subject, 70)}</span>}
                  <div className="text-[11px] text-ink-4">{kindNames[item.kind]}</div>
                </div> },
              { key: "origin", label: "原任务当前状态", render: item =>
                <span className="whitespace-nowrap text-[12px]" title={item.originState ?? ""}>{originalState(item)}</span> },
              { key: "process", label: "出错 / 当前流程", render: item =>
                <div className="min-w-[120px]"><span>{labelOf(item.process)}</span>
                  <div className="font-mono text-[11px] text-ink-4">{item.process}</div>
                </div> },
              { key: "model", label: "模型 / 服务", render: item =>
                <span className="block max-w-[180px] break-all text-[12px] text-ink-3" title={[item.provider, item.model].filter(Boolean).join(" / ")}>{concise([item.provider, item.model].filter(Boolean).join(" / ") || "—", 68)}</span> },
              { key: "error", label: state === "failed" ? "具体错误" : "任务 / 上次错误", render: item =>
                <div className="max-w-[260px] min-w-[140px] break-all text-[12px] text-ink-3">
                  <span className="line-clamp-2" title={item.error ?? ""}>
                    {item.error || (state === "failed" ? "该流程未记录错误内容" : "等待执行或模型响应")}
                  </span>
                  {(item.error?.length ?? 0) > 120 && <details className="mt-1">
                    <summary className="cursor-pointer text-accent">查看完整错误</summary>
                    <p className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all">{item.error}</p>
                  </details>}
                  {item.retryAt && state === "pending" && <div>重试时间 <Time at={item.retryAt} /></div>}
                </div> },
              { key: "at", label: "时间", render: item => <Time at={item.at} /> },
            ]} />
          </>}
        {pageCount > 1 && <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
          <Button size="sm" disabled={activePage === 0} onClick={() => { setPage(p => Math.max(0, p - 1)); setSelected(new Set()); }}>上一页</Button>
          <span className="text-[12px] text-ink-3">{activePage + 1} / {pageCount}</span>
          <Button size="sm" disabled={activePage >= pageCount - 1} onClick={() => { setPage(p => p + 1); setSelected(new Set()); }}>下一页</Button>
        </div>}
      </Card>
      <p className="mt-3 text-[12px] text-ink-3">
        新闻、Worker、定时任务和模型调用分别保留真实状态，失败的模型请求不自动等同于整篇新闻失败。
        已成功恢复的任务与模型请求不会继续留在失败列表；尚无错误日志的条目明确显示缺失记录。
      </p>

      <ReasonDialog open={deliveryId !== null} title={"处理消息投递 #" + (deliveryId ?? "")}
        description="先核实消息是否送达；确认未送达后才选择重新发送。"
        confirmLabel="确认处理" danger={outcome === "resend"} busy={pending === "delivery"}
        onClose={() => setDeliveryId(null)}
        onSubmit={async note => {
          const result = await run("POST", "/api/admin/deliveries/" + deliveryId + "/resolve",
            { outcome, note }, { label: "delivery" });
          if (result !== null) setDeliveryId(null);
          return result !== null;
        }}>
        <Field label="处理结果">
          <Select value={outcome} onChange={e => setOutcome(e.target.value as typeof outcome)}>
            <option value="sent">已送达</option>
            <option value="drop">不再发送</option>
            <option value="resend">尚未送达，重新发送</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
