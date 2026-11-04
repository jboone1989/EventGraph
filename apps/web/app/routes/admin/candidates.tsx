import { useState } from "react";
import { SITE } from "@aihot/site";
import { Form, Link, useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/candidates";
import type { AdminCandidateRow, AdminSourceCandidates } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { num } from "../../features/admin/format";
import { toast } from "../../features/admin/toast";
import { AdminPage, Badge, Button, Card, DataTable, Dot, Empty, Input, Pager, ReasonDialog, Stat, Time } from "../../features/admin/ui";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return adminGet<AdminSourceCandidates>(request, `/api/admin/source-candidates${url.search}`);
}

export const meta = () => [{ title: `信源候选 · ${SITE.name} 后台` }];

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "accent" | "muted" | "info" }> = {
  discovered: { label: "已发现", tone: "info" },
  preflight_failed: { label: "预检未过", tone: "bad" },
  trial: { label: "试运行", tone: "accent" },
  promoted: { label: "已晋升", tone: "ok" },
  demoted: { label: "已降级", tone: "muted" },
  retired: { label: "已退场", tone: "muted" },
  rejected: { label: "已拒绝", tone: "bad" },
};
const ORIGIN: Record<string, string> = { deepseek: "自动发现", operator: "运营登记", breaking_event: "突发事件" };

export default function CandidatesAdmin({ loaderData }: Route.ComponentProps) {
  const { rows, totals, page } = loaderData;
  const [sp] = useSearchParams();
  const refresh = useFetcher<typeof loader>();
  const data = (refresh.data ?? loaderData) as AdminSourceCandidates;
  const { run, pending, busy } = useAdminAction();
  // The candidate awaiting a reason-requiring action (revive, hold, release).
  const [reasonFor, setReasonFor] = useState<{ row: AdminCandidateRow; action: "revive" | "hold" | "release" } | null>(null);

  const act = <T,>(row: AdminCandidateRow, path: string, body: unknown, label: string) =>
    run<T>("POST", `/api/admin/source-candidates/${encodeURIComponent(row.id)}/${path}`, body, { label: `${label}:${row.id}` });

  // The lifecycle endpoints answer refused commands with 200 plus a reason, not with an error status;
  // toast what actually happened instead of a blanket success.
  const preview = async (row: AdminCandidateRow) => {
    const r = await act<{ passed: boolean; error?: string; skipped?: "budget" | "credential" }>(row, "preview", {}, "preview");
    if (!r) return;
    if (r.passed) toast("预览通过，可以开始试运行", "ok");
    else if (r.skipped) toast(r.skipped === "budget" ? "预览跳过：预算不足，候选未变动" : "预览跳过：缺少凭证，候选未变动", "error");
    else toast(`预览未通过：${r.error ?? "无可用条目"}`, "error");
  };
  const trial = async (row: AdminCandidateRow) => {
    const r = await act<{ started: boolean; sourceId?: string; reason?: string }>(row, "trial", {}, "trial");
    if (r) r.started ? toast(`试运行源已创建（${r.sourceId}）`, "ok") : toast(`未能开始试运行：${r.reason ?? "未知原因"}`, "error");
  };
  const evaluate = async (row: AdminCandidateRow) => {
    const r = await act<{ applied: boolean; decision: { action: string; score: number } }>(row, "evaluate", {}, "evaluate");
    if (r) toast(`评估完成：${r.decision.action} ${r.decision.score} 分（${r.applied ? "已执行" : "仅记录，未开启自动执行"}）`, "info");
  };

  return (
    <AdminPage
      title="信源候选"
      subtitle="动态信源生命周期（发现 → 预检 → 试运行 → 决定）。预检未过的候选保留原因可改后重新登记；降级/退场的源可一键复活重进试运行。"
    >
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="已发现" value={num(totals.discovered ?? 0)} hint="等待预览与试运行" />
        <Stat label="试运行" value={num(totals.trial ?? 0)} hint="T2 热度信号在采" />
        <Stat label="预检未过" value={num(totals.preflight_failed ?? 0)} tone={totals.preflight_failed ? "bad" : "ok"} hint="留档原因，可改后重登" />
        <Stat label="已退场/降级" value={num((totals.demoted ?? 0) + (totals.retired ?? 0))} hint="源已停用，可复活" />
      </div>
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
          <Form method="get" className="flex w-full max-w-md gap-2" preventScrollReset>
            {sp.get("status") && <input type="hidden" name="status" value={sp.get("status")!} />}
            <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="名称、ID 或标签" aria-label="搜索候选" />
          </Form>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <Link to="/admin/candidates" className={sp.get("status") ? "text-ink-3 hover:text-ink" : "font-medium text-ink"}>全部 {num(Object.values(totals).reduce((a, b) => a + b, 0))}</Link>
            {Object.entries(STATUS).map(([value, s]) => (totals[value] || sp.get("status") === value) && (
              <Link key={value} to={value === "" ? "/admin/candidates" : `/admin/candidates?status=${value}`}
                className={sp.get("status") === value ? "font-medium text-ink" : "text-ink-3 hover:text-ink"}>
                {s.label} {num(totals[value] ?? 0)}
              </Link>
            ))}
          </div>
        </div>
        <DataTable
          rows={data.rows}
          rowKey={(r) => r.id}
          empty={<Empty>还没有候选。自动发现默认关闭；可在设置中开启，或等 DeepSeek 发现任务登记。</Empty>}
          columns={[
            {
              key: "name",
              label: "候选",
              render: (r) => (
                <div className="min-w-[220px]">
                  <div className="font-medium text-ink">{r.name}</div>
                  <div className="font-mono text-[11.5px] text-ink-4">{r.id}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] text-ink-3" title={r.rationale}>{r.rationale}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge>{ORIGIN[r.origin_channel] ?? r.origin_channel}</Badge>
                    {r.official_low_frequency && <Badge tone="ok">官方低频</Badge>}
                    {r.expires_at && <Badge tone="warn">到期 <Time at={r.expires_at} /></Badge>}
                  </div>
                </div>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (r) => (
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={STATUS[r.status]?.tone ?? "muted"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                  {r.manual_hold && <Badge tone="warn">人工冻结</Badge>}
                </div>
              ),
            },
            {
              key: "preflight",
              label: "预检 / 预览",
              render: (r) => {
                const failed = r.status === "preflight_failed" || r.preflight.reasons?.length;
                return (
                  <div className="min-w-[180px] text-[12.5px]">
                    {failed
                      ? <div className="whitespace-pre-line text-hot">{(r.preflight.reasons ?? ["unknown"]).join("\n")}</div>
                      : <span className="text-ink-3">六项检查通过</span>}
                    <div className="mt-1 text-ink-4">
                      {r.preflight.previewPassed === true
                        ? <>预览通过 · {num(r.preflight.previewCount ?? 0)} 条 / 有日期 {num(r.preflight.previewDated ?? 0)}</>
                        : r.preflight.previewPassed === false ? <span className="text-hot">预览未通过</span>
                        : "尚未预览"}
                    </div>
                  </div>
                );
              },
            },
            {
              key: "trial",
              label: "试运行",
              render: (r) => r.attached_source_id ? (
                <div className="text-[12.5px]">
                  <Link to={`/admin/sources/${encodeURIComponent(r.attached_source_id)}`} className="font-mono text-accent hover:underline">{r.attached_source_id}</Link>
                  <div className="mt-1 flex items-center gap-1.5 text-ink-3">
                    <Dot tone={r.source_enabled ? (r.source_health === "failing" ? "bad" : r.source_health === "degraded" ? "warn" : "ok") : "muted"} />
                    {r.source_enabled ? r.source_health : "已停用"} · {r.source_mode}
                  </div>
                  {r.trial_started_at && <div className="mt-1 text-ink-4">自 <Time at={r.trial_started_at} /></div>}
                </div>
              ) : <span className="text-ink-4">未开始</span>,
            },
            {
              key: "decision",
              label: "最近决定",
              render: (r) => r.last_decision ? (
                <div className="text-[12.5px]">
                  <span className="font-medium">{r.last_decision}</span>
                  {typeof r.last_score?.score === "number" && <span className="ml-1 text-ink-3">{r.last_score.score} 分</span>}
                  {r.last_score?.reasons?.length ? <div className="mt-1 line-clamp-2 text-[12px] text-ink-4">{r.last_score.reasons.join("、")}</div> : null}
                  <div className="mt-1 text-ink-4"><Time at={r.last_decision_at} /></div>
                </div>
              ) : <span className="text-ink-4">—</span>,
            },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div className="flex flex-wrap gap-1.5">
                  {r.status === "discovered" && <>
                    <Button size="sm" busy={pending === `preview:${r.id}`} disabled={busy || r.manual_hold} onClick={() => preview(r)}>预览</Button>
                    {r.preflight.previewPassed && (
                      <Button size="sm" tone="primary" busy={pending === `trial:${r.id}`} disabled={busy || r.manual_hold} onClick={() => trial(r)}>开始试运行</Button>
                    )}
                  </>}
                  {r.status === "trial" && (
                    <Button size="sm" busy={pending === `evaluate:${r.id}`} disabled={busy} onClick={() => evaluate(r)}>评估</Button>
                  )}
                  {(r.status === "demoted" || r.status === "retired") && (
                    <Button size="sm" tone="primary" disabled={busy || r.manual_hold} onClick={() => setReasonFor({ row: r, action: "revive" })}>复活</Button>
                  )}
                  <Button size="sm" disabled={busy} onClick={() => setReasonFor({ row: r, action: r.manual_hold ? "release" : "hold" })}>
                    {r.manual_hold ? "解除冻结" : "冻结"}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>
      <Pager page={page} hasMore={data.rows.length === 100} />
      <ReasonDialog
        open={reasonFor !== null}
        title={reasonFor?.action === "revive" ? "复活候选" : reasonFor?.action === "hold" ? "冻结候选" : "解除冻结"}
        description={reasonFor?.action === "revive"
          ? "将重新启用其试运行源并重置试用期，评估按复活后的表现重新计算。"
          : reasonFor?.action === "hold" ? "冻结后自动链路不再改动该候选（人工决定优先）。" : "解除后自动评估继续接管该候选。"}
        confirmLabel={reasonFor?.action === "revive" ? "复活" : reasonFor?.action === "hold" ? "冻结" : "解除"}
        busy={busy}
        onClose={() => setReasonFor(null)}
        onSubmit={async (reason) => {
          if (!reasonFor) return;
          const { row, action } = reasonFor;
          if (action === "revive") {
            const r = await act<{ revived: boolean; reason?: string }>(row, "revive", { reason }, "revive");
            if (r?.revived) { toast("已复活并重进试运行", "ok"); setReasonFor(null); return true; }
            if (r) toast(`未能复活：${r.reason ?? "未知原因"}`, "error");
            return false;
          }
          const ok = await act<{ held: boolean }>(row, "hold", { hold: action === "hold", reason }, action);
          if (ok) { toast(action === "hold" ? "已冻结，自动链路不再改动该候选" : "已解除冻结", "ok"); setReasonFor(null); return true; }
          return false;
        }}
      />
    </AdminPage>
  );
}
