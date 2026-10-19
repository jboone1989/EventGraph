CREATE TABLE registered_model_checks (
 model_id uuid NOT NULL REFERENCES registered_models(id) ON DELETE CASCADE,
 capability text NOT NULL,
 config_fingerprint text NOT NULL,
 config_snapshot jsonb,
 status text NOT NULL CHECK (status IN ('unverified','verified','failed','unknown','unsupported','legacy')),
 verified_at timestamptz,
 latency_ms integer,
 detail text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (model_id, capability)
);
