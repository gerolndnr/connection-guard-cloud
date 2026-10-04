-- Dashboard-managed configuration per install.
-- values_json holds non-secret values. New secrets are AES-GCM encrypted in secrets_enc
-- and deleted as soon as the plugin reports the version as applied.
CREATE TABLE install_configs (
  install_id TEXT PRIMARY KEY REFERENCES installs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  reset INTEGER NOT NULL DEFAULT 0,
  values_json TEXT NOT NULL DEFAULT '{}',
  secret_paths_json TEXT NOT NULL DEFAULT '[]',
  keep_secrets_json TEXT NOT NULL DEFAULT '[]',
  secrets_enc BLOB,
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL,
  applied_version INTEGER NOT NULL DEFAULT 0,
  applied_at INTEGER,
  error_version INTEGER,
  error_message TEXT
) WITHOUT ROWID;

-- Set while someone has the settings page open, so plugins sync faster for a few minutes.
ALTER TABLE networks ADD COLUMN watched_until INTEGER NOT NULL DEFAULT 0;
