-- Public channel targets (specs/004-editorial-ops FR-005): a Telegram bot needs both a token and a
-- chat id, and credentials hold one value each, so targets gain a second reference.
ALTER TABLE notify_targets ADD COLUMN IF NOT EXISTS chat_ref text;
