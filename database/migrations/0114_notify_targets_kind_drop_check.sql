-- Kind check widened for the Telegram channel target (specs/004 FR-005): dropped first, re-added in
-- the next migration. notify_targets holds a handful of rows, so the unconstrained window is empty
-- of practical risk.
ALTER TABLE notify_targets DROP CONSTRAINT IF EXISTS notify_targets_kind_check;
