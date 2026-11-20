-- Reverse the obsolete soft-delete schema change without modifying migration history.
ALTER TABLE sources DROP COLUMN IF EXISTS deleted_at;
