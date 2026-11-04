-- Retire the unused legacy NVIDIA bulk-check queue table (production row count: zero).
DROP TABLE IF EXISTS model_provider_bulk_checks;
