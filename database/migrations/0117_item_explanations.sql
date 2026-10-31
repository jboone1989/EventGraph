-- The item explainer (specs/news-explainer Phase 1): 5W1H + So What + What Next for a selected report,
-- written by the worker (editorial/explain.ts). inputs_hash is over everything the model input is built
-- from (publication/items.ts EXPLAIN_ITEM_INPUTS: source, copy, licence-gated body, dates, event context);
-- an explanation whose hash no longer matches is not shown and is written again. language records which
-- edition the explanation belongs to (D-01: a Chinese manuscript is explained in Chinese and shown only
-- on the Chinese page, an English manuscript in English only on the English page). content holds only
-- fields the source supports, all optional; a report the source says nothing about is recorded as
-- insufficient_evidence (D-03: an identifiable reason with its input revision, not re-asked for the same
-- input) and a malformed answer is failed and retried at most three times.
CREATE TABLE IF NOT EXISTS item_explanations (
  article_id   text PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
  inputs_hash  text NOT NULL,
  language     text NOT NULL CHECK (language IN ('zh', 'en')),
  outcome      text NOT NULL CHECK (outcome IN ('written', 'insufficient_evidence', 'failed')),
  attempts     integer NOT NULL DEFAULT 1,
  content      jsonb,
  error        text,
  receipt_id   bigint,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
