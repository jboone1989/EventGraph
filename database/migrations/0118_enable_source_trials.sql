-- Enable automatic trials once, while preserving later operator changes.
INSERT INTO settings (key, value, updated_by)
VALUES ('sourceLifecycle.autoPromote', '{"enabled":true}'::jsonb, 'migration:0118')
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(settings.value, '{enabled}', 'true'::jsonb),
    updated_by = 'migration:0118', updated_at = now();
