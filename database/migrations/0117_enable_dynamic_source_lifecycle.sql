-- User-approved activation of dynamic source discovery for this release.
-- Apply only once; later changes from the admin are preserved on future deploys.
-- The existing DeepSeek credential/budget checks remain in force.
INSERT INTO settings (key, value, updated_by)
VALUES ('sourceLifecycle.discovery', '{"enabled":true,"maxGaps":6,"maxCandidates":8}'::jsonb, 'migration:0117')
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(settings.value, '{enabled}', 'true'::jsonb),
    updated_by = 'migration:0117', updated_at = now();

