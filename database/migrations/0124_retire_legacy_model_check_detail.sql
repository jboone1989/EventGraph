-- Legacy provider-check detail no longer has readers after removing the old probe API.
ALTER TABLE model_provider_checks DROP COLUMN IF EXISTS detail;
