// The research module's storage and public reads (specs/002-adsense-readiness US3). Writes are the
// editor's alone and audited; only `published` pieces are public, in the site's list, detail and sitemap.
import { z } from "zod";
import { sql } from "@aihot/backend/db";
import { audit } from "@aihot/backend/audit";

export interface ResearchArticleRow {
  slug: string;
  title: string;
  title_en: string | null;
  author: string;
  author_note: string | null;
  summary: string;
  summary_en: string | null;
  method: string;
  body_md: string;
  body_md_en: string | null;
  status: "draft" | "published" | "retired";
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** The list view: bodies stay out of it. */
export type ResearchSummary = Omit<ResearchArticleRow, "body_md" | "body_md_en" | "method">;

/** Every piece, newest edit first, for the admin page. */
export async function listAll(): Promise<ResearchSummary[]> {
  return sql<ResearchSummary[]>`
    SELECT slug, title, title_en, author, author_note, summary, summary_en, status, published_at, created_at, updated_at
    FROM research_articles ORDER BY updated_at DESC`;
}

/** Published pieces, newest first: the public list. */
export async function listPublished(): Promise<ResearchSummary[]> {
  return sql<ResearchSummary[]>`
    SELECT slug, title, title_en, author, author_note, summary, summary_en, status, published_at, created_at, updated_at
    FROM research_articles WHERE status = 'published' ORDER BY published_at DESC NULLS LAST, updated_at DESC`;
}

/** One published piece for its public page; drafts and retired pieces answer null. */
export async function getPublished(slug: string): Promise<ResearchArticleRow | null> {
  const [row] = await sql<ResearchArticleRow[]>`
    SELECT * FROM research_articles WHERE slug = ${slug} AND status = 'published'`;
  return row ?? null;
}

const Fields = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, "slug 由小写字母、数字和连字符组成"),
  title: z.string().trim().min(1).max(200),
  title_en: z.string().trim().max(200).optional().nullable(),
  author: z.string().trim().min(1).max(120),
  author_note: z.string().trim().max(300).optional().nullable(),
  summary: z.string().trim().min(1).max(600),
  summary_en: z.string().trim().max(1200).optional().nullable(),
  method: z.string().trim().min(1).max(4000),
  body_md: z.string().trim().min(1).max(60000),
  body_md_en: z.string().trim().max(120000).optional().nullable(),
});

/** Create or edit a piece by its slug. The status never changes here; every edit is audited. */
export async function saveArticle(input: unknown, actor: string): Promise<ResearchArticleRow> {
  const f = Fields.parse(input);
  const blank = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  const [row] = await sql<ResearchArticleRow[]>`
    INSERT INTO research_articles (slug, title, title_en, author, author_note, summary, summary_en, method, body_md, body_md_en)
    VALUES (${f.slug}, ${f.title}, ${blank(f.title_en)}, ${f.author}, ${blank(f.author_note)}, ${f.summary}, ${blank(f.summary_en)}, ${f.method}, ${f.body_md}, ${blank(f.body_md_en)})
    ON CONFLICT (slug) DO UPDATE SET
      title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author, author_note = EXCLUDED.author_note,
      summary = EXCLUDED.summary, summary_en = EXCLUDED.summary_en, method = EXCLUDED.method,
      body_md = EXCLUDED.body_md, body_md_en = EXCLUDED.body_md_en, updated_at = now()
    RETURNING *`;
  await audit(actor, "research.save", `research:${f.slug}`, "保存稿件", null, { title: f.title }, {});
  return row!;
}

const TRANSITIONS: Record<string, Record<string, string>> = {
  draft: { published: "发布" },
  published: { retired: "下线", draft: "转回草稿" },
  retired: { draft: "转回草稿" },
};

/**
 * The editor's state machine: draft → published → retired, back to draft allowed. Publishing stamps
 * published_at once; every move is audited with the editor's reason.
 */
export async function setStatus(slug: string, status: "draft" | "published" | "retired", reason: string, actor: string): Promise<ResearchArticleRow | null> {
  if (!reason.trim()) throw Object.assign(new Error("写明操作原因"), { statusCode: 400 });
  const [before] = await sql<ResearchArticleRow[]>`SELECT * FROM research_articles WHERE slug = ${slug}`;
  if (!before) return null;
  const move = TRANSITIONS[before.status]?.[status];
  if (!move) throw Object.assign(new Error(`不能从 ${before.status} 转到 ${status}`), { statusCode: 400 });
  const [row] = await sql<ResearchArticleRow[]>`
    UPDATE research_articles SET
      status = ${status},
      published_at = CASE WHEN ${status} = 'published' THEN coalesce(published_at, now()) ELSE published_at END,
      updated_at = now()
    WHERE slug = ${slug} RETURNING *`;
  await audit(actor, "research.status", `research:${slug}`, reason, { status: before.status }, { status }, {});
  return row ?? null;
}

/** The module's sitemap entries: the index and every published piece, with real modification times. */
export async function sitemapEntries(): Promise<Array<{ loc: string; lastmod: Date; revision: string }>> {
  const rows = await sql<{ slug: string; published_at: Date | null; updated_at: Date }[]>`
    SELECT slug, published_at, updated_at FROM research_articles WHERE status = 'published' ORDER BY published_at DESC NULLS LAST`;
  const at = rows[0]?.updated_at ?? new Date();
  return [
    { loc: "/research", lastmod: at, revision: `index:${at.toISOString()}` },
    ...rows.map((r) => ({
      loc: `/research/${r.slug}`,
      lastmod: r.updated_at,
      revision: `${r.slug}:${r.updated_at.toISOString()}`,
    })),
  ];
}
