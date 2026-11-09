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

export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const r = loaderData;
  const { run, pending } = useAdminAction();
  const [state, setState] = useState<QueueState>("failed");
  const [kind, setKind] = useState("all");
  const [page, setPage] = useState(0);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [deliveryId, setDeliveryId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "drop" | "resend">("sent");
  const [billed, setBilled] = useState("false");

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

  async function requeue(item: AdminFlowItem) {
    let path: string;
    let body: unknown = {};
    if (item.kind === "article" && item.process === "事件归组") {
      path = "/api/admin/content/" + encodeURIComponent(item.articleId!) + "/rerun";
      body = { step: "group" };
    } else if (item.kind === "article") {
      path = "/api/admin/processing/requeue";
      body = { articleId: item.articleId, reason: "运行与积压页面单条重试" };
    } else if (item.kind === "job" && item.jobId) {
      path = "/api/admin/jobs/" + encodeURIComponent(item.jobId) + "/retry";
    } else if (item.kind === "schedule") {
      path = "/api/admin/schedules/" + encodeURIComponent(item.process.replace(/^cron\./, "")) + "/retry";
    } else if (item.kind === "source") {
      path = "/api/admin/sources/" + encodeURIComponent(item.key.slice("source:".length)) + "/fetch";
    } else return;
    const result = await run<{ requeued?: number; jobId?: string | null }>("POST", path, body,
      { label: "requeue:" + item.key });
    if (result !== null) toast("已提交重新入队", "ok");
  }

  const action = (item: AdminFlowItem) => {
    if (item.status !== "failed") {
      return item.articleId ? <Link className="text-accent" to={"/admin/content/" + encodeURIComponent(item.articleId)}>查看新闻</Link> : null;
    }
    if (item.receiptStatus === "unknown" && item.receiptId !== null) {
      return <Button size="sm" disabled={pending !== null} onClick={() => setReceiptId(item.receiptId)}>核对回执</Button>;
    }
    if (item.receiptStatus === "pending") return <span className="text-[12px] text-ink-3">等待回执确认</span>;
    if (["article", "job", "schedule", "source"].includes(item.kind)) {
      return <Button size="sm" disabled={pending !== null} onClick={() => void requeue(item)}>重新入队</Button>;
    }
    if (item.kind === "model") return <span className="text-[12px] text-ink-3">由原任务恢复</span>;
    if (item.kind === "delivery") {
      const id = Number(item.key.slice("delivery:".length));
      return Number.isSafeInteger(id) && id > 0
        ? <Button size="sm" disabled={pending !== null} onClick={() => setDeliveryId(id)}>处理投递</Button>
        : <span className="text-[12px] text-ink-3">投递 ID 无效</span>;
    }
    return null;
  };

  return (
    <AdminPage title="运行与积压" subtitle={<>UTC 今日实时执行记录 · 每 20 秒刷新 · {bj(r.checkedAt)} · <Badge tone={worker?.alive ? "ok" : "bad"}>{worker?.alive ? "Worker 在线" : "Worker 未确认在线"}</Badge></>}>
      <Card title="所有流程 · 三个实时状态" right={<Button size="sm" onClick={() => revalidator.revalidate()}>刷新</Button>}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-ink-3">按执行单元计数，与新闻篇数不同；一次新闻的任务和模型请求分别记录</span>
          <Select value={kind} aria-label="流程类型" onChange={e => { setKind(e.target.value); setPage(0); }}>
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
            onClick={() => { setState(item.key); setPage(0); }}
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
          : <DataTable dense scrollable rows={shown} rowKey={item => item.key} empty="当前没有对应执行项" columns={[
              { key: "subject", label: "新闻 / 任务", render: item =>
                <div>
                  {item.articleId
                    ? <Link className="text-accent" to={"/admin/content/" + encodeURIComponent(item.articleId)}>{item.subject}</Link>
                    : item.kind === "source" ? <Link className="text-accent" to={"/admin/sources/" + encodeURIComponent(item.key.slice(7))}>{item.subject}</Link>
                      : <span className="text-ink">{item.subject}</span>}
                  <div className="text-[11px] text-ink-4">{kindNames[item.kind]}</div>
                </div> },
              { key: "process", label: "出错 / 当前流程", render: item =>
                <div className="min-w-[120px]"><span>{labelOf(item.process)}</span>
                  <div className="font-mono text-[11px] text-ink-4">{item.process}</div>
                </div> },
              { key: "model", label: "模型 / 服务", render: item =>
                <span className="break-words text-[12px] text-ink-3">{[item.provider, item.model].filter(Boolean).join(" / ") || "—"}</span> },
              { key: "error", label: state === "failed" ? "具体错误" : "任务 / 上次错误", render: item =>
                <div className="min-w-[170px] text-[12px] text-ink-3">
                  <span className="break-words" title={item.error ?? ""}>
                    {item.error || (state === "failed" ? "该流程未记录错误内容" : "等待执行或模型响应")}
                  </span>
                  {item.retryAt && state === "pending" && <div>重试时间 <Time at={item.retryAt} /></div>}
                </div> },
              { key: "at", label: "时间", render: item => <Time at={item.at} /> },
              { key: "action", label: "操作", align: "right", render: action },
            ]} />}
        {pageCount > 1 && <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
          <Button size="sm" disabled={activePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>上一页</Button>
          <span className="text-[12px] text-ink-3">{activePage + 1} / {pageCount}</span>
          <Button size="sm" disabled={activePage >= pageCount - 1} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>}
      </Card>
      <p className="mt-3 text-[12px] text-ink-3">
        新闻、Worker、定时任务和模型调用分别保留真实状态，失败的模型请求不自动等同于整篇新闻失败。
        已成功恢复的任务与模型请求不会继续留在失败列表；尚无错误日志的条目明确显示缺失记录。
      </p>

      <ReasonDialog open={receiptId !== null} title={"核对模型回执 #" + (receiptId ?? "")}
        description="模型调用结果未知，先核对是否计费；不得盲目重发。"
        confirmLabel="记录并放行" busy={pending === "receipt"} onClose={() => setReceiptId(null)}
        onSubmit={async note => {
          const result = await run("POST", "/api/admin/receipts/" + receiptId + "/release",
            { billed: billed === "true", note }, { label: "receipt" });
          if (result !== null) setReceiptId(null);
          return result !== null;
        }}>
        <Field label="供应商是否计费">
          <Select value={billed} onChange={e => setBilled(e.target.value)}>
            <option value="false">未计费</option>
            <option value="true">已计费（未取回结果）</option>
          </Select>
        </Field>
      </ReasonDialog>
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
