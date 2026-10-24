import { SITE } from "@aihot/site";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/content";
import type { AdminContentRow, AdminContentSearch, AdminCurateQueue } from "@aihot/contracts/admin";
import { adminGet } from "../../lib/admin.server";
import { VISIBILITY_LABEL } from "../../features/admin/labels";
import { AdminPage, Badge, Button, Card, DataTable, Empty, Input, Time } from "../../features/admin/ui";

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  // The queue is one widget of a diagnostics page: when its endpoint is absent or failing the panel
  // simply stays empty — only the login redirect (a thrown Response) still takes the visitor out.
  const pending = q ? [] : await adminGet<AdminCurateQueue>(request, "/api/admin/content/curate-pending").then(
    (r) => r.rows,
    (error: unknown) => {
      if (error instanceof Response && error.status >= 300 && error.status < 400) throw error;
      return [];
    },
  );
  if (!q) return { q, rows: [] as AdminContentRow[], pending };
  const { rows } = await adminGet<AdminContentSearch>(request, `/api/admin/content?q=${encodeURIComponent(q)}`);
  return { q, rows, pending };
}

export const meta: Route.MetaFunction = () => [{ title: `内容诊断 · ${SITE.name} 后台` }];

export default function Content({ loaderData }: Route.ComponentProps) {
  const { q, rows, pending } = loaderData;
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  return (
    <AdminPage title="内容诊断" subtitle="按 ID、原文链接或标题找到任何一条内容，看它从信源到公开出口的完整链路；下架、仅摘要、人工修正和重处理都在详情页。">
      <CuratePanel rows={pending} done={() => navigate(".", { replace: true })} />
      <Form method="get" className="mb-5 flex max-w-2xl gap-2">
        <Input name="q" defaultValue={sp.get("q") ?? ""} placeholder="内容 ID、URL 或标题关键词" aria-label="搜索内容" autoFocus />
        <Button type="submit" tone="primary">查找</Button>
      </Form>
      {q && (
        <Card pad={false} title={`“${q}” 的结果`} right={<span>{rows.length === 50 ? "仅显示最近 50 条" : `${rows.length} 条`}</span>}>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => navigate(`/admin/content/${r.id}`)}
            empty="没有找到。URL 会先规范化再比对；标题支持中英文片段。"
            columns={[
              {
                key: "t",
                label: "标题",
                render: (r) => (
                  <div className="min-w-[320px]">
                    <Link to={`/admin/content/${r.id}`} className="font-medium text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>{r.title}</Link>
                    <div className="font-mono text-[11.5px] text-ink-4">{r.id}</div>
                  </div>
                ),
              },
              { key: "src", label: "信源", render: (r) => <span className="whitespace-nowrap">{r.source}</span> },
              {
                key: "st",
                label: "状态",
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.selected && <Badge tone="accent">精选</Badge>}
                    {r.visibility && <Badge tone={r.visibility === "public" ? "muted" : "warn"}>{VISIBILITY_LABEL[r.visibility] ?? r.visibility}</Badge>}
                    {!r.visibility && <Badge>{r.processing_state}</Badge>}
                  </span>
                ),
              },
              { key: "sc", label: "分数", align: "right", render: (r) => r.score ?? "—" },
              { key: "d", label: "发现", render: (r) => <Time at={r.discovered_at} /> },
            ]}
          />
        </Card>
      )}
      {!q && <Empty>输入 ID、链接或标题开始查找。</Empty>}
    </AdminPage>
  );
}

/**
 * The daily curation queue (specs/002-adsense-readiness FR-006/FR-008): selected public reports no
 * editor has decided on yet. With curatedIndexOnly they stay out of the index until marked here.
 */
function CuratePanel({ rows, done }: { rows: AdminContentRow[]; done: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"index" | "exclude" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const run = async (indexed: boolean) => {
    if (picked.size === 0 || busy) return;
    setBusy(indexed ? "index" : "exclude");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content/seo-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...picked], indexed, reason: indexed ? "每日策展：收录" : "每日策展：排除" }),
      });
      if (!res.ok) throw new Error(`api ${res.status}`);
      const { changed } = (await res.json()) as { changed: string[] };
      setMessage(indexed ? `已收录 ${changed.length} 条` : `已排除 ${changed.length} 条`);
      setPicked(new Set());
      done();
    } catch (error) {
      setMessage(`操作失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card
      pad={false}
      title="当日待策展"
      right={
        <span className="flex items-center gap-2">
          {message && <span className="text-[12px] text-ink-3">{message}</span>}
          <span className="text-[12px] text-ink-4">{picked.size > 0 ? `已选 ${picked.size} 条` : `${rows.length} 条待定`}</span>
        </span>
      }
      className="mb-6"
    >
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
        <Button tone="primary" disabled={picked.size === 0 || busy !== null} busy={busy === "index"} onClick={() => run(true)}>收录所选</Button>
        <Button disabled={picked.size === 0 || busy !== null} busy={busy === "exclude"} onClick={() => run(false)}>排除所选</Button>
        {rows.length > 0 && (
          <Button disabled={busy !== null} onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
            {picked.size === rows.length ? "清除全选" : "全选"}
          </Button>
        )}
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => toggle(r.id)}
        empty="没有待策展的内容：近 3 天的精选都已处理。"
        columns={[
          {
            key: "pick",
            label: "",
            render: (r) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} aria-label={`选择 ${r.title}`} />,
          },
          {
            key: "t",
            label: "标题",
            render: (r) => (
              <div className="min-w-[320px]">
                <Link to={`/admin/content/${r.id}`} className="font-medium text-ink hover:text-accent" onClick={(e) => e.stopPropagation()}>{r.title}</Link>
                <div className="font-mono text-[11.5px] text-ink-4">{r.source}</div>
              </div>
            ),
          },
          { key: "sc", label: "分数", align: "right", render: (r) => r.score ?? "—" },
          { key: "d", label: "发现", render: (r) => <Time at={r.discovered_at} /> },
        ]}
      />
    </Card>
  );
}
