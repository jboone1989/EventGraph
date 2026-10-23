// /admin/research: the editor's desk for original pieces (specs/002-adsense-readiness US3) — write in
// the form, save a draft, then publish, retire or return to draft with a recorded reason.
//
// Module route files live outside apps/web/app, so react-router's typegen writes no `+types` for them:
// the loader is typed structurally here, as the runtime calls it.
import { useState } from "react";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { AdminPage, Badge, Button, Card, Empty, Input, Textarea } from "@aihot/web/features/admin/ui";
import { useAdminAction } from "@aihot/web/features/admin/action";
import type { ResearchArticleView } from "../types.ts";

interface Loader {
  articles: ResearchArticleView[];
}

export async function loader({ request }: { request: Request }): Promise<Loader> {
  return await adminGet<Loader>(request, "/api/admin/research");
}

export const meta = () => [{ title: `研究稿件 · ${SITE.name} 后台` }];

const BLANK = {
  slug: "", title: "", title_en: "", author: "Jianbo Wang", author_note: "", summary: "", summary_en: "",
  method: "数据与口径：\n来源：\n局限：", body_md: "", body_md_en: "",
};

type Form = typeof BLANK;

const STATUS_TONE = { published: "accent", draft: "muted", retired: "warn" } as const;
const STATUS_LABEL = { published: "已发布", draft: "草稿", retired: "已下线" } as const;

export default function AdminResearch({ loaderData }: { loaderData?: Loader }) {
  const articles = loaderData?.articles ?? [];
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState<Form>({ ...BLANK });
  const [editing, setEditing] = useState<string | null>(null);
  const [statusAsk, setStatusAsk] = useState<{ slug: string; status: "published" | "retired" | "draft" } | null>(null);
  const [reason, setReason] = useState("");

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const edit = (a: ResearchArticleView) => {
    setEditing(a.slug);
    setForm({
      slug: a.slug, title: a.title, title_en: a.title_en ?? "", author: a.author, author_note: a.author_note ?? "",
      summary: a.summary, summary_en: a.summary_en ?? "", method: a.method, body_md: a.body_md, body_md_en: a.body_md_en ?? "",
    });
  };

  const save = async () => {
    const payload = {
      ...form,
      title_en: form.title_en || null, author_note: form.author_note || null,
      summary_en: form.summary_en || null, body_md_en: form.body_md_en || null,
    };
    const saved = await run("PUT", "/api/admin/research/article", payload, { label: "save", success: "已保存" });
    if (saved !== null) { setForm({ ...BLANK }); setEditing(null); }
  };

  const move = async () => {
    if (!statusAsk || !reason.trim()) return;
    const done = await run("POST", `/api/admin/research/${encodeURIComponent(statusAsk.slug)}/status`, { status: statusAsk.status, reason }, { label: "status", success: "已更新状态" });
    if (done !== null) { setStatusAsk(null); setReason(""); }
  };

  return (
    <AdminPage title="研究稿件" subtitle="署名原创研究的写作台：草稿保存在这里，发布后进入 /research 与站点收录；每次状态变化记录原因。">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={editing ? `编辑：${editing}` : "写一篇"} right={editing && <Button onClick={() => { setEditing(null); setForm({ ...BLANK }); }}>放弃修改</Button>}>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-[12.5px] text-ink-3">slug（地址，创建后不改）<Input value={form.slug} onChange={set("slug")} disabled={!!editing} placeholder="stablecoin-weekly-2026-10" /></label>
              <label className="grid gap-1 text-[12.5px] text-ink-3">作者署名<Input value={form.author} onChange={set("author")} /></label>
              <label className="grid gap-1 text-[12.5px] text-ink-3">标题<Input value={form.title} onChange={set("title")} /></label>
              <label className="grid gap-1 text-[12.5px] text-ink-3">英文标题（选填）<Input value={form.title_en} onChange={set("title_en")} /></label>
              <label className="grid gap-1 text-[12.5px] text-ink-3">作者注（选填：身份/资质一句话）<Input value={form.author_note} onChange={set("author_note")} /></label>
            </div>
            <label className="grid gap-1 text-[12.5px] text-ink-3">摘要<Textarea value={form.summary} onChange={set("summary")} /></label>
            <label className="grid gap-1 text-[12.5px] text-ink-3">英文摘要（选填）<Textarea value={form.summary_en} onChange={set("summary_en")} /></label>
            <label className="grid gap-1 text-[12.5px] text-ink-3">方法与数据来源（必填）<Textarea value={form.method} onChange={set("method")} className="min-h-[110px]" /></label>
            <label className="grid gap-1 text-[12.5px] text-ink-3">正文（Markdown）<Textarea value={form.body_md} onChange={set("body_md")} className="min-h-[280px] font-mono text-[13px]" /></label>
            <label className="grid gap-1 text-[12.5px] text-ink-3">英文正文（选填，Markdown）<Textarea value={form.body_md_en} onChange={set("body_md_en")} className="min-h-[160px] font-mono text-[13px]" /></label>
            <div><Button tone="primary" busy={pending === "save"} disabled={pending !== null} onClick={save}>{editing ? "保存修改" : "保存草稿"}</Button></div>
          </div>
        </Card>
        <Card title="全部稿件" pad={false}>
          {articles.length === 0 ? (
            <div className="p-4"><Empty>还没有稿件。</Empty></div>
          ) : (
            <ul className="divide-y divide-line">
              {articles.map((a: ResearchArticleView) => (
                <li key={a.slug} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[11.5px] text-ink-4">{a.slug}</span>
                    <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    <span className="ml-auto flex gap-1.5">
                      <Button size="sm" disabled={pending !== null} onClick={() => edit(a)}>编辑</Button>
                      {a.status === "draft" && <Button size="sm" tone="primary" disabled={pending !== null} onClick={() => setStatusAsk({ slug: a.slug, status: "published" })}>发布</Button>}
                      {a.status === "published" && <Button size="sm" disabled={pending !== null} onClick={() => setStatusAsk({ slug: a.slug, status: "retired" })}>下线</Button>}
                      {a.status !== "draft" && <Button size="sm" disabled={pending !== null} onClick={() => setStatusAsk({ slug: a.slug, status: "draft" })}>转草稿</Button>}
                    </span>
                  </div>
                  <div className="mt-1 text-[13.5px] font-medium text-ink">{a.title}</div>
                  <div className="mt-0.5 text-[12px] text-ink-4">{a.author} · 更新 {new Date(a.updated_at).toISOString().slice(0, 10)}</div>
                  {statusAsk?.slug === a.slug && (
                    <div className="mt-2 flex gap-2">
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`为什么${statusAsk.status === "published" ? "发布" : statusAsk.status === "retired" ? "下线" : "转回草稿"}`} aria-label="操作原因" />
                      <Button tone="primary" busy={pending === "status"} disabled={pending !== null || !reason.trim()} onClick={move}>确认</Button>
                      <Button disabled={pending !== null} onClick={() => { setStatusAsk(null); setReason(""); }}>取消</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
