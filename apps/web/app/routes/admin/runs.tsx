import { useState } from "react";
import { SITE } from "@aihot/site";
import { Link, useFetcher } from "react-router";
import { useEffect } from "react";
import type { Route } from "./+types/runs";
import type { AdminDeliveryIssue, AdminReceiptIssue, AdminRuns } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { bj, num } from "../../features/admin/format";
import { AdminPage, Badge, Button, Card, DataTable, Field, ReasonDialog, Select, Stat, Time } from "../../features/admin/ui";

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<AdminRuns>(request, "/api/admin/runs");
}

export const meta: Route.MetaFunction = () => [{ title: `运行 · ${SITE.name} 后台` }];

const CAUSES = {
  receipt_unknown: { label: "模型结果未知，等待人工核对", action: "先核对回执，不能直接重发", target: "#receipt-backlog" },
  article_failed: { label: "新闻处理最终失败", action: "查看错误原因，修复后分批重试", target: "#runs-issues" },
  provider_retry: { label: "模型/Provider 错误，等待重试", action: "检查模型连接与路由，系统到点自动重试", target: "/admin/models" },
  retry_wait: { label: "新闻处理错误，等待自动重试", action: "查看具体错误及下次重试时间", target: "#runs-issues" },
  missing_job: { label: "新闻超时，未找到可执行任务", action: "检查 content.sweep 与 Worker；不能直接归因为模型错误", target: "#job-failures" },
  queue_wait: { label: "新闻排队超过 15 分钟", action: "检查 Worker 是否在线和消费是否正常", target: "#runs-issues" },
  long_running: { label: "新闻执行超过 15 分钟", action: "查看文章处理链路，检查模型超时与正文提取", target: "#runs-issues" },
  unclassified: { label: "新闻超时，原因待定位", action: "打开示例新闻，查看处理链路与任务状态", target: "#runs-issues" },
} as const;



export default function RunsAdmin({ loaderData }: Route.ComponentProps) {
  const refresh = useFetcher<typeof loader>();
  const r = refresh.data ?? loaderData;
  const { run, pending } = useAdminAction();
  const [receipt, setReceipt] = useState<AdminReceiptIssue | null>(null);
  const [billed, setBilled] = useState("false");
  const [delivery, setDelivery] = useState<AdminDeliveryIssue | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "drop" | "resend">("sent");
  // Failure group to put back into processing ("" = all failures from this UTC day).
  const [requeue, setRequeue] = useState<string | null>(null);
  const [requeueLimit, setRequeueLimit] = useState("5");
  const [groupingPage, setGroupingPage] = useState(0);

  // Live view: refresh every 20 s while visible.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh.state === "idle" && refresh.load("/admin/runs"), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const worker = r.processes.find((p) => p.role === "worker");
  const failing = r.jobs.filter((j) => j.status === "failed");
  const unknownReceipts = r.receipts.unknownTotal;
  // Current article problems are unique by article ID; task history is diagnostics only.
  const attentionCount = Number(!worker?.alive) + Number(r.currentNews.failed > 0) +
    Number(r.grouping.needsAttention > 0) + Number(r.lagging.length > 0) +
    Number(failing.length > 0) + Number(unknownReceipts > 0);
  const automaticGrouping = r.grouping.items.filter(x => x.recovery === "automatic");
  const groupingOverdue = (value: string) => Date.now() - new Date(value).getTime() > 10 * 60_000;
  const groupedCauseRows = [
    { kind: "manual", label: "归组失败，需人工处理", items: r.grouping.items.filter(x => x.recovery === "manual") },
    { kind: "receipt", label: "归组模型结果待核对", items: r.grouping.items.filter(x => x.recovery === "receipt") },
    { kind: "active_overdue", label: "归组任务实际执行超过 10 分钟", items: automaticGrouping.filter(x => x.jobState === "active" && groupingOverdue(x.activeSince ?? x.since)) },
    { kind: "active", label: "归组正在执行", items: automaticGrouping.filter(x => x.jobState === "active" && !groupingOverdue(x.activeSince ?? x.since)) },
    { kind: "queue", label: "归组队列正在等待 Worker 消费", items: automaticGrouping.filter(x => x.jobState === "created" || x.jobState === "retry") },
    { kind: "job_failed", label: "归组任务已失败，没有正在执行或排队的任务", items: automaticGrouping.filter(x => !x.jobState && x.lastFailedJobError) },
    { kind: "missing", label: "超过 10 分钟仍没有归组任务", items: automaticGrouping.filter(x => !x.jobState && !x.lastFailedJobError && groupingOverdue(x.since)) },
    { kind: "starting", label: "归组待启动（尚未超时）", items: automaticGrouping.filter(x => !x.jobState && !x.lastFailedJobError && !groupingOverdue(x.since)) },
  ].filter(x => x.items.length > 0);
  const overdueNewsCount = r.backlogCauses?.reduce((sum, cause) => sum + cause.count, 0) ?? 0;
  const groupingPageSize = 20;
  const groupingPages = Math.max(1, Math.ceil(r.grouping.items.length / groupingPageSize));
  const currentGroupingPage = Math.min(groupingPage, groupingPages - 1);
  const groupingItems = r.grouping.items.slice(currentGroupingPage * groupingPageSize, (currentGroupingPage + 1) * groupingPageSize);

  return (
    <AdminPage title="运行与积压" subtitle={<>当前新闻积压与可执行恢复 · 每 20 秒刷新 · 更新于 {bj(r.checkedAt)}</>}>
      <Card className="mb-5" title="新闻处理 · 当前队列"
        right={<span className="text-[12px] text-ink-4">UTC 今日 · 按唯一新闻计数</span>}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="待处理" value={num(r.currentNews.pending)} hint="排队或等待自动重试" />
          <Stat label="处理中" value={num(r.currentNews.processing)} hint="Worker 正在执行" />
          <Stat label="失败" value={num(r.currentNews.failed)} tone={r.currentNews.failed ? "bad" : "ok"}
            hint="未知计费回执需核对后才能重试" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[12px] text-ink-4">当前未完成新闻，不含已发布完成项和历史回填；失败后可分批重试。</p>
          <Button size="sm" onClick={() => setRequeue("")} disabled={r.errors.length === 0}>重试失败新闻</Button>
        </div>
      </Card>
      <Card className="mb-5" title="积压原因诊断" right={<span className="text-[12px] text-ink-4">根据当前新闻、任务与模型回执自动归因；非历史失败次数</span>}>
        {r.backlogCauses === undefined
          ? <p className="text-[13px] text-ink-3">诊断数据未获取，不能判断积压原因；请核对 API 与部署版本。</p>
          : r.backlogCauses.length === 0 && r.grouping.waiting === 0
            ? <p className="text-[13px] text-ink-3">当前没有超时或最终失败的新闻，也没有未完成的精选归组。</p>
            : <>
              {r.backlogCauses.length > 0 && <>
                <p className="mb-3 text-[12px] text-ink-3">新闻处理：{num(overdueNewsCount)} 条超时或已失败。每条只归到一类，正常排队未超时的不计入。</p>
                <div className="space-y-3">
                  {r.backlogCauses.map(cause => {
                    const info = CAUSES[cause.kind];
                    return <div key={cause.kind} className="rounded-control border border-line p-3 text-[13px]">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <strong>{info.label}</strong>
                        <span className="font-semibold">{num(cause.count)} 条</span>
                      </div>
                      <p className="mt-1 text-ink-3">示例错误：{cause.exampleError || "没有记录具体错误"} · 最早发现 <Time at={cause.oldest} />{cause.nextRetryAt && <> · 下次重试 <Time at={cause.nextRetryAt} /></>}</p>
                      <p className="mt-1">{info.action} · <Link className="text-accent" to={`/admin/content/${cause.exampleArticleId}`}>查看示例新闻</Link>{info.target.startsWith("/") && <> · <Link className="text-accent" to={info.target}>检查模型</Link></>}</p>
                    </div>;
                  })}
                </div>
              </>}
              {groupedCauseRows.length > 0 && <div className="mt-4 border-t border-line pt-3">
                <h3 className="mb-2 font-semibold text-ink">精选去重与归组（不同于新闻分析积压）</h3>
                {groupedCauseRows.map(group => <p key={group.kind} className="py-1 text-[13px]">
                  <strong>{group.label}：{num(group.items.length)} 条</strong>
                  <span className="ml-2 text-ink-3">{
                    group.kind === "queue" ? "归组 Worker 串行处理；确认队列是否持续出队" :
                    group.kind === "job_failed" ? (group.items[0]?.lastFailedJobError ?? "检查今天的失败任务") :
                    group.kind === "missing" ? "归组任务缺失，检查 content.sweep / events.group 调度" :
                    group.kind === "active_overdue" ? "正在执行但已超时，检查归组模型响应和任务超时" :
                    group.kind === "active" ? "当前归组 Worker 正在执行" :
                    group.kind === "starting" ? "还不能判断为故障" :
                    group.items.find(x => x.error)?.error ?? "打开明细核对处理原因"
                  }</span>
                  {" · "}<a className="text-accent hover:underline" href="#grouping-backlog">查看明细</a>
                </p>)}
              </div>}
            </>}
      </Card>
      <Card className="mb-5" title={attentionCount ? `需要处理 · ${attentionCount} 类问题` : "运行状态"}>
        <div className="mb-3 text-[13px] text-ink-2">
          <Badge tone={worker?.alive ? "ok" : "bad"}>{worker?.alive ? "Worker 运行中" : "Worker 未确认在线"}</Badge>
          <span className="ml-2 text-ink-4">按当前状态判断，不把任务次数、模型请求次数当新闻数量</span>
        </div>
        {attentionCount === 0
          ? <p className="text-[13px] text-ink-3">当前未检测到需要人工处理的项目。</p>
          : <div className="space-y-2 text-[13px]">
            {!worker?.alive && <p>Worker 心跳中断，检查服务部署和运行日志。</p>}
            {r.currentNews.failed > 0 && <p><a className="text-accent hover:underline" href="#runs-issues">失败新闻 {num(r.currentNews.failed)} 条</a> · 按原因分批恢复，未知回执必须先核对。</p>}
            {r.grouping.needsAttention > 0 && <p><a className="text-accent hover:underline" href="#grouping-backlog">精选去重等待超时 {num(r.grouping.needsAttention)} 条</a> · 是分析后的归组积压，不是新闻分析失败。</p>}
            {unknownReceipts > 0 && <p><a className="text-accent hover:underline" href="#receipt-backlog">未知模型回执 {num(unknownReceipts)} 条</a> · 核对支付结果后恢复（可能跨日）。</p>}
            {r.lagging.length > 0 && <p><a className="text-accent hover:underline" href="#source-backlog">采集异常信源 {num(r.lagging.length)} 个</a> · 检查最近抓取状态。</p>}
            {failing.length > 0 && <p><a className="text-accent hover:underline" href="#job-failures">UTC 今日最近一次运行失败的定时任务 {num(failing.length)} 项</a> · 不计入失败新闻数。</p>}
          </div>}
      </Card>
      <section id="runs-issues" aria-label="异常与恢复">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">异常与恢复 · 需要操作的明细</h2>
        <div>
      {r.grouping.waiting > 0 && (
        <Card className="mb-5" title="精选去重 · 尚未完成" right={<span>{num(r.grouping.waiting)} 条未完成 · {num(r.grouping.needsAttention)} 条等待超过 10 分钟</span>} pad={false} scrollable>
          <div id="grouping-backlog" className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13px] text-ink-3">
            <span>已通过新闻分析，正在确认归组和去重；不属于新闻分析失败。</span>
            <span>共 {num(r.grouping.waiting)} 条 · 第 {currentGroupingPage + 1}/{groupingPages} 页</span>
          </div>
          <DataTable scrollable dense rows={groupingItems} rowKey={(item) => item.articleId} columns={[
            { key: "title", label: "新闻", render: (item) => <Link className="text-accent" to={`/admin/content/${item.articleId}`}>{item.title}</Link> },
            { key: "since", label: "开始等待", render: (item) => <Time at={item.since} /> },
            { key: "recovery", label: "下一步", render: (item) => <Badge tone={item.recovery === "manual" ? "bad" : "warn"}>{item.recovery === "manual" ? "需处理后恢复" : item.recovery === "receipt" ? "等待付费结果自动恢复" : "自动处理中"}</Badge> },
            { key: "error", label: "原因", render: (item) => <span className="line-clamp-2 text-[12px] text-ink-3">{item.receiptId ? `回执 #${item.receiptId} · ` : ""}{item.error ?? "等待身份确认"}</span> },
          ]} />
          {groupingPages > 1 && <div className="flex items-center justify-end gap-3 border-t border-line px-4 py-3">
            <Button size="sm" disabled={currentGroupingPage === 0} onClick={() => setGroupingPage(p => Math.max(0, p - 1))}>上一页</Button>
            <span className="text-[12px] text-ink-3">{currentGroupingPage + 1} / {groupingPages}</span>
            <Button size="sm" disabled={currentGroupingPage >= groupingPages - 1} onClick={() => setGroupingPage(p => p + 1)}>下一页</Button>
          </div>}
        </Card>
      )}

      {failing.length > 0 && (
        <Card className="mb-5" title="UTC 今日仍失败的定时任务" pad={false} scrollable>
          <div id="job-failures" className="px-4 py-3 text-[12px] text-ink-3">仅展示 UTC 今日最近一次执行仍失败的任务；昨天的失败不会继续被标为今日故障。</div>
          <DataTable dense rows={failing} rowKey={j => j.job} columns={[
            { key: "job", label: "任务", render: j => j.job },
            { key: "time", label: "失败时间", render: j => <Time at={j.started_at} /> },
            { key: "error", label: "错误", render: j => <span className="text-[12px] text-ink-3">{j.error ?? "无错误详情"}</span> },
          ]} />
        </Card>
      )}

      {(r.receipts.issues.length > 0 || r.deliveries.length > 0) && <div id="receipt-backlog" className="mt-5 grid gap-5 xl:grid-cols-2">
        {r.receipts.issues.length > 0 && <Card title="需要人工核对的模型回执" right={<span>未知结果 {num(unknownReceipts)} 条（可能跨日）· 当前展示最多 40 条</span>} pad={false} scrollable>
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
        </Card>}
        {r.deliveries.length > 0 && <Card title="需要核实的投递" pad={false} scrollable>
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
        </Card>}
      </div>}

      {(r.lagging.length > 0 || r.errors.length > 0) && <div id="source-backlog" className="mt-5 grid gap-5 xl:grid-cols-2">
        {r.lagging.length > 0 && <Card title="延迟或失败的信源" right={<Link className="text-accent" to="/admin/sources?health=failing">全部失败信源</Link>} pad={false} scrollable>
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
        </Card>}
        {r.errors.length > 0 && <Card
          title="可重试的失败新闻 · 按原因分组"
          right={
            <span className="flex items-center gap-3">
              <Button size="sm" onClick={() => setRequeue("")}>分批重新处理</Button>
            </span>
          }
          pad={false} scrollable
        >
          <p className="px-4 py-3 text-[12px] text-ink-3">这里仅列出 UTC 今日待处理范围内、且已排除未知付费回执的可重试新闻。失败总数还包含必须先核对回执的文章；两者不能直接相加。重试会产生新的模型调用。</p>
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
        </Card>}
      </div>}

</div>
      </section>
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
