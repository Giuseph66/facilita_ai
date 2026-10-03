-- Several Ollama Cloud keys per person, tried in order, each with its last known usage.
ALTER TABLE ai_connections DROP CONSTRAINT IF EXISTS ai_connections_user_id_provider_key;

ALTER TABLE ai_connections
  ADD COLUMN label text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 60),
  ADD COLUMN position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- Last answer from ollama.com/api/usage, normalised to { windows: [{ name, used }] } (used is 0..1).
  ADD COLUMN usage_snapshot jsonb,
  ADD COLUMN usage_checked_at timestamptz,
  ADD COLUMN last_used_at timestamptz,
  -- Set when the provider refused the key for quota; cleared once usage shows room again.
  ADD COLUMN exhausted_at timestamptz;

CREATE INDEX ai_connections_user_order_idx ON ai_connections (user_id, position, created_at);
