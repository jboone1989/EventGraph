-- Keep classification editable in the existing model CRUD; do not infer price per request.
ALTER TABLE registered_models
 ADD COLUMN billing text NOT NULL DEFAULT 'paid' CHECK (billing IN ('free','paid'));
