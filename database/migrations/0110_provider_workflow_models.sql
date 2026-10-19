-- A setting and this reference are changed in the same transaction.
CREATE TABLE provider_workflow_models (
 setting_key text PRIMARY KEY REFERENCES settings(key) ON DELETE CASCADE,
 model_id uuid NOT NULL REFERENCES registered_models(id) ON DELETE RESTRICT
);
