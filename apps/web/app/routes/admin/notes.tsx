import { useState } from "react";
import { SITE } from "@aihot/site";
import type { Route } from "./+types/notes";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { AdminPage, Button, Card, Empty, Input, Textarea } from "../../features/admin/ui";

// /admin/notes: the editor's daily note (specs/004-editorial-ops FR-001) — write the day's few
// sentences here; the daily renders them above the issue the moment they are saved.
interface NoteRow {
  day: string;
  note: string;
  noteEn: string | null;
  updatedAt: string;
  updatedBy: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<{ rows: NoteRow[] }>(request, "/api/admin/notes?days=60");
}

export const meta: Route.MetaFunction = () => [{ title: `编辑手记 · ${SITE.name} 后台` }];

const BLANK = { day: "", note: "", noteEn: "" };

export default function AdminNotes({ loaderData }: Route.ComponentProps) {
  const rows = loaderData?.rows ?? [];
  const { run, pending } = useAdminAction();
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK, day: new Date().toISOString().slice(0, 10) });

  const save = async () => {
    if (!form.day || !form.note.trim()) return;
    const saved = await run("POST", "/api/admin/notes", { day: form.day, note: form.note, noteEn: form.noteEn || null }, { label: "save", success: "已保存" });
    if (saved !== null) setForm((f) => ({ ...BLANK, day: f.day }));
  };

  return (
    <AdminPage title="编辑手记" subtitle="每天几句话，写在日报最前面：今天最值得注意的事、哪些说法还要回原文核对。保存即生效，英文日报只显示英文手记。">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="写手记">
          <div className="grid gap-3">
            <label className="grid gap-1 text-[12.5px] text-ink-3">日期（与日报一致，北京时间）<Input type="date" value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} /></label>
            <label className="grid gap-1 text-[12.5px] text-ink-3">中文手记（必填，2–4 句）<Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="min-h-[110px]" /></label>
            <label className="grid gap-1 text-[12.5px] text-ink-3">英文手记（选填；没有就不在英文日报显示）<Textarea value={form.noteEn} onChange={(e) => setForm((f) => ({ ...f, noteEn: e.target.value }))} className="min-h-[90px]" /></label>
            <div><Button tone="primary" busy={pending === "save"} disabled={pending !== null || !form.day || !form.note.trim()} onClick={save}>保存</Button></div>
          </div>
        </Card>
        <Card title="最近 60 天" pad={false}>
          {rows.length === 0 ? (
            <div className="p-4"><Empty>还没有写过手记。</Empty></div>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((n) => (
                <li key={n.day} className="grid gap-1 p-4">
                  <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink-3">
                    <span className="num font-medium text-ink-2">{n.day}</span>
                    <span className="text-ink-4">{n.updatedBy} · {new Date(n.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                  </div>
                  <p className="text-[13.5px] leading-relaxed text-ink-2">{n.note}</p>
                  {n.noteEn && <p className="text-[12.5px] leading-relaxed text-ink-4">{n.noteEn}</p>}
                  <div><Button onClick={() => setForm({ day: n.day, note: n.note, noteEn: n.noteEn ?? "" })}>修改</Button></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminPage>
  );
}
