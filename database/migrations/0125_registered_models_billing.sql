-- Existing free model registries carry a persistent routing classification.
ALTER TABLE registered_models
 ADD COLUMN billing text NOT NULL DEFAULT 'paid' CHECK (billing IN ('free','paid'));

-- Backfill known free catalog entries; operator edits remain authoritative afterwards.
UPDATE registered_models m SET billing='free'
FROM provider_connections c
WHERE c.id=m.provider_id AND (
 (lower(c.vendor)='openrouter' AND (m.model_id LIKE '%:free' OR m.model_id='openrouter/free' OR m.upstream_metadata->'openrouterFreeSync'->>'free'='true'))
 OR (lower(c.vendor)='nvidia' AND c.policy='nvidia-free-trial')
);
