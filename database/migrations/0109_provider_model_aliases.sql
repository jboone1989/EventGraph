-- Old references resolve to exactly one model, independent of its editable name or connection.
CREATE TABLE provider_model_aliases (
 vendor text NOT NULL,
 model_id text NOT NULL,
 registered_model_id uuid NOT NULL REFERENCES registered_models(id) ON DELETE CASCADE,
 PRIMARY KEY (vendor, model_id),
 UNIQUE (registered_model_id)
);
