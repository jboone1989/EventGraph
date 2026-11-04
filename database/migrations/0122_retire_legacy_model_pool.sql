-- Legacy NVIDIA-only model health, bulk checks and pricing tables are no longer
-- read after model connections, model CRUD and workflow bindings became authoritative.
-- Production preflight on 2026-11-04 verified both tables and legacy check rows empty.
DROP TABLE IF EXISTS model_provider_bulk_checks;
DROP TABLE IF EXISTS service_prices;
ALTER TABLE IF EXISTS model_provider_checks DROP COLUMN IF EXISTS detail;
