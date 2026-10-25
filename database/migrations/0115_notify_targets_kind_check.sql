-- The widened kind check (specs/004-editorial-ops FR-005); see 0114 for the drop. NOT VALID first,
-- validated in the next migration, so no full-table lock is taken.
ALTER TABLE notify_targets ADD CONSTRAINT notify_targets_kind_check
  CHECK (kind IN ('feishu_webhook', 'feishu_chat', 'telegram', 'log')) NOT VALID;
