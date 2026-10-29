-- Validates the widened kind check (specs/004-editorial-ops FR-005); see 0115.
ALTER TABLE notify_targets VALIDATE CONSTRAINT notify_targets_kind_check;
