-- Preserve article provenance while allowing removed sources to disappear from administration.
ALTER TABLE sources ADD COLUMN deleted_at timestamptz;
