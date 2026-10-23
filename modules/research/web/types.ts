// What the research API answers, as the public pages read it (the module's backend stays server-side).
export interface ResearchArticleView {
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
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchArticlesResponse {
  articles: Array<Omit<ResearchArticleView, "method" | "body_md" | "body_md_en">>;
}

export interface ResearchArticleResponse {
  article: ResearchArticleView;
}
