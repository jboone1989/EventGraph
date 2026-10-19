-- Credentials are encrypted by the backend; the encryption key stays outside PostgreSQL.
CREATE TABLE provider_connections (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 vendor text NOT NULL,
 protocol text NOT NULL CHECK (protocol = 'openai-compatible'),
 base_url text NOT NULL,
 timeout_ms integer NOT NULL DEFAULT 60000 CHECK (timeout_ms BETWEEN 1000 AND 600000),
 enabled boolean NOT NULL DEFAULT false,
 policy text NOT NULL DEFAULT 'none' CHECK (policy IN ('none','nvidia-free-trial')),
 credential_env text,
 credential_secret text,
 credential_version integer NOT NULL DEFAULT 1,
 version integer NOT NULL DEFAULT 1,
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (credential_env IS NULL OR credential_secret IS NULL)
);
