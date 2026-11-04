-- A source rename changes explanation inputs, but routine source fetches also update
-- sources.updated_at. Store the actual source name used for each explanation so old
-- reports can be rechecked on a cheap name comparison instead of hashing every body
-- and correlated sibling list on every polling cycle.
-- Existing rows stay NULL and are checked once on their next eligible run.
ALTER TABLE item_explanations ADD COLUMN IF NOT EXISTS source_name text;
