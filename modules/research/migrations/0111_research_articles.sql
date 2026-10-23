-- Original research articles (specs/002-adsense-readiness data-model §2): editor-authored pieces with
-- a byline, a method note and a body, draft → published → retired. One statement (the 0055+ rule).
CREATE TABLE research_articles (
  slug          text PRIMARY KEY CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  title         text NOT NULL,
  title_en      text,
  author        text NOT NULL,
  author_note   text,
  summary       text NOT NULL,
  summary_en    text,
  method        text NOT NULL,
  body_md       text NOT NULL,
  body_md_en    text,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)
