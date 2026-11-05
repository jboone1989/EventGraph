-- Null means legacy/unclassified: infer once from known free provider metadata until edited.
ALTER TABLE registered_models ADD COLUMN billing text;
