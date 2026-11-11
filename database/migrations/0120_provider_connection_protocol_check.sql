ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_protocol_check CHECK (protocol IN ('openai-compatible','anthropic-compatible')) NOT VALID;
