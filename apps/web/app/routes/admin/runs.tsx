import { useEffect, useState } from "react";
import { SITE } from "@aihot/site";
import { Link, useFetcher } from "react-router";
import type { Route } from "./+types/runs";
import type { AdminRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { toast } from "../../features/admin/toast";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Field, ReasonDialog, Select, Time } from "../../features/admin/ui";

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminRuns>(request, "/api/admin/runs");
}
export const meta: Route.MetaFunction = () => [{ title: "运行 · " + SITE.name + " 后台" }];

type QueueState = "pending" | "processing" | "failed";
type QueueItem = NonNullable<AdminRuns["currentNewsItems"]>[number];
const statuses: Array<{ key: QueueState; label: string }> = [
  { key: "pending", label: "待处理" },
  { key: "processing", label: "正在处理" },
  { key: "failed", label: "处理失败" },
];

export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const refresh = useFetcher<typeof loader>();
  const r = refresh.data ?? loaderData;
  const { run, pending } = useAdminAction();
  const [state, setState] = useState<QueueState>("failed");
  const [page, setPage] = useState(0);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const [billed, setBilled] = useState("false");

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && refresh.state === "idle") refresh.load("/admin/runs");
    }, 20_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const items = (r.currentNewsItems ?? []).filter(item => item.status === state);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const activePage = Math.min(page, pageCount - 1);
  const shown = items.slice(activePage * pageSize, (activePage + 1) * pageSize);
  const worker = r.processes.find(p => p.role === "worker");

  async function retryOne(item: QueueItem) {
    if (item.stage === "事件归组") {
      const result = await run<{ jobId: string | null }>("POST",
        "/api/admin/content/" + encodeURIComponent(item.id) + "/rerun",
        { step: "group" }, { label: "retry-group:" + item.id, revalidate: false });
      if (result?.jobId) {
        toast("已加入待处理队列", "ok");
        refresh.load("/admin/runs");
      }
      return;
    }
    const result = await run<{ requeued: number }>("POST", "/api/admin/processing/requeue",
      { articleId: item.id, reason: "运行与积压页面单条重试" },
      { label: "retry:" + item.id, revalidate: false });
    if (result?.requeued === 1) {
      toast("已加入待处理队列", "ok");
      refresh.load("/admin/runs");
    }
  }

  return (
    <AdminPage title="运行与积压" subtitle={<>UTC 今日 · 每 20 秒自动刷新 · {bj(r.checkedAt)} · <Badge tone={worker?.alive ? "ok" : "bad"}>{worker?.alive ? "Worker 在线" : "Worker 未确认在线"}</Badge></>}>
      <Card title="新闻处理 · 三个实时队列" right={<Button size="sm" onClick={() => refresh.load("/admin/runs")}>刷新</Button>}>
        <div className="grid grid-cols-3 gap-2">
          {statuses.map(item => <button key={item.key} type="button" aria-pressed={state === item.key}
            onClick={() => { setState(item.key); setPage(0); }}
            className={"rounded-control border p-3 text-left transition-colors " + (state === item.key ? "border-accent bg-accent-soft" : "border-line bg-bg-sunk")}>
            <span className="block text-[12px] text-ink-3">{item.label}</span>
            <strong className="mt-1 block text-2xl tabular-nums text-ink">{num(r.currentNews[item.key])}</strong>
          </button>)}
        </div>
      </Card>

      <Card title={statuses.find(item => item.key === state)?.label + " · 新闻明细"}
        right={<span className="text-[12px] text-ink-3">{num(items.length)} 篇 · 第 {activePage + 1}/{pageCount} 页</span>}
        pad={false} scrollable>
        {r.currentNewsItems === undefined
          ? <p className="p-4 text-sm text-ink-3">当前 API 尚未提供逐篇任务状态，请核对 API 和 Web 是否已部署到同一版本。</p>
          : <DataTable dense scrollable rows={shown} rowKey={item => item.id} empty="这个队列当前没有新闻" columns={[
              { key: "title", label: "新闻", render: item => <Link className="text-accent" to={"/admin/content/" + item.id}>{item.title}</Link> },
              { key: "stage", label: "当前流程", render: item => <span className="whitespace-nowrap">{item.stage}</span> },
              { key: "why", label: state === "failed" ? "失败原因" : "当前任务 / 上次错误", render: item =>
                <div className="min-w-[150px] text-[12px] text-ink-3">
                  {item.error ? <span className="break-words" title={item.error}>{item.error}</span>
                    : item.jobName ? item.jobName + " · " + (item.jobState ?? "等待调度") : "尚无任务日志"}
                  {item.retryAt && state === "pending" && <div>下次重试 <Time at={item.retryAt} /></div>}
                </div> },
              { key: "at", label: "排队 / 执行时间", render: item =>
                <Time at={item.startedAt ?? item.queuedAt ?? item.discoveredAt} /> },
              { key: "action", label: "操作", align: "right", render: item => item.status === "failed"
                ? item.unverifiedReceiptId !== null
                  ? item.receiptStatus === "unknown"
                    ? <Button size="sm" onClick={() => setReceiptId(item.unverifiedReceiptId)}>核对回执</Button>
                    : <span className="text-[12px] text-ink-3">等待回执结果</span>
                  : <Button size="sm" disabled={pending !== null} onClick={() => void retryOne(item)}>重新入队</Button>
                : <Link className="text-accent" to={"/admin/content/" + item.id}>查看流程</Link> },
            ]} />}
        {pageCount > 1 && <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
          <Button size="sm" disabled={activePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>上一页</Button>
          <span className="text-[12px] text-ink-3">{activePage + 1} / {pageCount}</span>
          <Button size="sm" disabled={activePage >= pageCount - 1} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>}
      </Card>

      <p className="mt-3 text-[12px] text-ink-3">
        每篇新闻只在一个队列：待处理包含排队和等待重试，正在处理以 pg-boss active 为准，失败只计算尚未恢复的新闻。
        当前阶段包含正文提取、新闻统一分析和精选事件归组。点击新闻可查看现有处理记录；完成后自动退出三个队列。
      </p>

      <ReasonDialog open={receiptId !== null} title={"核对模型回执 #" + (receiptId ?? "")}
        description="模型调用结果未知，必须先确认是否计费，避免误重发。"
        confirmLabel="记录并放行" busy={pending === "receipt"} onClose={() => setReceiptId(null)}
        onSubmit={async note => {
          const result = await run("POST", "/api/admin/receipts/" + receiptId + "/release",
            { billed: billed === "true", note }, { label: "receipt", success: "已放行", revalidate: false });
          if (result !== null) { setReceiptId(null); refresh.load("/admin/runs"); }
          return result !== null;
        }}>
        <Field label="供应商是否计费">
          <Select value={billed} onChange={e => setBilled(e.target.value)}>
            <option value="false">未计费</option>
            <option value="true">已计费（未取回结果）</option>
          </Select>
        </Field>
      </ReasonDialog>
    </AdminPage>
  );
}
