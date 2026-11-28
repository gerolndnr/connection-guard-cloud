-- Intel Cloud (Player Intelligence, a separate service bound to this Worker; see docs/INTEL_CLOUD.md).
-- Intel Cloud reads both tables through its read-only CG binding; only this Worker writes them.

-- Network keys for the Intel Cloud API (intel-cloud.connectionguard.net). Shown once; only the hash is stored.
CREATE TABLE network_api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hint TEXT NOT NULL,                -- the key's last four characters, to tell keys apart in the dashboard
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX network_api_keys_network ON network_api_keys(network_id);

-- A network's choice about contributing to Player Intelligence. No row: contributing (the default for linked networks
-- that accepted the agreement version covering it, INTEL_SINCE_DPA).
CREATE TABLE network_intel (
  network_id TEXT PRIMARY KEY REFERENCES networks(id) ON DELETE CASCADE,
  contribute INTEGER NOT NULL CHECK (contribute IN (0, 1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);
