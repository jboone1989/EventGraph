-- The editor's note above each daily (specs/004-editorial-ops FR-001): one row per Beijing-time day,
-- written in the admin and read by the daily's public read path. site/editor-notes.ts only seeds it.
CREATE TABLE editor_notes (
  day date PRIMARY KEY,
  note text NOT NULL,
  note_en text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
